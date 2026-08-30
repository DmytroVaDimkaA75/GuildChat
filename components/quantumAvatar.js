const FOE_SCOREDB_ORIGIN = 'https://foe.scoredb.io';
const FOE_AVATAR_BASE_URL = `${FOE_SCOREDB_ORIGIN}/img/games/foe/avatars/`;
const AVATAR_FILE_EXTENSION = /\.(?:avif|gif|jpe?g|png|webp)$/i;

const getAvatarValue = (value) => {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';

  const nestedValue = value.url ?? value.src ?? value.uri;
  return typeof nestedValue === 'string' ? nestedValue.trim() : '';
};

const normalizeQuantumAvatarUrl = (value) => {
  const avatar = getAvatarValue(value);
  if (!avatar) return null;
  if (/^https?:\/\//i.test(avatar)) return avatar;
  if (avatar.startsWith('//')) return `https:${avatar}`;
  if (avatar.startsWith('/')) return `${FOE_SCOREDB_ORIGIN}${avatar}`;

  const fileName = AVATAR_FILE_EXTENSION.test(avatar) ? avatar : `${avatar}.jpg`;
  return `${FOE_AVATAR_BASE_URL}${fileName}`;
};

const resolveQuantumAvatarUrl = (...candidates) => {
  for (const candidate of candidates) {
    const imageUrl = normalizeQuantumAvatarUrl(candidate);
    if (imageUrl) return imageUrl;
  }
  return null;
};

module.exports = {
  FOE_AVATAR_BASE_URL,
  normalizeQuantumAvatarUrl,
  resolveQuantumAvatarUrl,
};
