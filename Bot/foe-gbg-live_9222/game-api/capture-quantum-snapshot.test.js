'use strict';

const assert = require('node:assert/strict');
const {
  parseArguments,
  validateWorldLoginUrl,
} = require('./capture-quantum-snapshot');

assert.deepEqual(parseArguments([]), { worldName: '' });
assert.deepEqual(parseArguments(['--world', 'RU3']), { worldName: 'ru3' });
assert.deepEqual(parseArguments(['--world=ru11']), { worldName: 'ru11' });
assert.throws(() => parseArguments(['--world', '']), /Invalid world name/);
assert.throws(() => parseArguments(['--world', 'ru']), /Invalid world name/);
assert.throws(() => parseArguments(['--other']), /Unknown argument/);
assert.equal(
  validateWorldLoginUrl(
    'https://ru9.forgeofempires.com/game/login?token=secret',
    'ru9',
  ),
  'https://ru9.forgeofempires.com/game/login?token=secret',
);
assert.throws(
  () => validateWorldLoginUrl('https://ru3.forgeofempires.com/game/login?token=x', 'ru9'),
  /unexpected login URL/,
);
assert.throws(
  () => validateWorldLoginUrl('https://ru9.forgeofempires.com/game/index?', 'ru9'),
  /unexpected login URL/,
);

console.log('capture-quantum-snapshot tests passed');
