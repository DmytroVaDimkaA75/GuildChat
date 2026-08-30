const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FOE_AVATAR_BASE_URL,
  normalizeQuantumAvatarUrl,
  resolveQuantumAvatarUrl,
} = require('../components/quantumAvatar');

test('quantum avatar name is expanded to a ScoreDB image URL', () => {
  assert.equal(
    normalizeQuantumAvatarUrl('portrait_id_16'),
    `${FOE_AVATAR_BASE_URL}portrait_id_16.jpg`
  );
});

test('quantum avatar normalization preserves complete and relative image URLs', () => {
  assert.equal(
    normalizeQuantumAvatarUrl('https://example.com/avatar.png'),
    'https://example.com/avatar.png'
  );
  assert.equal(
    normalizeQuantumAvatarUrl('/img/games/foe/avatars/addon_portrait_id_test.jpg'),
    `${FOE_AVATAR_BASE_URL}addon_portrait_id_test.jpg`
  );
});

test('quantum avatar resolution skips empty candidates and reads URL objects', () => {
  assert.equal(
    resolveQuantumAvatarUrl('', null, { url: 'https://example.com/fallback.jpg' }),
    'https://example.com/fallback.jpg'
  );
  assert.equal(resolveQuantumAvatarUrl('', null, {}), null);
});
