import database from '@react-native-firebase/database';

export const GBG_BOT_ROLE = 'GBGbot';

const ROLE_CACHE_TTL_MS = 60 * 1000;
const roleCache = new Map();
const roleRequests = new Map();

const getCachedGuildRole = async (guildId, userId) => {
  const key = `${guildId}:${userId}`;
  const cached = roleCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.role;
  if (roleRequests.has(key)) return roleRequests.get(key);

  const request = database()
    .ref(`users/${userId}/userGuilds/${guildId}/role`)
    .once('value')
    .then((snapshot) => {
      const role = snapshot.val();
      roleCache.set(key, { role, expiresAt: Date.now() + ROLE_CACHE_TTL_MS });
      return role;
    })
    .finally(() => roleRequests.delete(key));
  roleRequests.set(key, request);
  return request;
};

export const getGbgBotIds = async (guildId, memberIds) => {
  if (!guildId || !memberIds?.length) return new Set();
  const roles = await Promise.all(memberIds.map(async (userId) => {
    try {
      const role = await getCachedGuildRole(guildId, userId);
      return role === GBG_BOT_ROLE ? String(userId) : null;
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
