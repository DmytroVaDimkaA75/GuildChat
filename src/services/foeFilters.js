// src/services/foeFilters.js
//
// Збережені користувачем фільтри «Запланованого збору».
// Шлях: users/<userId>/foeSyncFilters/<pushId> = { name, filterId, subKey, createdAt }

import database from '@react-native-firebase/database';

const ref = (uid) => database().ref(`users/${String(uid || '').trim()}/foeSyncFilters`);

export async function loadFoeFilters(userId) {
  const uid = String(userId || '').trim();
  if (!uid) return [];
  const snap = await ref(uid).once('value');
  const val = snap.val() || {};
  return Object.entries(val)
    .map(([id, f]) => ({ id, name: f?.name || '—', filterId: f?.filterId || null, subKey: f?.subKey || null, createdAt: f?.createdAt || 0 }))
    .filter((f) => f.filterId)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export function subscribeFoeFilters(userId, cb) {
  const uid = String(userId || '').trim();
  if (!uid) return () => {};
  const r = ref(uid);
  const handler = (snap) => {
    const val = snap.val() || {};
    cb(
      Object.entries(val)
        .map(([id, f]) => ({ id, name: f?.name || '—', filterId: f?.filterId || null, subKey: f?.subKey || null, createdAt: f?.createdAt || 0 }))
        .filter((f) => f.filterId)
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    );
  };
  r.on('value', handler);
  return () => r.off('value', handler);
}

export async function saveFoeFilter(userId, { name, filterId, subKey }) {
  const uid = String(userId || '').trim();
  if (!uid) throw new Error('Немає користувача');
  if (!filterId) throw new Error('Не обрано фільтр');
  const r = ref(uid).push();
  await r.set({
    name: String(name || '').trim() || 'Без назви',
    filterId,
    subKey: subKey || null,
    createdAt: database.ServerValue.TIMESTAMP,
  });
  return r.key;
}

export async function deleteFoeFilter(userId, id) {
  const uid = String(userId || '').trim();
  if (!uid || !id) return;
  await ref(uid).child(id).remove();
}
