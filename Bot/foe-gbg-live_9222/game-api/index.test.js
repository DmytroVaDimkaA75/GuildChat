'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  contributorsFromConstruction,
  normalizeBattleground,
  normalizeSectorBuildings,
  isGameJsonUrl,
  extractSignatureSalt,
  makePayloadSignature,
  makeRequest,
  parseCli,
  redactEndpoint,
} = require('./index');

test('parseCli accepts a numeric player id', () => {
  assert.deepEqual(parseCli(['overview', '5623117']), {
    command: 'overview',
    playerId: '5623117',
  });
});

test('parseCli accepts the read-only timers probe', () => {
  assert.deepEqual(parseCli(['timers']), {
    command: 'timers',
    playerId: null,
  });
});

test('parseCli accepts capture-reload', () => {
  assert.deepEqual(parseCli(['capture-reload']), {
    command: 'capture-reload',
    playerId: null,
  });
});

test('parseCli accepts contributors with a player id', () => {
  assert.deepEqual(parseCli(['contributors', '5623117']), {
    command: 'contributors',
    playerId: '5623117',
  });
});

test('parseCli accepts guild-contributors without a player id', () => {
  assert.deepEqual(parseCli(['guild-contributors']), {
    command: 'guild-contributors',
    playerId: null,
  });
});

test('parseCli accepts inventory for the authenticated session', () => {
  assert.deepEqual(parseCli(['inventory']), {
    command: 'inventory',
    playerId: null,
  });
});

test('parseCli rejects a player id for inventory', () => {
  assert.throws(() => parseCli(['inventory', '6464103']), /не приймає playerId/);
});

test('parseCli rejects a missing player id', () => {
  assert.throws(() => parseCli(['overview']), /playerId/);
});

test('makeRequest creates the captured FoE envelope', () => {
  assert.deepEqual(makeRequest('A', 'b', [1], 7), [{
    __class__: 'ServerRequest',
    requestData: [1],
    requestClass: 'A',
    requestMethod: 'b',
    requestId: 7,
  }]);
});

test('makePayloadSignature is stable and has the game format', () => {
  const signature = makePayloadSignature(
    'https://ru11.forgeofempires.com/game/json?h=test-hash',
    '[{"requestId":1}]',
  );
  assert.equal(signature, '48f820d782');
  assert.match(signature, /^[0-9a-f]{10}$/);
});

test('extractSignatureSalt reads the salt from a minified game client', () => {
  const salt = 'replacementSalt0123456789+/replacementSalt0123456789==';
  const source = `_generateRequestPayloadSignature:function(a){return hash(this._signatureHash+"${salt}"+a)}`;
  assert.equal(extractSignatureSalt(source), salt);
  assert.equal(extractSignatureSalt('function without a signature salt'), null);
});

test('contributorsFromConstruction normalizes rankings', () => {
  assert.deepEqual(contributorsFromConstruction({
    rankings: [{
      rank: 1,
      forge_points: 42,
      player: { player_id: 7, name: 'Player', avatar: 'portrait' },
    }],
  }), [{
    rank: 1,
    playerId: 7,
    playerName: 'Player',
    avatar: 'portrait',
    forgePoints: 42,
  }]);
});

test('normalizeBattleground resolves sector owners and progress', () => {
  const result = normalizeBattleground({
    map: {
      id: 'waterfall_archipelago',
      provinces: [{
        id: 1,
        ownerId: 10,
        lockedUntil: 200,
        conquestProgress: [{ participantId: 11, progress: 5, maxProgress: 100 }],
        totalBuildingSlots: 3,
        usedBuildingSlots: 2,
      }],
    },
    battlegroundParticipants: [
      { participantId: 10, colour: 'red', clan: { id: 100, name: 'Owner' } },
      { participantId: 11, colour: 'blue', clan: { id: 101, name: 'Attacker' } },
    ],
  }, 100, [
    { id: 'red', mainColour: '#ff0000' },
    { id: 'blue', mainColour: '#0000ff' },
  ]);
  assert.equal(result.sectorCount, 1);
  assert.equal(result.sectors[0].code, 'A2A');
  assert.equal(result.sectors[0].ownerClanId, 100);
  assert.equal(result.sectors[0].ownerColor, '#ff0000');
  assert.equal(result.participants[1].sectorColor, '#0000ff');
  assert.equal(result.sectors[0].isLocked, true);
  assert.equal(result.sectors[0].conquestProgress[0].clanName, 'Attacker');
});

test('normalizeSectorBuildings preserves placed building details', () => {
  const result = normalizeSectorBuildings({
    provinceId: 5,
    freeSlots: 1,
    placedBuildings: [{ id: 'tower', slotId: 0, finishedAt: 123 }],
    availableBuildings: [{ buildingId: 'tower' }],
  });
  assert.equal(result.provinceId, 5);
  assert.equal(result.freeBuildingSlots, 1);
  assert.deepEqual(result.buildings[0], {
    id: 'tower',
    slotId: 0,
    readyAt: 123,
    raw: { id: 'tower', slotId: 0, finishedAt: 123 },
  });
});

test('endpoint helpers validate origin and hide session parameters', () => {
  const url = 'https://ru11.forgeofempires.com/game/json?h=secret';
  assert.equal(isGameJsonUrl(url, 'https://ru11.forgeofempires.com'), true);
  assert.equal(isGameJsonUrl(url, 'https://en1.forgeofempires.com'), false);
  assert.equal(
    redactEndpoint(url),
    'https://ru11.forgeofempires.com/game/json?<session-params>',
  );
});
