const normalizeQuantumSectorIds = (sectorIds) => Array.from(new Set(
  (Array.isArray(sectorIds) ? sectorIds : [])
    .map((sectorId) => String(sectorId || '').trim())
    .filter(Boolean)
));

const areSameQuantumSectorSelections = (leftSectorIds, rightSectorIds) => {
  const left = normalizeQuantumSectorIds(leftSectorIds);
  const right = normalizeQuantumSectorIds(rightSectorIds);
  if (left.length !== right.length) return false;

  const rightSet = new Set(right);
  return left.every((sectorId) => rightSet.has(sectorId));
};

const buildQuantumNotificationSelectionUpdates = ({
  userId,
  currentSectorIds,
  nextSectorIds,
  createdAt,
}) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) throw new Error('A user ID is required to update quantum notifications.');

  const current = normalizeQuantumSectorIds(currentSectorIds);
  const next = normalizeQuantumSectorIds(nextSectorIds);
  const currentSet = new Set(current);
  const nextSet = new Set(next);
  const addedSectorIds = next.filter((sectorId) => !currentSet.has(sectorId));
  const removedSectorIds = current.filter((sectorId) => !nextSet.has(sectorId));
  const updates = {};

  addedSectorIds.forEach((sectorId) => {
    updates[`${sectorId}/${normalizedUserId}`] = {
      userId: normalizedUserId,
      sectorId,
      expectedState: 'blocked',
      createdAt,
    };
  });
  removedSectorIds.forEach((sectorId) => {
    updates[`${sectorId}/${normalizedUserId}`] = null;
  });

  return {
    addedSectorIds,
    nextSectorIds: next,
    removedSectorIds,
    updates,
  };
};

module.exports = {
  areSameQuantumSectorSelections,
  buildQuantumNotificationSelectionUpdates,
  normalizeQuantumSectorIds,
};
