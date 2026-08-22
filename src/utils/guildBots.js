import database from '@react-native-firebase/database';

export const GBG_BOT_ROLE = 'GBGbot';

export const getGbgBotIds = async (guildId, memberIds) => {
  if (!guildId || !memberIds?.length) return new Set();
  const roles = await Promise.all(memberIds.map(async (userId) => {
    try {
      const snapshot = await database().ref(`users/${userId}/userGuilds/${guildId}/role`).once('value');
      return snapshot.val() === GBG_BOT_ROLE ? String(userId) : null;
    } catch (_error) {
      return null;
    }
  }));
  return new Set(roles.filter(Boolean));
};

export const filterGbgBots = async (guildId, guildUsers = {}) => {
  const botIds = await getGbgBotIds(guildId, Object.keys(guildUsers));
  return Object.fromEntries(
    Object.entries(guildUsers).filter(([userId]) => !botIds.has(String(userId)))
  );
};
