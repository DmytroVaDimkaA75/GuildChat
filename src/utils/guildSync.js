import database from '@react-native-firebase/database';
import { parseGuildMembers } from '../../guildParser';

const buildMembersUrl = (guildId) => {
  if (!guildId || !guildId.includes('_')) return null;
  const [worldId, rawGuildId] = guildId.split('_');
  if (!worldId || !rawGuildId) return null;
  return `https://foe.scoredb.io/${worldId}/Guild/${rawGuildId}/Members`;
};

const normalizeUserName = (name) => (name || '').trim();

const collectMissingMembers = (guildUsers, siteMemberIds) =>
  Object.keys(guildUsers || {})
    .filter(userId => !siteMemberIds.has(userId))
    .map(userId => ({
      userId,
      userName: normalizeUserName(guildUsers[userId]?.userName) || userId,
    }));

const buildChatRemovalUpdates = (guildId, chatsData, userId) => {
  const updates = {};
  if (!chatsData) return updates;

  Object.entries(chatsData).forEach(([chatId, chatData]) => {
    if (!chatData?.members || !chatData.members[userId]) return;
    if (chatData.type === 'private') {
      updates[`/guilds/${guildId}/chats/${chatId}`] = null;
    } else {
      updates[`/guilds/${guildId}/chats/${chatId}/members/${userId}`] = null;
    }
  });

  return updates;
};

export const syncGuildMembers = async ({
  guildId,
  confirmDeletion,
}) => {
  const membersUrl = buildMembersUrl(guildId);
  if (!membersUrl) {
    return { success: false, error: 'Некоректний формат guildId.' };
  }

  const parseResult = await parseGuildMembers(membersUrl);
  if (!parseResult.success) {
    return { success: false, error: parseResult.error || 'Помилка парсингу.' };
  }

  const siteMemberIds = new Set((parseResult.data || []).map(member => member.userId));
  const guildUsersSnap = await database()
    .ref(`/guilds/${guildId}/guildUsers`)
    .once('value');
  const guildUsers = guildUsersSnap.exists() ? guildUsersSnap.val() : {};
  const missingMembers = collectMissingMembers(guildUsers, siteMemberIds);

  if (missingMembers.length === 0) {
    return { success: true, removed: [] };
  }

  const confirmed = typeof confirmDeletion === 'function'
    ? await confirmDeletion(missingMembers)
    : false;

  if (!confirmed) {
    return { success: true, removed: [] };
  }

  const chatsSnap = await database()
    .ref(`/guilds/${guildId}/chats`)
    .once('value');
  const chatsData = chatsSnap.exists() ? chatsSnap.val() : null;

  await Promise.all(
    missingMembers.map(async ({ userId }) => {
      const updates = {
        [`/users/${userId}/${guildId}`]: null,
        [`/guilds/${guildId}/guildUsers/${userId}`]: null,
        ...buildChatRemovalUpdates(guildId, chatsData, userId),
      };

      await database().ref().update(updates);
    })
  );

  return { success: true, removed: missingMembers };
};
