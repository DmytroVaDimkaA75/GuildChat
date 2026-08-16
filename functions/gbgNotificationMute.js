const VALID_SCOPES = new Set(["all", "attack", "defense"]);

const normalizeGbgNotificationMute = (rawValue) => {
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    return { mutedUntil: rawValue, scope: "all" };
  }

  if (!rawValue || typeof rawValue !== "object") {
    return { mutedUntil: 0, scope: "all" };
  }

  const mutedUntil = Number(rawValue.mutedUntil ?? rawValue.until ?? 0);
  const scope = VALID_SCOPES.has(rawValue.scope) ? rawValue.scope : "all";
  return {
    mutedUntil: Number.isFinite(mutedUntil) ? mutedUntil : 0,
    scope,
  };
};

const isGbgSectorNotificationMuted = ({ rawMute, army, nowMs = Date.now() }) => {
  const mute = normalizeGbgNotificationMute(rawMute);
  if (mute.mutedUntil <= nowMs) return false;
  if (mute.scope === "all") return true;
  return mute.scope === String(army || "").trim().toLowerCase();
};

// Non-sector GBG events (build recommendations and help calls) have no army
// scope. Only an active global mute should silence them.
const isGbgNotificationSoundMuted = ({ rawMute, army = null, nowMs = Date.now() }) => {
  const mute = normalizeGbgNotificationMute(rawMute);
  if (mute.mutedUntil <= nowMs) return false;
  if (mute.scope === "all") return true;
  if (!army) return false;
  return mute.scope === String(army).trim().toLowerCase();
};

module.exports = {
  isGbgNotificationSoundMuted,
  isGbgSectorNotificationMuted,
  normalizeGbgNotificationMute,
};
