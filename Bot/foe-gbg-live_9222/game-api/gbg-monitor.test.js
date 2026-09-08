'use strict';

const assert = require('assert');
const {
  appMapId,
  normalizeWaitingSeason,
  normalizeOpponents,
  sameNumericId,
  normalizeMapSectors,
  normalizePlayerLeaderboard,
  assertBattlegroundGuild,
  buildFirebaseUpdates,
  nextHourlyMinute,
  collectGbgSnapshot,
} = require('./gbg-monitor');

assert.doesNotThrow(() => assertBattlegroundGuild(
  { battlegroundParticipants: [{ clan: { id: 10821 } }] },
  { worldName: 'ru11', guildId: '10821' },
));
assert.throws(
  () => assertBattlegroundGuild(
    { battlegroundParticipants: [{ clan: { id: 999 } }] },
    { worldName: 'ru11', guildId: '10821' },
  ),
  /запис у Firebase скасовано/,
);

assert.strictEqual(appMapId('volcano_archipelago'), 'volcanic_archipelago');
assert.strictEqual(appMapId('waterfall_archipelago'), 'waterfall_archipelago');
assert.deepStrictEqual(
  normalizeWaitingSeason({ stateId: 'subscribed', startsAt: 1787806800 }),
  { stateId: 'subscribed', startsAt: 1787806800 },
);
assert.deepStrictEqual(
  normalizeWaitingSeason({ stateId: 'subscribed', startsAt: 'invalid' }),
  { stateId: 'subscribed' },
);

const ownGuildNormalized = {
  participants: [
    { participantId: 10, clanId: 10821, clanName: 'Own', sectorColor: '#00FF00' },
    { participantId: 20, clanId: 999, clanName: 'Other', sectorColor: '#FF0000' },
  ],
  sectors: [
    {
      id: 1,
      code: 'A1',
      ownerClanId: 10821,
      ownerParticipantId: 10,
      ownerColor: '#00FF00',
      isLocked: false,
      lockedUntil: 0,
      battleType: 'attack',
      totalBuildingSlots: 1,
    },
    {
      id: 2,
      code: 'A2',
      ownerClanId: 999,
      ownerParticipantId: 20,
      ownerColor: '#FF0000',
      isLocked: false,
      lockedUntil: 0,
      battleType: 'defense',
      totalBuildingSlots: 3,
    },
  ],
};
const coloredOpponents = normalizeOpponents(
  { battlegroundParticipants: [] },
  ownGuildNormalized,
  [],
  false,
  {},
  10821,
);
assert.strictEqual(coloredOpponents['10821'].sectorColor, '#4B5563');
assert.strictEqual(coloredOpponents['999'].sectorColor, '#FF0000');
assert.strictEqual(coloredOpponents['10821'].staff, 'A1');
assert.strictEqual(coloredOpponents['999'].staff, undefined);
const coloredSectors = normalizeMapSectors(ownGuildNormalized, {}, 10821);
assert.strictEqual(coloredSectors.A1.color, '#4B5563');
assert.strictEqual(coloredSectors.A2.color, '#FF0000');
assert.strictEqual(coloredSectors.A1.isOwn, true);
assert.strictEqual(coloredSectors.A2.isOwn, false);
assert.strictEqual(sameNumericId('05827', '5827'), true);
const leadingZeroSectors = normalizeMapSectors({
  sectors: [{ ...ownGuildNormalized.sectors[0], ownerClanId: 5827 }],
}, {}, '05827');
assert.strictEqual(leadingZeroSectors.A1.isOwn, true);
assert.strictEqual(leadingZeroSectors.A1.color, '#4B5563');

assert.deepStrictEqual(
  normalizePlayerLeaderboard([
    {
      player: { player_id: 6464103 },
      rank: 7,
      battlesWon: 100,
      attrition: 42,
    },
  ], 'waterfall_archipelago'),
  {
    mapId: 'waterfall_archipelago',
    '6464103': {
      rank: 7,
      negotiationsWon: 0,
      battlesWon: 100,
      attrition: 42,
    },
  },
);

const previous = {
  mapId: 'waterfall_archipelago',
  season: { stateId: 'participating', seasonId: 'one' },
  opponents: {
    '10821': {
      id: '10821',
      name: 'Стара назва',
      sectorColor: '#111111',
      staff: 'X1X',
      victoryPoints: 50,
      rank: 1,
    },
  },
  sectors: {
    X1X: {
      internalId: 0,
      owner: '10821',
      color: '#111111',
      openTime: 10,
      army: 'attack',
      buildings: {},
      freeSlots: 3,
      nextEmptySlotCheckAt: 999,
    },
  },
  playerLeaderboard: {
    mapId: 'waterfall_archipelago',
    '6464103': { rank: 1, negotiationsWon: 0, battlesWon: 10, attrition: 1 },
  },
};
const next = JSON.parse(JSON.stringify(previous));
next.opponents['10821'].name = 'Нова назва';
next.opponents['10821'].staff = 'A4A';
next.sectors.X1X.openTime = 20;
next.sectors.X1X.nextEmptySlotCheckAt = 123456;
next.playerLeaderboard['6464103'].battlesWon = 11;
const updates = buildFirebaseUpdates(previous, next);
assert.deepStrictEqual(updates, {
  'GBG/opponents/10821/name': 'Нова назва',
  'GBG/opponents/10821/staff': 'A4A',
  'GBG/sectors/X1X/openTime': 20,
  'GBG/PlayerLeaderboard/6464103': {
    rank: 1,
    negotiationsWon: 0,
    battlesWon: 11,
    attrition: 1,
  },
});
assert.strictEqual(
  Object.keys(updates).some(key => key.includes('nextEmptySlotCheckAt')),
  false,
  'local scheduling fields must never be written to Firebase',
);

assert.deepStrictEqual(
  buildFirebaseUpdates(
    { season: { stateId: 'participating' } },
    {
      stateId: 'participating',
      startsAt: 1787806800,
      endsAt: 1788757200,
      opponents: {},
      sectors: {},
      playerLeaderboard: {},
    },
  ),
  {
    'GBG/stateId': 'participating',
    'GBG/startsAt': 1787806800,
    'GBG/endsAt': 1788757200,
    'GBG/season': null,
  },
);

const hourlyBase = new Date('2026-08-23T10:01:30.000Z').getTime();
assert.strictEqual(
  nextHourlyMinute(hourlyBase, 2),
  new Date('2026-08-23T10:02:00.000Z').getTime(),
);
assert.strictEqual(
  nextHourlyMinute(new Date('2026-08-23T10:02:00.000Z').getTime(), 2),
  new Date('2026-08-23T11:02:00.000Z').getTime(),
);

async function testSeasonRequestGating() {
  const makeSession = state => {
    let requestId = 0;
    const sentMethods = [];
    return {
      sentMethods,
      allocateRequest(requestClass, requestMethod, requestData) {
        return { requestClass, requestMethod, requestData, requestId: ++requestId };
      },
      async send(requests) {
        const list = Array.isArray(requests) ? requests : [requests];
        sentMethods.push(list.map(item => `${item.requestClass}.${item.requestMethod}`));
        return list.map(request => ({
          requestId: request.requestId,
          responseData: request.requestMethod === 'getState'
            ? state
            : request.requestMethod === 'getBattleground'
              ? {
                  map: { id: 'waterfall_archipelago', provinces: [] },
                  battlegroundParticipants: [{ participantId: 1, clan: { id: 10821, name: 'Own' } }],
                  endsAt: 1788757200,
                }
              : [],
        }));
      },
      response(messages, request) {
        return messages.find(item => item.requestId === request.requestId);
      },
      async sendBatches() {
        throw new Error('Sector requests are not expected in this test');
      },
    };
  };
  const identity = { worldName: 'ru11', guildId: '10821' };
  const waitingPrevious = {
    schemaVersion: 1,
    guildKey: 'ru11_10821',
    phase: 'waiting',
    stateId: 'subscribed',
    startsAt: 1787806800,
    colorData: [],
  };

  const waitingSession = makeSession({
    stateId: 'subscribed',
    startsAt: 1787806800,
  });
  const waiting = await collectGbgSnapshot({
    session: waitingSession,
    identity,
    previous: waitingPrevious,
    nowMs: 1000,
    options: {},
  });
  assert.deepStrictEqual(waitingSession.sentMethods, []);
  assert.strictEqual(waiting.active, false);
  assert.strictEqual(waiting.phase, 'waiting');
  assert.strictEqual(waiting.nextPollAt, 1787806800 * 1000);

  const discoverySession = makeSession({
    stateId: 'subscribed',
    startsAt: 1787806800,
  });
  const discovered = await collectGbgSnapshot({
    session: discoverySession,
    identity,
    previous: null,
    nowMs: 1000,
    options: {},
  });
  assert.deepStrictEqual(discoverySession.sentMethods, [[
    'GuildBattlegroundStateService.getState',
  ]]);
  assert.strictEqual(discovered.resetWaiting, true);
  assert.strictEqual(discovered.phase, 'waiting');

  const trialSession = makeSession({ stateId: 'trialSelection' });
  const trial = await collectGbgSnapshot({
    session: trialSession,
    identity,
    previous: null,
    nowMs: 1000,
    options: {},
  });
  assert.deepStrictEqual(trialSession.sentMethods, [
    ['GuildBattlegroundStateService.getState'],
    [
      'StaticDataService.getDataDirectly',
      'GuildBattlegroundService.getBattleground',
      'GuildBattlegroundService.getPlayerLeaderboard',
    ],
  ]);
  assert.strictEqual(trial.phase, 'bootstrap');

  const endingSession = makeSession({
    stateId: 'subscribed',
    startsAt: 1787806800,
  });
  const ending = await collectGbgSnapshot({
    session: endingSession,
    identity,
    previous: {
      schemaVersion: 1,
      guildKey: 'ru11_10821',
      phase: 'active',
      stateId: 'participating',
      endsAt: 1,
    },
    nowMs: 2000,
    options: {},
  });
  assert.deepStrictEqual(endingSession.sentMethods, [[
    'GuildBattlegroundStateService.getState',
  ]]);
  assert.strictEqual(ending.resetWaiting, true);
  assert.deepStrictEqual(
    { stateId: ending.snapshot.stateId, startsAt: ending.snapshot.startsAt },
    { stateId: 'subscribed', startsAt: 1787806800 },
  );

  const activeSession = makeSession({ stateId: 'subscribed' });
  const active = await collectGbgSnapshot({
    session: activeSession,
    identity,
    previous: {
      schemaVersion: 1,
      guildKey: 'ru11_10821',
      phase: 'active',
      stateId: 'participating',
      startsAt: 1,
      endsAt: 1788757200,
      mapId: 'waterfall_archipelago',
      colorData: [],
      opponents: {},
      sectors: {},
      playerLeaderboard: {},
    },
    nowMs: 2000,
    options: {},
  });
  assert.deepStrictEqual(activeSession.sentMethods, [[
    'GuildBattlegroundService.getBattleground',
  ]]);
  assert.strictEqual(active.active, true);
}

testSeasonRequestGating()
  .then(() => console.log('gbg monitor tests: ok'))
  .catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
