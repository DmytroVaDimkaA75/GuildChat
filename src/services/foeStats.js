// src/services/foeStats.js
//
// Збереження зібраних з гри показників гравця у Firebase.
// Шлях: guilds/<guildId>/foeStats/<userId>
//
// Дані бачить лише гільдія. Пароль від гри тут НЕ зберігається —
// тільки підсумкові числа.

import database from '@react-native-firebase/database';

export async function saveFoeStats(guildId, userId, payload) {
  const gid = String(guildId || '').trim();
  const uid = String(userId || '').trim();
  if (!gid || !uid) {
    throw new Error('Немає guildId або userId — увійдіть у застосунок ще раз.');
  }

  const record = {
    updatedAt: database.ServerValue.TIMESTAMP,
    foePlayerId: payload.player?.id || null,
    foePlayerName: payload.player?.name || null,
    boosts: payload.boosts ?? null,
    goods: payload.goods ?? null,
  };

  await database().ref(`guilds/${gid}/foeStats/${uid}`).update(record);
  return record;
}

export function subscribeFoeStats(guildId, callback) {
  const gid = String(guildId || '').trim();
  if (!gid) return () => {};
  const ref = database().ref(`guilds/${gid}/foeStats`);
  const handler = ref.on('value', (snap) => callback(snap.val() || {}));
  return () => ref.off('value', handler);
}
