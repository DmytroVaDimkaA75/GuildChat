export const getChatMessageTimestamp = (message) => {
  const timestamp = Number(message?.timestamp || message?.authoredAt || 0);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const isChatMessageVisible = (message, deletedAt, userId) => {
  if (message?.deletedFor?.[userId]) return false;

  const cutoff = Number(deletedAt || 0);
  if (!Number.isFinite(cutoff) || cutoff <= 0) return true;
  return getChatMessageTimestamp(message) > cutoff;
};
