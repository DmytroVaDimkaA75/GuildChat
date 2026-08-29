const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildQuantumSectorNotification,
  collectUserFcmTokens,
  isQuantumSectorOpening,
} = require("./quantumNotifications");

test("only blocked to open is a quantum sector opening", () => {
  assert.equal(isQuantumSectorOpening("blocked", "open"), true);
  assert.equal(isQuantumSectorOpening("BLOCKED", " Open "), true);
  assert.equal(isQuantumSectorOpening("open", "open"), false);
  assert.equal(isQuantumSectorOpening("finished", "open"), false);
  assert.equal(isQuantumSectorOpening("blocked", "finished"), false);
});

test("collectUserFcmTokens deduplicates legacy and device tokens", () => {
  const tokenA = "a".repeat(20);
  const tokenB = "b".repeat(20);
  assert.deepEqual(
    collectUserFcmTokens({
      one: { fcmToken: tokenA, devices: { phone: { fcmToken: tokenA } } },
      two: { devices: { tablet: { fcmToken: tokenB } } },
    }).sort(),
    [tokenA, tokenB]
  );
});

test("notification contains a routable quantum payload", () => {
  const notification = buildQuantumSectorNotification({
    guildId: "guild-1",
    sectorId: "f13",
  });
  assert.equal(notification.title, "Сектор відкрито");
  assert.equal(
    notification.body,
    "Квантове вторгнення. Сектор F13 розблоковано."
  );
  assert.equal(notification.data.type, "quantum_sector_open");
  assert.equal(notification.data.guildId, "guild-1");
  assert.equal(notification.data.sectorId, "f13");
});
