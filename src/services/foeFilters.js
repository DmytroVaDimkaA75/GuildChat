// src/services/foeFilters.js
//
// Збережені користувачем фільтри «Запланованого збору».
// Шлях: users/<userId>/foeSyncFilters/<world>/<pushId>
//   де world — частина guildId до "_" (напр. "ru11").
// Фільтр зберігається окремо для кожного світу.

import database from '@react-native-firebase/database';

const worldOf = (guildId) => String(guildId || '').split('_')[0].trim();

const ref = (userId, guildId) => {
  const uid = String(userId || '').trim();
  const world = worldOf(guildId);
  return database().ref(`users/${uid}/foeSyncFilters/${world}`);
};

const mapEntry = ([id, f]) => ({
  id,
  name: f?.name || '—',
  filterId: f?.filterId || null,
  subKey: f?.subKey || null,
  createdAt: f?.createdAt || 0,
});

const parse = (val) =>
  Object.entries(val || {})
    .map(mapEntry)
    .filter((f) => f.filterId)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

export function subscribeFoeFilters(userId, guildId, cb) {
  const uid = String(userId || '').trim();
  const world = worldOf(guildId);
  if (!uid || !world) {
    cb([]);
    return () => {};
  }
  const r = ref(uid, guildId);
  const handler = (snap) => cb(parse(snap.val()));
  r.on('value', handler);
  return () => r.off('value', handler);
}

export async function saveFoeFilter(userId, guildId, { name, filterId, subKey }) {
  const uid = String(userId || '').trim();
  const world = worldOf(guildId);
  if (!uid || !world) throw new Error('Немає користувача або світу');
  if (!filterId) throw new Error('Не обрано фільтр');
  const r = ref(uid, guildId).push();
  await r.set({
    name: String(name || '').trim() || 'Без назви',
    filterId,
    subKey: subKey || null,
    createdAt: database.ServerValue.TIMESTAMP,
  });
  return r.key;
}

export async function deleteFoeFilter(userId, guildId, id) {
  const uid = String(userId || '').trim();
  const world = worldOf(guildId);
  if (!uid || !world || !id) return;
  await ref(uid, guildId).child(id).remove();
}
