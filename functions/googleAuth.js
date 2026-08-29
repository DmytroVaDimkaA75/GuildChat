const crypto = require("node:crypto");
const { Buffer } = require("node:buffer");
const { OAuth2Client } = require("google-auth-library");

const FUNCTIONS_REGION = "europe-west1";
const GOOGLE_PROVIDER_ID = "google.com";
const MAX_ACCESS_CODE_LENGTH = 2048;
const MAX_GOOGLE_ID_TOKEN_LENGTH = 16 * 1024;
const MAX_FIREBASE_UID_BYTES = 128;

const GENERIC_MESSAGES = Object.freeze({
  invalidRequest: "Invalid authentication request.",
  legacyAuthenticationFailed: "Account authentication failed.",
  authenticationRequired: "Authentication is required.",
  accountUnavailable: "Account is unavailable.",
  googleAuthenticationFailed: "Google authentication failed.",
  googleNotLinked: "Google account is not linked.",
  serviceUnavailable: "Authentication service is unavailable.",
});

const isRecord = (value) => (
  value !== null && typeof value === "object" && !Array.isArray(value)
);

const isValidFirebaseUid = (value) => {
  if (typeof value !== "string" || !value) return false;
  return (
    Buffer.byteLength(value, "utf8") <= MAX_FIREBASE_UID_BYTES &&
    !/[.#$\[\]\/\u0000-\u001F\u007F]/u.test(value)
  );
};

const normalizeExpectedUserId = (value) => {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!isValidFirebaseUid(normalized)) return null;
  return normalized;
};

const isValidAccessCode = (value) => (
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= MAX_ACCESS_CODE_LENGTH &&
  value.trim().length > 0
);

const isValidGoogleIdToken = (value) => (
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= MAX_GOOGLE_ID_TOKEN_LENGTH &&
  value.trim().length === value.length
);

const timingSafeStringEqual = (left, right) => {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftDigest = crypto.createHash("sha256").update(left, "utf8").digest();
  const rightDigest = crypto.createHash("sha256").update(right, "utf8").digest();
  return crypto.timingSafeEqual(leftDigest, rightDigest);
};

const findLegacyUserIdByAccessCode = (users, accessCode) => {
  if (!isRecord(users) || !isValidAccessCode(accessCode)) return "";

  const matchingUserIds = Object.entries(users)
    .filter(([userId, user]) => (
      isValidFirebaseUid(userId) &&
      isRecord(user) &&
      timingSafeStringEqual(user.password, accessCode)
    ))
    .map(([userId]) => userId);

  return matchingUserIds.length === 1 ? matchingUserIds[0] : "";
};

const getGoogleProviderData = (userRecord, expectedProviderUid = "") => {
  const providers = Array.isArray(userRecord?.providerData)
    ? userRecord.providerData
    : [];
  return providers.find((provider) => (
    provider?.providerId === GOOGLE_PROVIDER_ID &&
    (!expectedProviderUid || provider?.uid === expectedProviderUid)
  )) || null;
};

const getParameterValue = (parameter) => {
  if (typeof parameter === "string") return parameter.trim();
  if (parameter && typeof parameter.value === "function") {
    return String(parameter.value() || "").trim();
  }
  return "";
};

const isHttpsError = (error, HttpsError) => (
  error instanceof HttpsError ||
  (typeof error?.code === "string" && error.code.startsWith("functions/"))
);

const createDefaultGoogleIdTokenVerifier = () => {
  const client = new OAuth2Client();
  return async ({ idToken, audience }) => {
    const ticket = await client.verifyIdToken({ idToken, audience });
    return ticket.getPayload() || null;
  };
};

const createGoogleAuthFunctions = ({
  admin,
  HttpsError,
  onCall,
  googleWebClientId,
  verifyGoogleIdToken = createDefaultGoogleIdTokenVerifier(),
  region = FUNCTIONS_REGION,
}) => {
  if (!admin || typeof admin.auth !== "function" || typeof admin.database !== "function") {
    throw new TypeError("A Firebase Admin instance is required.");
  }
  if (typeof HttpsError !== "function" || typeof onCall !== "function") {
    throw new TypeError("Cloud Functions callable dependencies are required.");
  }
  if (typeof verifyGoogleIdToken !== "function") {
    throw new TypeError("A Google ID token verifier is required.");
  }

  const callable = (handler) => onCall({ region }, async (request) => {
    try {
      return await handler(request || {});
    } catch (error) {
      if (isHttpsError(error, HttpsError)) throw error;
      throw new HttpsError("internal", GENERIC_MESSAGES.serviceUnavailable);
    }
  });

  const requireAuthenticatedUserId = (request) => {
    const userId = typeof request.auth?.uid === "string"
      ? request.auth.uid
      : "";
    if (!isValidFirebaseUid(userId)) {
      throw new HttpsError(
        "unauthenticated",
        GENERIC_MESSAGES.authenticationRequired
      );
    }
    return userId;
  };

  const verifyExpectedLegacyAccount = async ({ userId, accessCode }) => {
    const passwordSnapshot = await admin.database()
      .ref(`users/${userId}/password`)
      .once("value");
    const storedAccessCode = passwordSnapshot.exists()
      ? passwordSnapshot.val()
      : null;
    return timingSafeStringEqual(storedAccessCode, accessCode);
  };

  const authenticateLegacyAccount = callable(async (request) => {
    const accessCode = request.data?.accessCode;
    const expectedUserId = normalizeExpectedUserId(
      request.data?.expectedUserId
    );
    if (!isValidAccessCode(accessCode) || expectedUserId === null) {
      throw new HttpsError("invalid-argument", GENERIC_MESSAGES.invalidRequest);
    }

    let userId = expectedUserId;
    if (userId) {
      const matches = await verifyExpectedLegacyAccount({ userId, accessCode });
      if (!matches) {
        throw new HttpsError(
          "unauthenticated",
          GENERIC_MESSAGES.legacyAuthenticationFailed
        );
      }
    } else {
      const usersSnapshot = await admin.database()
        .ref("users")
        .orderByChild("password")
        .equalTo(accessCode)
        .limitToFirst(2)
        .once("value");
      userId = usersSnapshot.exists()
        ? findLegacyUserIdByAccessCode(usersSnapshot.val(), accessCode)
        : "";
      if (!userId) {
        throw new HttpsError(
          "unauthenticated",
          GENERIC_MESSAGES.legacyAuthenticationFailed
        );
      }
    }

    const customToken = await admin.auth().createCustomToken(userId);
    return { userId, customToken };
  });

  const getGoogleLinkStatus = callable(async (request) => {
    const userId = requireAuthenticatedUserId(request);
    const [userSnapshot, authUser] = await Promise.all([
      admin.database().ref(`users/${userId}`).once("value"),
      admin.auth().getUser(userId),
    ]);
    if (!userSnapshot.exists()) {
      throw new HttpsError(
        "permission-denied",
        GENERIC_MESSAGES.accountUnavailable
      );
    }
    if (authUser.disabled) {
      throw new HttpsError(
        "permission-denied",
        GENERIC_MESSAGES.accountUnavailable
      );
    }

    const googleProvider = getGoogleProviderData(authUser);
    return {
      userId,
      linked: Boolean(googleProvider),
      email: googleProvider && typeof googleProvider.email === "string"
        ? googleProvider.email
        : "",
      displayName:
        googleProvider && typeof googleProvider.displayName === "string"
          ? googleProvider.displayName
          : "",
    };
  });

  const loginWithGoogle = callable(async (request) => {
    const idToken = request.data?.idToken;
    if (!isValidGoogleIdToken(idToken)) {
      throw new HttpsError("invalid-argument", GENERIC_MESSAGES.invalidRequest);
    }

    const audience = getParameterValue(googleWebClientId);
    if (!audience) {
      throw new HttpsError("internal", GENERIC_MESSAGES.serviceUnavailable);
    }

    let payload;
    try {
      payload = await verifyGoogleIdToken({ idToken, audience });
    } catch (_error) {
      throw new HttpsError(
        "unauthenticated",
        GENERIC_MESSAGES.googleAuthenticationFailed
      );
    }

    const googleSubject = typeof payload?.sub === "string"
      ? payload.sub
      : "";
    if (!googleSubject || payload?.aud !== audience) {
      throw new HttpsError(
        "unauthenticated",
        GENERIC_MESSAGES.googleAuthenticationFailed
      );
    }

    const lookup = await admin.auth().getUsers([{
      providerId: GOOGLE_PROVIDER_ID,
      providerUid: googleSubject,
    }]);
    if (!Array.isArray(lookup?.users) || lookup.users.length !== 1) {
      throw new HttpsError(
        "failed-precondition",
        GENERIC_MESSAGES.googleNotLinked
      );
    }

    const authUser = lookup.users[0];
    const userId = typeof authUser?.uid === "string" ? authUser.uid : "";
    if (
      !isValidFirebaseUid(userId) ||
      !getGoogleProviderData(authUser, googleSubject)
    ) {
      throw new HttpsError(
        "failed-precondition",
        GENERIC_MESSAGES.googleNotLinked
      );
    }
    if (authUser.disabled) {
      throw new HttpsError(
        "failed-precondition",
        GENERIC_MESSAGES.googleNotLinked
      );
    }

    const userSnapshot = await admin.database()
      .ref(`users/${userId}`)
      .once("value");
    if (!userSnapshot.exists()) {
      throw new HttpsError(
        "failed-precondition",
        GENERIC_MESSAGES.googleNotLinked
      );
    }

    const customToken = await admin.auth().createCustomToken(userId);
    return { userId, customToken };
  });

  const unlinkGoogleAccount = callable(async (request) => {
    const userId = requireAuthenticatedUserId(request);
    const accessCode = request.data?.accessCode;
    if (!isValidAccessCode(accessCode)) {
      throw new HttpsError("invalid-argument", GENERIC_MESSAGES.invalidRequest);
    }

    const matches = await verifyExpectedLegacyAccount({ userId, accessCode });
    if (!matches) {
      throw new HttpsError(
        "unauthenticated",
        GENERIC_MESSAGES.legacyAuthenticationFailed
      );
    }

    const authUser = await admin.auth().getUser(userId);
    if (authUser.disabled) {
      throw new HttpsError(
        "permission-denied",
        GENERIC_MESSAGES.accountUnavailable
      );
    }
    if (!getGoogleProviderData(authUser)) return { linked: false };

    await admin.auth().updateUser(userId, {
      providersToUnlink: [GOOGLE_PROVIDER_ID],
    });
    return { linked: false };
  });

  return {
    authenticateLegacyAccount,
    getGoogleLinkStatus,
    loginWithGoogle,
    unlinkGoogleAccount,
  };
};

module.exports = {
  FUNCTIONS_REGION,
  GENERIC_MESSAGES,
  GOOGLE_PROVIDER_ID,
  createDefaultGoogleIdTokenVerifier,
  createGoogleAuthFunctions,
  findLegacyUserIdByAccessCode,
  getGoogleProviderData,
  isValidAccessCode,
  isValidFirebaseUid,
  isValidGoogleIdToken,
  normalizeExpectedUserId,
  timingSafeStringEqual,
};
