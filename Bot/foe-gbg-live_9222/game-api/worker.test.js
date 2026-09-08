'use strict';

const assert = require('assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  overviewChanged,
  buildDiff,
  parsePrivateMessageCommand,
  parseGameMessageDate,
  normalizeGuildMember,
  buildGuildMemberDiff,
  validGuildMemberSnapshot,
  normalizeWorldAssignments,
  configForIdentity,
  workerIdForWorld,
  sameNumericId,
  acquireWorkerLock,
  quantumMapTemplateExists,
  findQuantumMapTemplate,
  quantumMapRotation,
  buildQuantumMapTemplate,
} = require('./worker');

assert.deepStrictEqual(parsePrivateMessageCommand('ПБГ_Гонка'), {
  targetChatName: 'ПБГ',
  text: 'Гонка',
  publishAs: 'bot',
});
assert.deepStrictEqual(parsePrivateMessageCommand('ПБГ_Гонка_2'), {
  targetChatName: 'ПБГ',
  text: 'Гонка_2',
  publishAs: 'bot',
});
assert.deepStrictEqual(parsePrivateMessageCommand('ПБГ_я_Гонка'), {
  targetChatName: 'ПБГ',
  text: 'Гонка',
  publishAs: 'sender',
});
assert.deepStrictEqual(parsePrivateMessageCommand('ПБГ_я_Гонка_2'), {
  targetChatName: 'ПБГ',
  text: 'Гонка_2',
  publishAs: 'sender',
});
assert.strictEqual(parsePrivateMessageCommand('ПБГ_я_'), null);
assert.strictEqual(parsePrivateMessageCommand('без команди'), null);
const messageNow = new Date('2026-08-23T09:32:00+03:00');
assert.strictEqual(
  parseGameMessageDate('сегодня, в 9:22', messageNow).toISOString(),
  '2026-08-23T06:22:00.000Z',
);
assert.strictEqual(
  parseGameMessageDate('23.08., 09:22', messageNow).toISOString(),
  '2026-08-23T06:22:00.000Z',
);
assert.deepStrictEqual(
  normalizeGuildMember({
    player_id: 6464103,
    name: ' ВаДiмкаА ',
    avatar: 'addon_portrait_id_cop_egyptians_maatkare',
  }),
  {
    playerId: '6464103',
    userName: 'ВаДiмкаА',
    avatar: 'addon_portrait_id_cop_egyptians_maatkare',
  },
);
assert.throws(
  () => normalizeGuildMember({ player_id: null, name: 'Broken' }),
  /Некоректний співгільдієць/,
);
const memberDiff = buildGuildMemberDiff(
  [
    { playerId: '1', userName: 'Old', avatar: 'avatar_1' },
    { playerId: '2', userName: 'Gone', avatar: 'avatar_2' },
  ],
  [
    { playerId: '1', userName: 'New', avatar: '' },
    { playerId: '3', userName: 'Added', avatar: 'avatar_3' },
  ],
);
assert.deepStrictEqual(memberDiff.added.map(member => member.playerId), ['3']);
assert.deepStrictEqual(memberDiff.updated, [
  { playerId: '1', userName: 'New', avatar: 'avatar_1' },
]);
assert.deepStrictEqual(memberDiff.removed, ['2']);
assert.strictEqual(validGuildMemberSnapshot({
  schemaVersion: 1,
  guildKey: 'ru11_10821',
  members: memberDiff.members,
}, 'ru11_10821'), true);

const primaryIdentity = {
  playerId: '8183328',
  botType: 'GBGbot',
  worldName: 'ru11',
  guildId: '10821',
};
assert.deepStrictEqual(
  normalizeWorldAssignments([
    { playerId: '33', worldName: 'RU3', guildId: '35536' },
    { playerId: '8183328', worldName: 'ru11', guildId: '10821' },
    { playerId: 'broken', worldName: 'ru5', guildId: '1' },
  ], primaryIdentity),
  [
    { playerId: '8183328', botType: 'GBGbot', worldName: 'ru11', guildId: '10821' },
    { playerId: '33', botType: 'GBGbot', worldName: 'ru3', guildId: '35536' },
  ],
);
assert.deepStrictEqual(normalizeWorldAssignments([], primaryIdentity), [primaryIdentity]);
const ru3Config = configForIdentity({ firebase: { authorizeUrl: 'authorize' } }, {
  playerId: '33', worldName: 'ru3', guildId: '35536', botType: 'GBGbot',
});
assert.strictEqual(ru3Config.gameOrigin, 'https://ru3.forgeofempires.com');
assert.strictEqual(ru3Config.firebase.playerId, '33');
assert.strictEqual(ru3Config.firebase.authorizeUrl, 'authorize');
assert.strictEqual(workerIdForWorld('main-worker', 'ru3'), 'main-worker-ru3');
assert.ok(workerIdForWorld('x'.repeat(100), 'ru11').length <= 100);
assert.equal(sameNumericId('05827', '5827'), true);
assert.equal(sameNumericId('05827', '5828'), false);
const quantumMapCatalog = {
  SteelCitadel: [null, {
    guildRaidsType: 'guildRaidsMiddleAges4',
    difficultyLevel: 1,
    nodes: [{ id: 'a1' }],
  }],
};
assert.equal(
  quantumMapTemplateExists(quantumMapCatalog, 'guildRaidsMiddleAges4', 1),
  true,
);
assert.equal(
  quantumMapTemplateExists(quantumMapCatalog, 'guildRaidsMiddleAges4', 2),
  false,
);
// Наявність шаблону не залежить від rotation: розбіжність повороту не робить
// шаблон «відсутнім» і не запускає повторне пересоздання.
assert.equal(
  quantumMapTemplateExists(quantumMapCatalog, 'guildRaidsMiddleAges4', 1),
  true,
);
assert.equal(
  findQuantumMapTemplate(quantumMapCatalog, 'guildRaidsMiddleAges4', 1).rotation,
  undefined,
);
quantumMapCatalog.SteelCitadel[1].rotation = 90;
assert.equal(
  findQuantumMapTemplate(quantumMapCatalog, 'guildRaidsMiddleAges4', 1).rotation,
  90,
);
assert.equal(findQuantumMapTemplate(quantumMapCatalog, 'guildRaidsMiddleAges4', 2), null);
assert.equal(quantumMapRotation([
  { position: { x: 1, y: 5 } },
  { position: { x: 15, y: 5 } },
]), null);
assert.equal(quantumMapRotation([
  { position: { x: 7, y: 1 } },
  { position: { x: 7, y: 15 } },
]), -90);
assert.equal(quantumMapRotation([
  { position: { x: 7 } },
  { position: { x: 7, y: 15 } },
]), -90);
const newQuantumTemplate = buildQuantumMapTemplate(
  {
    guildRaidsType: 'guildRaidsMiddleAges5',
    difficultyLevel: 2,
    raidName: 'Royal Challenge',
  },
  {
    __class__: 'GuildRaidsMapOverview',
    nodes: [{
      id: 'p6',
      state: { state: 'open', currentProgress: 10 },
      type: { requiredProgress: 520, __class__: 'GuildRaidsMapNodeStart' },
      position: { x: 15, y: 5, __class__: 'Position' },
      connectedNodes: [],
      preferredUnits: ['ignored'],
      __class__: 'GuildRaidsMapNode',
    }],
  },
);
assert.deepStrictEqual(newQuantumTemplate, {
  guildRaidsType: 'guildRaidsMiddleAges5',
  difficultyLevel: 2,
  raidName: 'Royal Challenge',
  nodes: [{
    id: 'p6',
    type: { requiredProgress: 520, __class__: 'GuildRaidsMapNodeStart' },
    position: { x: 15, y: 5, __class__: 'Position' },
    connectedNodes: [],
    __class__: 'GuildRaidsMapNode',
  }],
  __class__: 'GuildRaidsMapOverview',
});
const zeroCoordinateQuantumTemplate = buildQuantumMapTemplate(
  {
    guildRaidsType: 'guildRaidsMiddleAges5',
    difficultyLevel: 4,
    raidName: 'Royal Challenge',
  },
  {
    __class__: 'GuildRaidsMapOverview',
    nodes: [{
      id: 'h1',
      type: { __class__: 'GuildRaidsMapNodeStart' },
      position: { x: 7, __class__: 'Position' },
      connectedNodes: [{
        targetNodeId: 'h3',
        pathTiles: [
          { x: 7, __class__: 'Position' },
          { y: 2, __class__: 'Position' },
        ],
      }],
      __class__: 'GuildRaidsMapNode',
    }],
  },
);
assert.deepStrictEqual(zeroCoordinateQuantumTemplate.nodes[0].position, {
  x: 7,
  y: 0,
  __class__: 'Position',
});
assert.deepStrictEqual(zeroCoordinateQuantumTemplate.nodes[0].connectedNodes[0].pathTiles, [
  { x: 7, y: 0, __class__: 'Position' },
  { x: 0, y: 2, __class__: 'Position' },
]);
const verticalQuantumTemplate = buildQuantumMapTemplate(
  {
    guildRaidsType: 'guildRaidsMiddleAges5',
    difficultyLevel: 3,
    raidName: 'Royal Challenge',
  },
  {
    __class__: 'GuildRaidsMapOverview',
    rotation: 90,
    nodes: [{
      id: 'h2',
      position: { x: 7, y: 1, __class__: 'Position' },
      connectedNodes: [{
        targetNodeId: 'h16',
        pathTiles: [{ x: 7, y: 8, __class__: 'Position' }],
      }],
      __class__: 'GuildRaidsMapNode',
    }, {
      id: 'h16',
      position: { x: 7, y: 15, __class__: 'Position' },
      connectedNodes: [],
      __class__: 'GuildRaidsMapNode',
    }],
  },
);
assert.equal(verticalQuantumTemplate.rotation, -90);
const lockDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'foe-worker-lock-'));
const lockPath = path.join(lockDirectory, 'worker.lock');
const releaseWorkerLock = acquireWorkerLock(lockPath);
assert.throws(() => acquireWorkerLock(lockPath), /Бот уже запущений/);
releaseWorkerLock();
assert.equal(fs.existsSync(lockPath), false);
fs.rmSync(lockDirectory, { recursive: true, force: true });

assert.strictEqual(
  overviewChanged(
    { level: 10, currentProgress: 25, maxProgress: 100 },
    { level: 10, currentProgress: 25, maxProgress: 999 },
  ),
  false,
  'maxProgress must not trigger a detailed request',
);
assert.strictEqual(
  overviewChanged(
    { level: 10, currentProgress: 25 },
    { level: 10, currentProgress: 26 },
  ),
  true,
);

const previous = {
  players: {
    '1': {
      playerName: 'Old name',
      buildings: {
        A: {
          entityId: 11,
          cityEntityId: 'A',
          level: 5,
          currentProgress: 20,
          maxProgress: 100,
          contributors: { '7': { forgePoints: 20 } },
        },
        REMOVED: { cityEntityId: 'REMOVED', level: 1, currentProgress: 0 },
      },
    },
    '2': {
      playerName: 'Departed',
      buildings: { B: { cityEntityId: 'B', level: 1, currentProgress: 1 } },
    },
  },
};
const scanned = [{
  playerId: '1',
  playerName: 'New name',
  buildings: [
    {
      entityId: 11,
      cityEntityId: 'A',
      name: 'A',
      level: 5,
      currentProgress: 20,
      maxProgress: 101,
      contributors: {},
    },
    {
      entityId: 12,
      cityEntityId: 'NEW',
      name: 'New',
      level: 1,
      currentProgress: 3,
      maxProgress: 50,
      contributors: { '8': { rank: 1, forgePoints: 3 } },
      detailLoaded: true,
    },
  ],
}];
const diff = buildDiff(previous, scanned);
assert.deepStrictEqual(Object.keys(diff.changes['1'].upserts), ['NEW']);
assert.deepStrictEqual(diff.changes['1'].deleteBuildingIds, ['REMOVED']);
assert.deepStrictEqual(diff.changes['2'].deleteBuildingIds, ['B']);
assert.deepStrictEqual(
  diff.nextPlayers['1'].buildings.A.contributors,
  { '7': { forgePoints: 20 } },
  'unchanged contributors must be preserved locally',
);
assert.strictEqual(diff.changedCount, 3);
const initialDiff = buildDiff(null, [{
  playerId: '9',
  playerName: 'Initial player',
  buildings: [{
    entityId: 99,
    cityEntityId: 'INITIAL',
    name: 'Initial GB',
    level: 1,
    currentProgress: 0,
    contributors: {},
    detailLoaded: true,
  }],
}]);
assert.deepStrictEqual(Object.keys(initialDiff.changes['9'].upserts), ['INITIAL']);
assert.strictEqual(initialDiff.changedCount, 1);

const {
  pickQuantumMode,
  quantumRollAtMs,
  nextMoscowMidnightMs,
  assertGameSessionsAlive,
} = require('./worker');

// 00:00 MSK == 21:00 UTC, без переведення годинника.
assert.equal(
  new Date(nextMoscowMidnightMs(Date.parse('2026-09-07T15:00:00Z'))).toISOString(),
  '2026-09-07T21:00:00.000Z',
);
assert.equal(
  new Date(nextMoscowMidnightMs(Date.parse('2026-09-07T22:00:00Z'))).toISOString(),
  '2026-09-08T21:00:00.000Z',
);

const runningRaid = {
  stateClass: 'GuildRaidsRunningState',
  guildRaidsType: 'guildRaidsMiddleAges5',
  difficultyLevel: 5,
  expiresAt: 1788814800, // 2026-09-08 00:00 MSK
  endsAt: 1789362000, // 2026-09-14 08:00 MSK
};
const midDay = Date.parse('2026-09-07T15:56:00Z');
assert.equal(quantumRollAtMs(runningRaid, midDay), 1788814800 * 1000);
// Сигнал присутності недоступний (стара функція) — лишаємось у live.
assert.equal(pickQuantumMode(runningRaid, midDay, null).mode, 'live');
// Ніхто не дивиться і підписок нема — сон.
assert.equal(pickQuantumMode(runningRaid, midDay, { viewers: 0, notificationNodes: [] }).mode, 'idle');
// Хтось відкрив екран.
assert.equal(pickQuantumMode(runningRaid, midDay, { viewers: 1 }).mode, 'live');
// Є підписка, екран ніхто не тримає.
assert.equal(
  pickQuantumMode(runningRaid, midDay, { viewers: 0, notificationNodes: ['h6'] }).mode,
  'light',
);
// Близько опівнічного скидання — режим roll, незалежно від присутності.
assert.equal(
  pickQuantumMode(runningRaid, Date.parse('2026-09-07T20:58:00Z'), { viewers: 0 }).mode,
  'roll',
);
// Рейд не активний — discovery.
assert.equal(
  pickQuantumMode({ stateClass: 'GuildRaidsPendingState', startsAt: 1788411600 }, midDay, { viewers: 0 }).mode,
  'discovery',
);

// Стоп бота лише коли мертві ВСІ світи і давно.
const now = Date.now();
assert.doesNotThrow(() => assertGameSessionsAlive(
  [{ sessionDeadSince: 0 }, { sessionDeadSince: now - 10 * 60_000 }],
  {},
));
assert.throws(() => assertGameSessionsAlive(
  [{ sessionDeadSince: now - 10 * 60_000 }, { sessionDeadSince: now - 5 * 60_000 }],
  {},
), /бот зупинено/);

console.log('worker tests: ok');
