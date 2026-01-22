import CryptoJS from 'react-native-crypto-js';
import database from '@react-native-firebase/database';
import { parseGuildMembers } from '../../guildParser';

const buildMembersUrl = (guildId) => {
  if (!guildId || !guildId.includes('_')) return null;
  const [worldId, rawGuildId] = guildId.split('_');
  if (!worldId || !rawGuildId) return null;
  return `https://foe.scoredb.io/${worldId}/Guild/${rawGuildId}/Members`;
};

const normalizeUserName = (name) => (name || '').trim();
const normalizeImageUrl = (url) => {
  if (!url) return null;
  return url.startsWith('http') ? url : `https://foe.scoredb.io${url}`;
};

const collectMissingMembers = (guildUsers, siteMemberIds) =>
  Object.keys(guildUsers || {})
    .filter(userId => !siteMemberIds.has(userId))
    .map(userId => ({
      userId,
      userName: normalizeUserName(guildUsers[userId]?.userName) || userId,
    }));

const collectNewMembers = (guildUsers, siteMembers) => {
  const existingIds = new Set(Object.keys(guildUsers || {}));
  return (siteMembers || [])
    .filter(member => member?.userId && !existingIds.has(member.userId))
    .map(member => ({
      userId: member.userId,
      userName: normalizeUserName(member.name) || member.userId,
      imageUrl: normalizeImageUrl(member.imageUrl),
    }));
};

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
  confirmAddition,
}) => {
  const membersUrl = buildMembersUrl(guildId);
  if (!membersUrl) {
    return { success: false, error: 'Некоректний формат guildId.' };
  }

  const parseResult = await parseGuildMembers(membersUrl);
  if (!parseResult.success) {
    return { success: false, error: parseResult.error || 'Помилка парсингу.' };
  }

  const siteMembers = parseResult.data || [];
  const siteMemberIds = new Set(siteMembers.map(member => member.userId));
  const guildUsersSnap = await database()
    .ref(`/guilds/${guildId}/guildUsers`)
    .once('value');
  const guildUsers = guildUsersSnap.exists() ? guildUsersSnap.val() : {};
  const missingMembers = collectMissingMembers(guildUsers, siteMemberIds);
  const newMembers = collectNewMembers(guildUsers, siteMembers);

  let removedMembers = [];
  let addedMembers = [];

  if (missingMembers.length > 0) {
    const confirmedDeletion = typeof confirmDeletion === 'function'
      ? await confirmDeletion(missingMembers)
      : false;

    if (confirmedDeletion) {
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
      removedMembers = missingMembers;
    }
  }

  if (newMembers.length > 0) {
    const confirmedAddition = typeof confirmAddition === 'function'
      ? await confirmAddition(newMembers)
      : false;

    if (confirmedAddition) {
      await Promise.all(
        newMembers.map(async ({ userId, userName, imageUrl }) => {
          const userRef = database().ref(`users/${userId}`);
          const snapshot = await userRef.once('value');
          const guildData = {
            [guildId]: {
              imageUrl: imageUrl,
              role: 'member',
            },
          };

          if (snapshot.exists()) {
            await userRef.update(guildData);
          } else {
            const encryptedUserId = CryptoJS.AES.encrypt(
              userId,
              'your-encryption-key'
            ).toString();
            await userRef.set({
              userName,
              password: encryptedUserId,
              ...guildData,
            });
          }

          await database()
            .ref(`/guilds/${guildId}/guildUsers/${userId}`)
            .set({ userName, imageUrl });
        })
      );
      addedMembers = newMembers;
    }
  }

  return { success: true, removed: removedMembers, added: addedMembers };
};
