'use strict';

const fs = require('node:fs');
const path = require('node:path');

function normalizePosition(position) {
  return {
    ...position,
    x: Number(position?.x ?? 0),
    y: Number(position?.y ?? 0),
  };
}

function normalizeConnection(connection) {
  return {
    ...connection,
    pathTiles: Array.isArray(connection?.pathTiles)
      ? connection.pathTiles.map(normalizePosition)
      : connection?.pathTiles,
  };
}

function cleanQuantumMap(rawSnapshot) {
  const state = rawSnapshot?.state;
  const overview = rawSnapshot?.overview;
  const raid = state?.raidInstance;
  if (!state || !raid || !Array.isArray(overview?.nodes)) {
    throw new Error('Файл не містить повного quantum snapshot зі state та overview.nodes');
  }
  return {
    guildRaidsType: String(state.guildRaidsType || ''),
    difficultyLevel: Number(raid.difficultyLevel),
    raidName: 'Steel Citadel',
    nodes: overview.nodes.map(node => ({
      id: node.id,
      type: node.type,
      position: normalizePosition(node.position),
      connectedNodes: Array.isArray(node.connectedNodes)
        ? node.connectedNodes.map(normalizeConnection)
        : node.connectedNodes,
      __class__: node.__class__,
    })),
    __class__: overview.__class__,
  };
}

function main() {
  const inputPath = path.resolve(process.argv[2] || path.join(
    __dirname,
    'results',
    'quantum-snapshot-current.json',
  ));
  const outputPath = path.resolve(process.argv[3] || path.join(
    __dirname,
    'results',
    'level1.json',
  ));
  const cleanMap = cleanQuantumMap(JSON.parse(fs.readFileSync(inputPath, 'utf8')));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(cleanMap, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    inputPath,
    outputPath,
    difficultyLevel: cleanMap.difficultyLevel,
    nodeCount: cleanMap.nodes.length,
  }));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

module.exports = { cleanQuantumMap, normalizePosition };
