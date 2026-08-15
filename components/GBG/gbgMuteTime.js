const MOSCOW_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;
const GBG_SEASON_CYCLE_MS = 14 * 24 * 60 * 60 * 1000;
const GBG_SEASON_DURATION_MS = 11 * 24 * 60 * 60 * 1000;
// 13.08.2026 08:00 Europe/Moscow === 13.08.2026 05:00 UTC.
const GBG_SEASON_ANCHOR_MS = Date.UTC(2026, 7, 13, 5, 0, 0, 0);

const getMoscowDayEndMs = (nowMs) => {
  const moscowDate = new Date(nowMs + MOSCOW_UTC_OFFSET_MS);
  return Date.UTC(
    moscowDate.getUTCFullYear(),
    moscowDate.getUTCMonth(),
    moscowDate.getUTCDate() + 1
  ) - MOSCOW_UTC_OFFSET_MS - 1;
};

const getGbgSeasonEndMs = (nowMs) => {
  const elapsedCycles = Math.floor((nowMs - GBG_SEASON_ANCHOR_MS) / GBG_SEASON_CYCLE_MS);
  let seasonStart = GBG_SEASON_ANCHOR_MS + Math.max(0, elapsedCycles) * GBG_SEASON_CYCLE_MS;
  let seasonEnd = seasonStart + GBG_SEASON_DURATION_MS;

  // During the three-day break, use the end of the next season so the
  // selected mute never expires immediately in the past.
  if (seasonEnd <= nowMs) {
    seasonStart += GBG_SEASON_CYCLE_MS;
    seasonEnd = seasonStart + GBG_SEASON_DURATION_MS;
  }
  return seasonEnd;
};

module.exports = {
  GBG_SEASON_ANCHOR_MS,
  getGbgSeasonEndMs,
  getMoscowDayEndMs,
};
