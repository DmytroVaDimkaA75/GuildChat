'use strict';

const assert = require('assert');
const { gamePageOrigin, parseStartupIdentity, buildConfig } = require('./setup');

assert.strictEqual(
  gamePageOrigin('https://ru11.forgeofempires.com/game/index'),
  'https://ru11.forgeofempires.com',
);
assert.strictEqual(gamePageOrigin('https://example.com/game/index'), null);

const identity = parseStartupIdentity('https://ru11.forgeofempires.com', {
  user_data: {
    player_id: 123,
    user_name: 'Player',
    clan_id: 456,
    clan_name: 'Guild',
  },
});
assert.deepStrictEqual(identity, {
  playerId: '123',
  playerName: 'Player',
  worldName: 'ru11',
  guildId: '456',
  guildName: 'Guild',
});
const config = buildConfig({}, identity, 'http://127.0.0.1:9222');
assert.strictEqual(config.firebase.botType, 'GBGbot');
assert.strictEqual(config.firebase.playerId, '123');
assert.strictEqual(config.firebase.guildId, '456');
assert.strictEqual(config.worker.id, 'ru11-456-gbgbot-123');
assert.strictEqual(config.worker.guildMemberSyncIntervalMs, 3600000);
assert.strictEqual(config.worker.guildMemberFullReconcileIntervalMs, 86400000);
assert.strictEqual(config.worker.gbgMapPollIntervalMs, 10000);
assert.strictEqual(config.worker.gbgPlayerLeaderboardPollIntervalMs, 60000);
assert.strictEqual(config.worker.gbgBuildingFullAuditIntervalMs, 1800000);
assert.strictEqual(config.worker.gbgEmptySlotRecheckIntervalMs, 300000);
assert.strictEqual(config.worker.gbgGuildPointsMinute, 2);
assert.deepStrictEqual(config.firebase.guildOverrides['123'], {
  worldName: 'ru11',
  guildId: '456',
});
console.log('setup tests: ok');
