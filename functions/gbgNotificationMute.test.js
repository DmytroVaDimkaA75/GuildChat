const assert = require("node:assert/strict");
const test = require("node:test");
const {
  isGbgSectorNotificationMuted,
  normalizeGbgNotificationMute,
} = require("./gbgNotificationMute");
const {
  getGbgSeasonEndMs,
  getMoscowDayEndMs,
} = require("../components/GBG/gbgMuteTime");

test("legacy numeric mute remains a global mute", () => {
  assert.deepEqual(normalizeGbgNotificationMute(2_000), {
    mutedUntil: 2_000,
    scope: "all",
  });
  assert.equal(isGbgSectorNotificationMuted({ rawMute: 2_000, army: "attack", nowMs: 1_000 }), true);
});

test("army-scoped mute only suppresses matching sectors", () => {
  const rawMute = { mutedUntil: 2_000, scope: "attack" };
  assert.equal(isGbgSectorNotificationMuted({ rawMute, army: "attack", nowMs: 1_000 }), true);
  assert.equal(isGbgSectorNotificationMuted({ rawMute, army: "defense", nowMs: 1_000 }), false);
  assert.equal(isGbgSectorNotificationMuted({ rawMute, army: "attack", nowMs: 2_000 }), false);
});

test("Moscow day mute ends at 23:59:59.999 Moscow time", () => {
  const now = Date.parse("2026-08-14T18:00:00.000Z"); // 21:00 Moscow.
  assert.equal(getMoscowDayEndMs(now), Date.parse("2026-08-14T20:59:59.999Z"));
});

test("season anchored on 13 August 2026 ends on 24 August at 08:00 Moscow", () => {
  const duringSeason = Date.parse("2026-08-20T12:00:00.000Z");
  assert.equal(getGbgSeasonEndMs(duringSeason), Date.parse("2026-08-24T05:00:00.000Z"));
});

test("during the break season mute targets the next season end", () => {
  const duringBreak = Date.parse("2026-08-25T12:00:00.000Z");
  assert.equal(getGbgSeasonEndMs(duringBreak), Date.parse("2026-09-07T05:00:00.000Z"));
});
