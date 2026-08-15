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

module.exports = {
  isGbgSectorNotificationMuted,
  normalizeGbgNotificationMute,
};
