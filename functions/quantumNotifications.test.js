const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildQuantumSectorNotification,
  collectOpenedQuantumSectorIds,
  collectQuantumNotificationRecipients,
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

test("simultaneous blocked to open transitions are collected once", () => {
  assert.deepEqual(
    collectOpenedQuantumSectorIds(
      {
        h4: { state: "blocked" },
        f13: { state: { state: "blocked" } },
        j8: { state: "open" },
      },
      {
        h4: { state: "open" },
        f13: { state: { state: "open" } },
        j8: { state: "finished" },
      }
    ),
    ["f13", "h4"]
  );
});

test("recipients receive only opened sectors they subscribed to", () => {
  assert.deepEqual(
    collectQuantumNotificationRecipients({
      openedSectorIds: ["f13", "h4"],
      subscriptionsBySector: {
        f13: { userA: true, formerMember: true },
        h4: { userA: true, userB: true },
      },
      guildMembers: { userA: {}, userB: {} },
    }),
    [
      { userId: "userA", sectorIds: ["f13", "h4"] },
      { userId: "userB", sectorIds: ["h4"] },
    ]
  );
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
  assert.equal(notification.title, "🔬 Квантові вторгнення");
  assert.equal(
    notification.body,
    "Сектор F13 розблоковано"
  );
  assert.equal(notification.data.type, "quantum_sector_open");
  assert.equal(notification.data.guildId, "guild-1");
  assert.equal(notification.data.sectorId, "f13");
  assert.equal(notification.data.title, notification.title);
  assert.equal(notification.data.body, notification.body);
});

test("notification groups multiple sector IDs", () => {
  const notification = buildQuantumSectorNotification({
    guildId: "guild-1",
    sectorIds: ["f13", "h4", "f13"],
  });

  assert.equal(notification.title, "🔬 Квантові вторгнення");
  assert.equal(notification.body, "Сектори F13, H4 розблоковано");
  assert.equal(notification.data.sectorId, "f13");
  assert.equal(notification.data.body, notification.body);
});
