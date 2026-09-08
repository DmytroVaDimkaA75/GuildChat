'use strict';

const assert = require('node:assert/strict');
const { cleanQuantumMap, normalizePosition } = require('./clean-quantum-map');

assert.deepEqual(normalizePosition({ x: 7, __class__: 'Position' }), {
  x: 7,
  y: 0,
  __class__: 'Position',
});

const cleanMap = cleanQuantumMap({
  state: {
    guildRaidsType: 'guildRaidsMiddleAges4',
    raidInstance: { difficultyLevel: 8 },
  },
  overview: {
    __class__: 'GuildRaidsMapOverview',
    nodes: [{
      id: 'h1',
      type: { __class__: 'GuildRaidsMapNodeStart' },
      position: { x: 7, __class__: 'Position' },
      connectedNodes: [{
        targetNodeId: 'd4',
        pathTiles: [{ x: 6, __class__: 'Position' }],
      }],
      __class__: 'GuildRaidsMapNode',
    }],
  },
});

assert.deepEqual(cleanMap.nodes[0].position, {
  x: 7,
  y: 0,
  __class__: 'Position',
});
assert.deepEqual(cleanMap.nodes[0].connectedNodes[0].pathTiles[0], {
  x: 6,
  y: 0,
  __class__: 'Position',
});

console.log('clean-quantum-map tests passed');
