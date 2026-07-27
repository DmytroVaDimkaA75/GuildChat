const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createTelegramBindingCode,
  createTelegramBindingFunctions,
  createTelegramBindingProof,
  createTelegramWebhookSecret,
  getTelegramChannelIndexKey,
  hashTelegramBindingCode,
  isValidTelegramBinding,
  normalizeTelegramNumericChatId,
  parseTelegramBindCommand,
  timingSafeStringEqual,
} = require("./telegramBinding");

test("binding codes use the non-ambiguous 12-character alphabet", () => {
  const codes = new Set();
  for (let index = 0; index < 100; index += 1) {
    const code = createTelegramBindingCode();
    assert.match(code, /^[A-HJ-NP-Z2-9]{12}$/);
    codes.add(code);
  }
  assert.equal(codes.size, 100);
});

test("bind parser accepts channel commands and rejects malformed values", () => {
  assert.deepEqual(parseTelegramBindCommand("/bind ABCDEFGH2345"), {
    botUsername: "",
    code: "ABCDEFGH2345",
  });
  assert.deepEqual(
    parseTelegramBindCommand("/bind@GuildChatBot abcdefgh2345"),
    {
      botUsername: "GuildChatBot",
      code: "ABCDEFGH2345",
    }
  );
  assert.equal(parseTelegramBindCommand("/bind ABCD"), null);
  assert.equal(parseTelegramBindCommand("text /bind ABCDEFGH2345"), null);
  assert.equal(parseTelegramBindCommand("/bind ABCDEFGH2345 trailing"), null);
  assert.equal(parseTelegramBindCommand("/bind ABCDEFGH2341"), null);
});

test("binding code hashes are normalized but do not expose the code", () => {
  const lower = hashTelegramBindingCode("abcdefgh2345");
  const upper = hashTelegramBindingCode("ABCDEFGH2345");
  assert.equal(lower, upper);
  assert.match(lower, /^[a-f0-9]{64}$/);
  assert.notEqual(lower, "ABCDEFGH2345");
});

test("numeric Telegram chat IDs are validated as safe integers", () => {
  assert.equal(normalizeTelegramNumericChatId("-1001234567890"), "-1001234567890");
  assert.equal(normalizeTelegramNumericChatId(123456), "123456");
  assert.equal(normalizeTelegramNumericChatId("@channel"), "");
  assert.equal(normalizeTelegramNumericChatId("0"), "");
  assert.equal(normalizeTelegramNumericChatId("01"), "");
  assert.equal(normalizeTelegramNumericChatId("9007199254740992"), "");
});

test("channel index keys are deterministic and Firebase-safe", () => {
  assert.equal(
    getTelegramChannelIndexKey("-1001234567890"),
    "negative_1001234567890"
  );
  assert.equal(getTelegramChannelIndexKey("12345"), "positive_12345");
  assert.equal(getTelegramChannelIndexKey("@channel"), "");
});

test("binding proof is tied to token, guild, chat, bot and version", () => {
  const token = "123456:secret";
  const binding = {
    status: "connected",
    chatId: "-1001234567890",
    botId: "123456",
    bindingVersion: "version-1",
  };
  binding.bindingProof = createTelegramBindingProof({
    token,
    guildId: "en_1_42",
    chatId: binding.chatId,
    botId: binding.botId,
    bindingVersion: binding.bindingVersion,
  });

  assert.equal(
    isValidTelegramBinding({ token, guildId: "en_1_42", binding }),
    true
  );
  assert.equal(
    isValidTelegramBinding({ token, guildId: "en_1_43", binding }),
    false
  );
  assert.equal(
    isValidTelegramBinding({
      token,
      guildId: "en_1_42",
      binding: { ...binding, chatId: "-1009999999999" },
    }),
    false
  );
  assert.equal(
    isValidTelegramBinding({
      token: "different-token",
      guildId: "en_1_42",
      binding,
    }),
    false
  );
});

test("webhook secret is stable, token-specific and timing-safe comparable", () => {
  const first = createTelegramWebhookSecret("token-a");
  const second = createTelegramWebhookSecret("token-b");
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, second);
  assert.equal(timingSafeStringEqual(first, first), true);
  assert.equal(timingSafeStringEqual(first, second), false);
  assert.equal(timingSafeStringEqual(first, `${first}0`), false);
});

const createWebhookHarness = ({ codeExists = false } = {}) => {
  const token = "123456:test-token";
  const fetchCalls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    fetchCalls.push({
      url: String(url),
      body: JSON.parse(options?.body || "{}"),
    });
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: {} }),
    };
  };

  const database = () => ({
    ref: () => ({
      once: async () => ({
        exists: () => codeExists,
        val: () => null,
      }),
    }),
  });
  database.ServerValue = { TIMESTAMP: { ".sv": "timestamp" } };

  const passthrough = (_options, handler) => handler;
  const handlers = createTelegramBindingFunctions({
    admin: { database },
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    onCall: passthrough,
    onRequest: passthrough,
    telegramBotToken: { value: () => token },
  });

  const invokeWebhook = async (text) => {
    const response = {
      statusCode: 0,
      body: "",
      status(code) {
        this.statusCode = code;
        return this;
      },
      send(body) {
        this.body = body;
        return this;
      },
    };
    await handlers.telegramWebhook(
      {
        method: "POST",
        body: {
          update_id: 42,
          channel_post: {
            text,
            chat: {
              id: -1001234567890,
              type: "channel",
            },
          },
        },
        get: (header) =>
          header === "X-Telegram-Bot-Api-Secret-Token"
            ? createTelegramWebhookSecret(token)
            : "",
      },
      response
    );
    return response;
  };

  return {
    fetchCalls,
    invokeWebhook,
    restore: () => {
      global.fetch = originalFetch;
    },
  };
};

test("webhook replies when a bind command has an invalid format", async () => {
  const harness = createWebhookHarness();
  try {
    const response = await harness.invokeWebhook("/bind");
    assert.equal(response.statusCode, 200);
    assert.equal(response.body, "OK");
    assert.equal(harness.fetchCalls.length, 1);
    assert.match(harness.fetchCalls[0].url, /\/sendMessage$/);
    assert.match(
      harness.fetchCalls[0].body.text,
      /Неправильний формат команди/
    );
  } finally {
    harness.restore();
  }
});

test("webhook replies when a well-formed binding code is not found", async () => {
  const harness = createWebhookHarness();
  try {
    const response = await harness.invokeWebhook("/bind ABCDEFGH2345");
    assert.equal(response.statusCode, 200);
    assert.equal(harness.fetchCalls.length, 1);
    assert.match(harness.fetchCalls[0].body.text, /Код не знайдено/);
  } finally {
    harness.restore();
  }
});

const createSuccessfulWebhookHarness = () => {
  const token = "123456:test-token";
  const code = "ABCDEFGH2345";
  const codeHash = hashTelegramBindingCode(code);
  const guildId = "en_1_42";
  const userId = "user_42";
  const requestId = "request-42";
  const now = Date.now();
  const state = new Map([
    [
      `/telegramBot/bindingCodes/${codeHash}`,
      {
        guildId,
        requestedBy: userId,
        requestId,
        status: "pending",
        createdAt: now,
        expiresAt: now + 60000,
      },
    ],
    [
      `/telegramBot/pendingByGuild/${guildId}`,
      {
        codeHash,
        requestedBy: userId,
        requestId,
        status: "pending",
        createdAt: now,
        expiresAt: now + 60000,
      },
    ],
    [`/guilds/${guildId}/guildUsers/${userId}`, true],
    [`/users/${userId}/${guildId}/role`, "guildLeader"],
    [`/guilds/${guildId}/guildName`, "Test guild"],
  ]);
  const activeListeners = new Map();
  const fetchCalls = [];
  const originalFetch = global.fetch;

  const clone = (value) =>
    value === undefined ? undefined : structuredClone(value);
  const snapshot = (value) => ({
    exists: () => value !== undefined && value !== null,
    val: () => clone(value),
  });
  const setValue = (path, value) => {
    if (value === null || value === undefined) {
      state.delete(path);
    } else {
      state.set(path, clone(value));
    }
  };

  const createRef = (path = "") => ({
    child(childPath) {
      return createRef(`${path}/${childPath}`.replace(/\/+/g, "/"));
    },
    async once() {
      return snapshot(state.get(path));
    },
    on(_eventType, listener) {
      activeListeners.set(path, listener);
      listener(snapshot(state.get(path)));
      return listener;
    },
    off(_eventType, listener) {
      if (activeListeners.get(path) === listener) {
        activeListeners.delete(path);
      }
    },
    async transaction(updateValue) {
      const current = activeListeners.has(path) ? state.get(path) : null;
      const next = updateValue(clone(current));
      if (next === undefined) {
        return {
          committed: false,
          snapshot: snapshot(state.get(path)),
        };
      }
      setValue(path, next);
      return {
        committed: true,
        snapshot: snapshot(next),
      };
    },
    async update(values) {
      if (!path) {
        for (const [updatePath, value] of Object.entries(values)) {
          setValue(updatePath, value);
        }
        return;
      }
      const current = state.get(path);
      setValue(path, {
        ...(current && typeof current === "object" ? current : {}),
        ...clone(values),
      });
    },
  });

  const database = () => ({
    ref: (path = "") => createRef(path),
  });
  database.ServerValue = { TIMESTAMP: { ".sv": "timestamp" } };

  global.fetch = async (url, options) => {
    const method = String(url).split("/").pop();
    fetchCalls.push({
      method,
      body: JSON.parse(options?.body || "{}"),
    });
    const result =
      method === "getMe"
        ? { id: 123456, username: "FoeGuildChatbot" }
        : method === "getChatMember"
          ? { status: "administrator", can_post_messages: true }
          : {};
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result }),
    };
  };

  const passthrough = (_options, handler) => handler;
  const handlers = createTelegramBindingFunctions({
    admin: { database },
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    onCall: passthrough,
    onRequest: passthrough,
    telegramBotToken: { value: () => token },
  });

  return {
    async invoke() {
      const response = {
        statusCode: 0,
        status(codeValue) {
          this.statusCode = codeValue;
          return this;
        },
        send() {
          return this;
        },
      };
      await handlers.telegramWebhook(
        {
          method: "POST",
          body: {
            update_id: 43,
            channel_post: {
              text: `/bind ${code}`,
              chat: {
                id: -1001234567890,
                type: "channel",
                title: "Test channel",
              },
            },
          },
          get: (header) =>
            header === "X-Telegram-Bot-Api-Secret-Token"
              ? createTelegramWebhookSecret(token)
              : "",
        },
        response
      );
      return response;
    },
    getPublicBinding: () =>
      state.get(`/guilds/${guildId}/setting/telegram`),
    fetchCalls,
    restore: () => {
      global.fetch = originalFetch;
    },
  };
};

test("webhook claims a valid code from a cold RTDB transaction cache", async () => {
  const harness = createSuccessfulWebhookHarness();
  try {
    const response = await harness.invoke();
    assert.equal(response.statusCode, 200);
    assert.equal(harness.getPublicBinding()?.status, "connected");
    assert.deepEqual(
      harness.fetchCalls.map(({ method }) => method),
      ["getMe", "getChatMember", "sendMessage"]
    );
    assert.match(
      harness.fetchCalls.at(-1).body.text,
      /Канал успішно прив’язано/
    );
  } finally {
    harness.restore();
  }
});
