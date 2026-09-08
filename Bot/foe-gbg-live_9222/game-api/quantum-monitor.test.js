'use strict';

const assert = require('node:assert/strict');
const {
  mapKeyFromState,
  normalizeState,
  normalizeNodes,
  overviewFingerprint,
  normalizeMembers,
  normalizeNodeLeaderboard,
  normalizeNodeDetail,
  shouldFinalizeNode,
  snapshotsEqual,
  MAP_POLL_MS,
  INACTIVE_POLL_MS,
} = require('./quantum-monitor');

const NOW = '2026-08-25T05:25:45.159Z';

assert.equal(INACTIVE_POLL_MS, MAP_POLL_MS);

assert.equal(mapKeyFromState({ guildRaidsType: 'guildRaidsMiddleAges4' }), 'SteelCitadel');
assert.deepEqual(normalizeState({
  __class__: 'GuildRaidsRunningState',
  guildRaidsType: 'guildRaidsMiddleAges4',
  endsAt: 1788152400,
  raidInstance: {
    raidName: 'Стальная цитадель',
    difficultyLevel: 6,
    expiresAt: 1787691600,
  },
}, NOW), {
  stateClass: 'GuildRaidsRunningState',
  mapKey: 'SteelCitadel',
  guildRaidsType: 'guildRaidsMiddleAges4',
  raidName: 'Стальная цитадель',
  difficultyLevel: 6,
  templatePath: '/quantumMaps/SteelCitadel/6',
  endsAt: 1788152400,
  expiresAt: 1787691600,
  stateCheckedAt: NOW,
});

assert.deepEqual(normalizeNodes({ nodes: [{
  id: 'j10',
  state: {
    state: 'open',
    currentProgress: 500,
    playersCount: 2,
    indicator: { value: 'none' },
  },
}] }), {
  j10: {
    state: 'open',
    currentProgress: 500,
    playersCount: 2,
    indicator: 'none',
  },
});

const fingerprintOverview = {
  nodes: [{
    id: 'a',
    type: { requiredProgress: 100 },
    position: { x: 1, y: 2 },
    connectedNodes: [{ targetNodeId: 'b', pathTiles: [{ x: 2, y: 2 }] }],
  }],
};
assert.equal(
  overviewFingerprint(fingerprintOverview),
  overviewFingerprint({ nodes: [...fingerprintOverview.nodes].reverse() }),
);
assert.notEqual(
  overviewFingerprint(fingerprintOverview),
  overviewFingerprint({
    nodes: [{
      ...fingerprintOverview.nodes[0],
      connectedNodes: [{ targetNodeId: 'c', pathTiles: [{ x: 2, y: 2 }] }],
    }],
  }),
);

assert.deepEqual(normalizeNodeDetail({
  actionProgress: 10,
  contributorsCount: 2,
  preferredUnitMultiplier: 1,
  cost: { resources: { guild_raids_action_points: 3500 } },
}, NOW), {
  actionProgress: 10,
  contributorsCount: 2,
  updatedAt: NOW,
  preferredUnitMultiplier: 1,
  cost: { guild_raids_action_points: 3500 },
});

assert.deepEqual(normalizeNodeDetail({
  actionProgress: 10,
  donationOptions: [{
    resources: { resources: {
      guild_raids_action_points: 3500,
      guild_raids_bronze: 6,
    } },
    multiplier: 1,
  }],
}, NOW).donationOptions[0].resources, {
  guild_raids_action_points: 3500,
  guild_raids_bronze: 6,
});

assert.deepEqual(normalizeMembers({ rows: [{
  player: { player_id: 8183328, name: 'Irop0063', avatar: 'portrait', era: 'SpaceAgeTitan' },
  actionPoints: 1200,
  progressContribution: 30,
}] }), {
  8183328: {
    name: 'Irop0063',
    avatar: 'portrait',
    era: 'SpaceAgeTitan',
    actionPoints: 1200,
    progressContribution: 30,
  },
});

assert.deepEqual(normalizeNodeLeaderboard({ rows: [{
  player: { player_id: 9176573, name: 'Zosus', avatar: 'portrait', era: 'FutureEra' },
  progress: 390,
}] }), {
  9176573: {
    name: 'Zosus',
    avatar: 'portrait',
    era: 'FutureEra',
    progress: 390,
  },
});

assert.equal(shouldFinalizeNode(
  { state: 'open' },
  { contributors: {} },
  { state: 'finished' },
), true);
assert.equal(shouldFinalizeNode(
  { state: 'finished' },
  { state: 'finished', contributorsFinal: true },
  { state: 'finished' },
), false);
assert.equal(shouldFinalizeNode(
  { state: 'finished' },
  null,
  { state: 'finished' },
), true);

assert.equal(snapshotsEqual(
  { stateClass: 'GuildRaidsRunningState', capturedAt: NOW, nodeDetails: { a: { updatedAt: NOW } } },
  {
    stateClass: 'GuildRaidsRunningState',
    capturedAt: '2026-08-25T05:26:45.159Z',
    nodeDetails: { a: { updatedAt: '2026-08-25T05:26:45.159Z' } },
  },
), true);

assert.equal(snapshotsEqual(
  { nodes: { a: { currentProgress: 10 } } },
  { nodes: { a: { currentProgress: 20 } } },
), false);

const {
  quantumRemainingToTarget,
  quantumPollDelayMs,
} = require('./quantum-monitor');

// A(open) - B(blocked) - T(blocked target).  T відкриється, коли дозакінчаться A і B.
const pathTemplate = {
  nodes: [
    { id: 'A', type: { requiredProgress: 100 }, connectedNodes: [{ targetNodeId: 'B' }] },
    { id: 'B', type: { requiredProgress: 200 }, connectedNodes: [{ targetNodeId: 'T' }] },
    { id: 'T', type: { requiredProgress: 150 }, connectedNodes: [] },
  ],
};
const pathNodes = {
  A: { state: 'open', currentProgress: 60 },
  B: { state: 'blocked', currentProgress: 0 },
  T: { state: 'blocked', currentProgress: 0 },
};
assert.equal(quantumRemainingToTarget(pathTemplate, pathNodes, 'T'), (100 - 60) + 200);
assert.equal(
  quantumPollDelayMs(pathTemplate, pathNodes, ['T'], { msPerFight: 500 }),
  Math.ceil(240 / 10) * 500,
);
// Ціль уже відкрита — реагувати негайно.
assert.equal(
  quantumPollDelayMs(pathTemplate, { ...pathNodes, T: { state: 'open', currentProgress: 0 } }, ['T']),
  0,
);
// Немає відкритих вузлів або шаблону — безпечний fallback.
assert.equal(quantumPollDelayMs(pathTemplate, {}, ['T'], { fallbackMs: 45_000 }), 45_000);
assert.equal(quantumPollDelayMs(null, pathNodes, ['T'], { fallbackMs: 45_000 }), 45_000);
// Найдешевша з кількох цілей задає каданс.
assert.equal(
  quantumPollDelayMs(pathTemplate, { ...pathNodes, B: { state: 'open', currentProgress: 190 } }, ['B', 'T']),
  0,
);

const captured = require('./results/quantum-snapshot-current.json');
assert.match(normalizeState(captured.state, NOW).templatePath, /^\/quantumMaps\/SteelCitadel\/\d+$/);
assert.ok(Object.keys(normalizeNodes(captured.overview)).length > 0);
assert.ok(Object.keys(normalizeMembers(captured.memberActivity)).length > 0);

console.log('quantum-monitor tests passed');
