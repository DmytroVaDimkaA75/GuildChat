const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createTelegramBindingCode,
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
