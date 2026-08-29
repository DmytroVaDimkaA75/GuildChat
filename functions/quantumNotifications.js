const normalizeState = (value) => String(value || "").trim().toLowerCase();

const isQuantumSectorOpening = (beforeState, afterState) =>
  normalizeState(beforeState) === "blocked" &&
  normalizeState(afterState) === "open";

const normalizeToken = (value) => {
  const token = String(value || "").trim();
  return token.length >= 20 ? token : "";
};

const collectUserFcmTokens = (userRecords) => {
  const tokens = new Set();
  Object.values(userRecords || {}).forEach((record) => {
    const legacyToken = normalizeToken(record?.fcmToken);
    if (legacyToken) tokens.add(legacyToken);
    Object.values(record?.devices || {}).forEach((device) => {
      const deviceToken = normalizeToken(device?.fcmToken);
      if (deviceToken) tokens.add(deviceToken);
    });
  });
  return Array.from(tokens);
};

const buildQuantumSectorNotification = ({ guildId, sectorId }) => {
  const normalizedSectorId = String(sectorId || "").toUpperCase();
  const title = "Сектор відкрито";
  const body = `Квантове вторгнення. Сектор ${normalizedSectorId} розблоковано.`;

  return {
    title,
    body,
    data: {
      type: "quantum_sector_open",
      guildId: String(guildId || ""),
      sectorId: String(sectorId || ""),
      title,
      body,
      sound: "1",
      createdAt: String(Date.now()),
    },
  };
};

module.exports = {
  buildQuantumSectorNotification,
  collectUserFcmTokens,
  isQuantumSectorOpening,
};
