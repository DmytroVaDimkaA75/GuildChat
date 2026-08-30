const normalizeState = (value) => String(value || "").trim().toLowerCase();

const isQuantumSectorOpening = (beforeState, afterState) =>
  normalizeState(beforeState) === "blocked" &&
  normalizeState(afterState) === "open";

const getQuantumNodeState = (node) => {
  const state = node?.state;
  return state && typeof state === "object" ? state.state : state;
};

const collectOpenedQuantumSectorIds = (beforeNodes, afterNodes) => {
  const before = beforeNodes && typeof beforeNodes === "object" ? beforeNodes : {};
  const after = afterNodes && typeof afterNodes === "object" ? afterNodes : {};
  const sectorIds = new Set([...Object.keys(before), ...Object.keys(after)]);

  return Array.from(sectorIds)
    .filter((sectorId) => isQuantumSectorOpening(
      getQuantumNodeState(before[sectorId]),
      getQuantumNodeState(after[sectorId])
    ))
    .sort((left, right) => left.localeCompare(
      right,
      "en",
      { numeric: true, sensitivity: "base" }
    ));
};

const collectQuantumNotificationRecipients = ({
  openedSectorIds,
  subscriptionsBySector,
  guildMembers,
}) => {
  const memberIds = new Set(Object.keys(guildMembers || {}));
  const sectorIdsByUser = new Map();

  Array.from(new Set(openedSectorIds || [])).forEach((sectorId) => {
    Object.keys(subscriptionsBySector?.[sectorId] || {}).forEach((userId) => {
      if (!memberIds.has(userId)) return;
      const sectorIds = sectorIdsByUser.get(userId) || [];
      sectorIds.push(sectorId);
      sectorIdsByUser.set(userId, sectorIds);
    });
  });

  return Array.from(sectorIdsByUser, ([userId, sectorIds]) => ({
    userId,
    sectorIds,
  }));
};

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

const buildQuantumSectorNotification = ({ guildId, sectorId, sectorIds }) => {
  const sourceSectorIds = Array.isArray(sectorIds) && sectorIds.length
    ? sectorIds
    : [sectorId];
  const normalizedSectorIds = Array.from(new Set(
    sourceSectorIds
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  ));
  const displaySectorIds = normalizedSectorIds.map((value) => value.toUpperCase());
  const sectorLabel = displaySectorIds.length > 1 ? "Сектори" : "Сектор";
  const sectorList = displaySectorIds.join(", ");
  const title = "🔬 Квантові вторгнення";
  const body = `${sectorLabel}${sectorList ? ` ${sectorList}` : ""} розблоковано`;

  return {
    title,
    body,
    data: {
      type: "quantum_sector_open",
      guildId: String(guildId || ""),
      sectorId: normalizedSectorIds[0] || "",
      title,
      body,
      sound: "1",
      createdAt: String(Date.now()),
    },
  };
};

module.exports = {
  buildQuantumSectorNotification,
  collectOpenedQuantumSectorIds,
  collectQuantumNotificationRecipients,
  collectUserFcmTokens,
  isQuantumSectorOpening,
};
