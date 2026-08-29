const assert = require("node:assert/strict");
const test = require("node:test");
const {
  GOOGLE_PROVIDER_ID,
  createGoogleAuthFunctions,
  findLegacyUserIdByAccessCode,
  getGoogleProviderData,
  isValidFirebaseUid,
  normalizeExpectedUserId,
  timingSafeStringEqual,
} = require("./googleAuth");

class TestHttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const snapshot = (value) => ({
  exists: () => value !== undefined && value !== null,
  val: () => value,
});

const createAdminMock = ({
  values = {},
  authUsers = {},
  providerUsers = [],
  customTokenFor = (uid) => `custom:${uid}`,
} = {}) => {
  const calls = {
    createCustomToken: [],
    getUser: [],
    getUsers: [],
    reads: [],
    queries: [],
    updateUser: [],
  };

  const auth = {
    createCustomToken: async (uid) => {
      calls.createCustomToken.push(uid);
      return customTokenFor(uid);
    },
    getUser: async (uid) => {
      calls.getUser.push(uid);
      if (!Object.prototype.hasOwnProperty.call(authUsers, uid)) {
        throw new Error("auth user missing");
      }
      return authUsers[uid];
    },
    getUsers: async (identifiers) => {
      calls.getUsers.push(identifiers);
      return { users: providerUsers, notFound: [] };
    },
    updateUser: async (uid, update) => {
      calls.updateUser.push({ uid, update });
      return { uid, ...update };
    },
  };

  const database = () => ({
    ref: (path) => {
      const query = {
        orderByChild: (child) => {
          calls.queries.push({ operation: "orderByChild", value: child });
          return query;
        },
        equalTo: (value) => {
          calls.queries.push({ operation: "equalTo", value });
          return query;
        },
        limitToFirst: (value) => {
          calls.queries.push({ operation: "limitToFirst", value });
          return query;
        },
        once: async (event) => {
          assert.equal(event, "value");
          calls.reads.push(path);
          return snapshot(values[path]);
        },
      };
      return query;
    },
  });

  return {
    admin: {
      auth: () => auth,
      database,
    },
    calls,
  };
};

const createHandlers = ({
  admin,
  googleWebClientId = "web-client.apps.googleusercontent.com",
  verifyGoogleIdToken = async () => ({
    aud: googleWebClientId,
    sub: "google-subject",
  }),
  onCall = (_options, handler) => handler,
} = {}) => createGoogleAuthFunctions({
  admin,
  HttpsError: TestHttpsError,
  onCall,
  googleWebClientId,
  verifyGoogleIdToken,
});

const rejectsWithCode = (code) => (error) => {
  assert.equal(error.code, code);
  return true;
};

test("legacy access codes use exact timing-safe comparison", () => {
  assert.equal(timingSafeStringEqual(" exact-code ", " exact-code "), true);
  assert.equal(timingSafeStringEqual("exact-code", "exact-code "), false);
  assert.equal(timingSafeStringEqual("EXACT-CODE", "exact-code"), false);
  assert.equal(timingSafeStringEqual(null, "exact-code"), false);
});

test("legacy access-code lookup requires exactly one matching account", () => {
  assert.equal(findLegacyUserIdByAccessCode({
    user_1: { password: "first" },
    user_2: { password: "second" },
  }, "second"), "user_2");

  assert.equal(findLegacyUserIdByAccessCode({
    user_1: { password: "duplicate" },
    user_2: { password: "duplicate" },
  }, "duplicate"), "");
  assert.equal(findLegacyUserIdByAccessCode({}, "missing"), "");
});

test("legacy user IDs are valid for both Firebase Auth and RTDB paths", () => {
  assert.equal(isValidFirebaseUid("8614414"), true);
  assert.equal(isValidFirebaseUid("guild-user_42"), true);
  assert.equal(isValidFirebaseUid("bad/user"), false);
  assert.equal(isValidFirebaseUid("bad.user"), false);
  assert.equal(isValidFirebaseUid("bad\u0000user"), false);
  assert.equal(isValidFirebaseUid("bad\u007fuser"), false);
  assert.equal(isValidFirebaseUid("x".repeat(129)), false);
  assert.equal(normalizeExpectedUserId(" 8614414 "), "8614414");
  assert.equal(normalizeExpectedUserId("bad/user"), null);
});

test("Google provider lookup never falls back to email", () => {
  const user = {
    providerData: [
      { providerId: "password", uid: "same@example.com", email: "same@example.com" },
      { providerId: GOOGLE_PROVIDER_ID, uid: "google-subject", email: "same@example.com" },
    ],
  };
  assert.equal(getGoogleProviderData(user)?.uid, "google-subject");
  assert.equal(getGoogleProviderData(user, "other-subject"), null);
});

test("factory registers every callable in europe-west1", () => {
  const { admin } = createAdminMock();
  const options = [];
  createHandlers({
    admin,
    onCall: (callableOptions, handler) => {
      options.push(callableOptions);
      return handler;
    },
  });
  assert.equal(options.length, 4);
  options.forEach((value) => assert.deepEqual(value, { region: "europe-west1" }));
});

test("authenticateLegacyAccount verifies an expected user at the narrow password path", async () => {
  const { admin, calls } = createAdminMock({
    values: { "users/8614414/password": "legacy-code" },
  });
  const handlers = createHandlers({ admin });

  const result = await handlers.authenticateLegacyAccount({
    data: { accessCode: "legacy-code", expectedUserId: "8614414" },
  });

  assert.deepEqual(result, {
    userId: "8614414",
    customToken: "custom:8614414",
  });
  assert.deepEqual(calls.reads, ["users/8614414/password"]);
  assert.deepEqual(calls.createCustomToken, ["8614414"]);
});

test("authenticateLegacyAccount supports the current access-code-only login", async () => {
  const { admin, calls } = createAdminMock({
    values: {
      users: {
        user_1: { password: "first" },
        user_2: { password: "legacy-code" },
      },
    },
  });
  const handlers = createHandlers({ admin });

  const result = await handlers.authenticateLegacyAccount({
    data: { accessCode: "legacy-code" },
  });

  assert.equal(result.userId, "user_2");
  assert.equal(result.customToken, "custom:user_2");
  assert.deepEqual(calls.reads, ["users"]);
  assert.deepEqual(calls.queries, [
    { operation: "orderByChild", value: "password" },
    { operation: "equalTo", value: "legacy-code" },
    { operation: "limitToFirst", value: 2 },
  ]);
});

test("authenticateLegacyAccount rejects wrong and duplicate access codes generically", async () => {
  const expected = createAdminMock({
    values: { "users/user_1/password": "stored-code" },
  });
  const expectedHandlers = createHandlers({ admin: expected.admin });
  await assert.rejects(
    expectedHandlers.authenticateLegacyAccount({
      data: { accessCode: "wrong-code", expectedUserId: "user_1" },
    }),
    rejectsWithCode("unauthenticated")
  );
  assert.deepEqual(expected.calls.createCustomToken, []);

  const duplicate = createAdminMock({
    values: {
      users: {
        user_1: { password: "duplicate" },
        user_2: { password: "duplicate" },
      },
    },
  });
  const duplicateHandlers = createHandlers({ admin: duplicate.admin });
  await assert.rejects(
    duplicateHandlers.authenticateLegacyAccount({
      data: { accessCode: "duplicate" },
    }),
    rejectsWithCode("unauthenticated")
  );
  assert.deepEqual(duplicate.calls.createCustomToken, []);
});

test("authenticateLegacyAccount rejects malformed input without reading users", async () => {
  const { admin, calls } = createAdminMock();
  const handlers = createHandlers({ admin });
  await assert.rejects(
    handlers.authenticateLegacyAccount({ data: { accessCode: "" } }),
    rejectsWithCode("invalid-argument")
  );
  await assert.rejects(
    handlers.authenticateLegacyAccount({
      data: { accessCode: "code", expectedUserId: "bad/user" },
    }),
    rejectsWithCode("invalid-argument")
  );
  assert.deepEqual(calls.reads, []);
});

test("getGoogleLinkStatus is auth-only and returns only the caller provider status", async () => {
  const { admin } = createAdminMock({
    values: { "users/user_1": { userName: "Player" } },
    authUsers: {
      user_1: {
        uid: "user_1",
        providerData: [{
          providerId: GOOGLE_PROVIDER_ID,
          uid: "google-subject",
          email: "player@example.com",
          displayName: "Player One",
        }],
      },
    },
  });
  const handlers = createHandlers({ admin });

  await assert.rejects(
    handlers.getGoogleLinkStatus({ data: {} }),
    rejectsWithCode("unauthenticated")
  );
  assert.deepEqual(
    await handlers.getGoogleLinkStatus({ auth: { uid: "user_1" }, data: {} }),
    {
      userId: "user_1",
      linked: true,
      email: "player@example.com",
      displayName: "Player One",
    }
  );
});

test("getGoogleLinkStatus rejects authenticated users without a legacy account", async () => {
  const { admin } = createAdminMock({
    authUsers: {
      orphan: { uid: "orphan", providerData: [] },
    },
  });
  const handlers = createHandlers({ admin });
  await assert.rejects(
    handlers.getGoogleLinkStatus({ auth: { uid: "orphan" }, data: {} }),
    rejectsWithCode("permission-denied")
  );
});

test("getGoogleLinkStatus rejects a disabled Firebase Auth user", async () => {
  const { admin } = createAdminMock({
    values: { "users/user_1": { userName: "Player" } },
    authUsers: {
      user_1: {
        uid: "user_1",
        disabled: true,
        providerData: [{
          providerId: GOOGLE_PROVIDER_ID,
          uid: "google-subject",
        }],
      },
    },
  });
  const handlers = createHandlers({ admin });

  await assert.rejects(
    handlers.getGoogleLinkStatus({ auth: { uid: "user_1" }, data: {} }),
    rejectsWithCode("permission-denied")
  );
});

test("loginWithGoogle verifies exact audience and resolves by provider subject", async () => {
  const authUser = {
    uid: "user_1",
    providerData: [{
      providerId: GOOGLE_PROVIDER_ID,
      uid: "google-subject",
      email: "player@example.com",
    }],
  };
  const { admin, calls } = createAdminMock({
    values: { "users/user_1": { userName: "Player" } },
    providerUsers: [authUser],
  });
  const verificationCalls = [];
  const handlers = createHandlers({
    admin,
    verifyGoogleIdToken: async (value) => {
      verificationCalls.push(value);
      return {
        aud: "web-client.apps.googleusercontent.com",
        sub: "google-subject",
        email: "different@example.com",
      };
    },
  });

  const result = await handlers.loginWithGoogle({
    data: { idToken: "header.payload.signature" },
  });

  assert.deepEqual(verificationCalls, [{
    idToken: "header.payload.signature",
    audience: "web-client.apps.googleusercontent.com",
  }]);
  assert.deepEqual(calls.getUsers, [[{
    providerId: GOOGLE_PROVIDER_ID,
    providerUid: "google-subject",
  }]]);
  assert.deepEqual(result, {
    userId: "user_1",
    customToken: "custom:user_1",
  });
});

test("loginWithGoogle rejects a token for a different audience before lookup", async () => {
  const { admin, calls } = createAdminMock();
  const handlers = createHandlers({
    admin,
    verifyGoogleIdToken: async () => ({
      aud: "other-client.apps.googleusercontent.com",
      sub: "google-subject",
    }),
  });

  await assert.rejects(
    handlers.loginWithGoogle({ data: { idToken: "header.payload.signature" } }),
    rejectsWithCode("unauthenticated")
  );
  assert.deepEqual(calls.getUsers, []);
});

test("loginWithGoogle rejects a missing server audience before token verification", async () => {
  const { admin, calls } = createAdminMock();
  let verificationCount = 0;
  const handlers = createHandlers({
    admin,
    googleWebClientId: "",
    verifyGoogleIdToken: async () => {
      verificationCount += 1;
      return { aud: "", sub: "google-subject" };
    },
  });

  await assert.rejects(
    handlers.loginWithGoogle({ data: { idToken: "header.payload.signature" } }),
    rejectsWithCode("internal")
  );
  assert.equal(verificationCount, 0);
  assert.deepEqual(calls.getUsers, []);
  assert.deepEqual(calls.createCustomToken, []);
});

test("loginWithGoogle converts verifier rejection to a generic authentication error", async () => {
  const { admin, calls } = createAdminMock();
  const handlers = createHandlers({
    admin,
    verifyGoogleIdToken: async () => {
      throw new Error("sensitive token verification detail");
    },
  });

  await assert.rejects(
    handlers.loginWithGoogle({ data: { idToken: "header.payload.signature" } }),
    (error) => {
      assert.equal(error.code, "unauthenticated");
      assert.doesNotMatch(error.message, /sensitive token verification detail/);
      return true;
    }
  );
  assert.deepEqual(calls.getUsers, []);
  assert.deepEqual(calls.createCustomToken, []);
});

test("loginWithGoogle rejects malformed tokens before invoking the verifier", async () => {
  const { admin, calls } = createAdminMock();
  let verificationCount = 0;
  const handlers = createHandlers({
    admin,
    verifyGoogleIdToken: async () => {
      verificationCount += 1;
      return {
        aud: "web-client.apps.googleusercontent.com",
        sub: "google-subject",
      };
    },
  });

  await assert.rejects(
    handlers.loginWithGoogle({ data: { idToken: " token-with-spaces " } }),
    rejectsWithCode("invalid-argument")
  );
  assert.equal(verificationCount, 0);
  assert.deepEqual(calls.getUsers, []);
});

test("loginWithGoogle rejects unlinked and mismatched provider identities", async () => {
  const unlinked = createAdminMock({ providerUsers: [] });
  const unlinkedHandlers = createHandlers({ admin: unlinked.admin });
  await assert.rejects(
    unlinkedHandlers.loginWithGoogle({
      data: { idToken: "header.payload.signature" },
    }),
    rejectsWithCode("failed-precondition")
  );

  const mismatched = createAdminMock({
    providerUsers: [{
      uid: "user_1",
      providerData: [{
        providerId: GOOGLE_PROVIDER_ID,
        uid: "different-subject",
        email: "same@example.com",
      }],
    }],
  });
  const mismatchedHandlers = createHandlers({ admin: mismatched.admin });
  await assert.rejects(
    mismatchedHandlers.loginWithGoogle({
      data: { idToken: "header.payload.signature" },
    }),
    rejectsWithCode("failed-precondition")
  );
});

test("loginWithGoogle rejects a linked Auth provider without a legacy RTDB user", async () => {
  const { admin, calls } = createAdminMock({
    providerUsers: [{
      uid: "user_1",
      providerData: [{
        providerId: GOOGLE_PROVIDER_ID,
        uid: "google-subject",
      }],
    }],
  });
  const handlers = createHandlers({ admin });
  await assert.rejects(
    handlers.loginWithGoogle({
      data: { idToken: "header.payload.signature" },
    }),
    rejectsWithCode("failed-precondition")
  );
  assert.deepEqual(calls.createCustomToken, []);
});

test("loginWithGoogle rejects a disabled linked Firebase Auth user", async () => {
  const { admin, calls } = createAdminMock({
    values: { "users/user_1": { userName: "Player" } },
    providerUsers: [{
      uid: "user_1",
      disabled: true,
      providerData: [{
        providerId: GOOGLE_PROVIDER_ID,
        uid: "google-subject",
      }],
    }],
  });
  const handlers = createHandlers({ admin });

  await assert.rejects(
    handlers.loginWithGoogle({
      data: { idToken: "header.payload.signature" },
    }),
    rejectsWithCode("failed-precondition")
  );
  assert.deepEqual(calls.reads, []);
  assert.deepEqual(calls.createCustomToken, []);
});

test("unlinkGoogleAccount revalidates exact legacy code and unlinks only Google", async () => {
  const { admin, calls } = createAdminMock({
    values: { "users/user_1/password": "legacy-code" },
    authUsers: {
      user_1: {
        uid: "user_1",
        providerData: [
          { providerId: GOOGLE_PROVIDER_ID, uid: "google-subject" },
          { providerId: "password", uid: "player@example.com" },
        ],
      },
    },
  });
  const handlers = createHandlers({ admin });

  assert.deepEqual(await handlers.unlinkGoogleAccount({
    auth: { uid: "user_1" },
    data: { accessCode: "legacy-code" },
  }), { linked: false });
  assert.deepEqual(calls.updateUser, [{
    uid: "user_1",
    update: { providersToUnlink: [GOOGLE_PROVIDER_ID] },
  }]);
});

test("unlinkGoogleAccount rejects missing auth and wrong code without mutation", async () => {
  const { admin, calls } = createAdminMock({
    values: { "users/user_1/password": "legacy-code" },
  });
  const handlers = createHandlers({ admin });

  await assert.rejects(
    handlers.unlinkGoogleAccount({ data: { accessCode: "legacy-code" } }),
    rejectsWithCode("unauthenticated")
  );
  await assert.rejects(
    handlers.unlinkGoogleAccount({
      auth: { uid: "user_1" },
      data: { accessCode: "wrong-code" },
    }),
    rejectsWithCode("unauthenticated")
  );
  assert.deepEqual(calls.updateUser, []);
});

test("unlinkGoogleAccount is idempotent when Google is already unlinked", async () => {
  const { admin, calls } = createAdminMock({
    values: { "users/user_1/password": "legacy-code" },
    authUsers: {
      user_1: {
        uid: "user_1",
        providerData: [{
          providerId: "password",
          uid: "player@example.com",
        }],
      },
    },
  });
  const handlers = createHandlers({ admin });

  assert.deepEqual(await handlers.unlinkGoogleAccount({
    auth: { uid: "user_1" },
    data: { accessCode: "legacy-code" },
  }), { linked: false });
  assert.deepEqual(calls.updateUser, []);
});

test("unlinkGoogleAccount rejects a disabled Firebase Auth user without mutation", async () => {
  const { admin, calls } = createAdminMock({
    values: { "users/user_1/password": "legacy-code" },
    authUsers: {
      user_1: {
        uid: "user_1",
        disabled: true,
        providerData: [{
          providerId: GOOGLE_PROVIDER_ID,
          uid: "google-subject",
        }],
      },
    },
  });
  const handlers = createHandlers({ admin });

  await assert.rejects(
    handlers.unlinkGoogleAccount({
      auth: { uid: "user_1" },
      data: { accessCode: "legacy-code" },
    }),
    rejectsWithCode("permission-denied")
  );
  assert.deepEqual(calls.updateUser, []);
});

test("unexpected backend failures are converted to a generic internal error", async () => {
  const { admin } = createAdminMock({
    values: { "users/user_1/password": "legacy-code" },
    customTokenFor: () => {
      throw new Error("sensitive backend detail");
    },
  });
  const handlers = createHandlers({ admin });
  await assert.rejects(
    handlers.authenticateLegacyAccount({
      data: { accessCode: "legacy-code", expectedUserId: "user_1" },
    }),
    (error) => {
      assert.equal(error.code, "internal");
      assert.doesNotMatch(error.message, /sensitive backend detail/);
      return true;
    }
  );
});
