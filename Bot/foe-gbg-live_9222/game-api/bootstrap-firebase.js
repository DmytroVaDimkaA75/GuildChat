'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const RESULTS_DIR = path.join(ROOT_DIR, 'results');
const CONFIG_PATH = path.join(ROOT_DIR, 'config.json');
const CACHE_DIR = path.join(ROOT_DIR, 'local-scan-cache');
const MAX_CHANGES_BYTES = 1_000_000;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function latestReportPath() {
  const candidates = fs.readdirSync(RESULTS_DIR)
    .filter(name => /^guild-contributors-.*\.json$/i.test(name))
    .map(name => path.join(RESULTS_DIR, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  if (!candidates.length) throw new Error('Не знайдено повного звіту guild-contributors');
  return candidates[0];
}

function assertCompleteReport(report) {
  if (!report || !Array.isArray(report.players) || !report.players.length) {
    throw new Error('Звіт не містить гравців');
  }
  if (Number(report.overviewErrorCount) !== 0 || Number(report.constructionErrorCount) !== 0) {
    throw new Error(
      `Неповний звіт: overview errors=${report.overviewErrorCount}; ` +
      `construction errors=${report.constructionErrorCount}`,
    );
  }
  for (const player of report.players) {
    if (player?.error || !Array.isArray(player?.buildings)) {
      throw new Error(`Неповні дані гравця ${player?.playerId ?? 'unknown'}`);
    }
    const failedBuilding = player.buildings.find(building => building?.error);
    if (failedBuilding) {
      throw new Error(
        `Неповні дані споруди ${failedBuilding.cityEntityId || failedBuilding.entityId}`,
      );
    }
  }
}

function firebaseBuilding(building) {
  const contributors = {};
  for (const contributor of Array.isArray(building.contributors)
    ? building.contributors
    : []) {
    if (contributor?.playerId == null) continue;
    contributors[String(contributor.playerId)] = {
      rank: Math.max(1, Math.floor(Number(contributor.rank) || 1)),
      forgePoints: Number(contributor.forgePoints) || 0,
      playerName: String(contributor.playerName || '').trim(),
      avatar: String(contributor.avatar || '').trim(),
    };
  }
  return {
    level: Number(building.level) || 0,
    contributors,
    status: 'active',
    ...(Number(building.currentProgress) === 0 ? { lock: true } : {}),
  };
}

function localBuilding(building) {
  return {
    entityId: building.entityId ?? null,
    cityEntityId: String(building.cityEntityId || '').trim(),
    name: String(building.name || '').trim(),
    level: Number(building.level) || 0,
    currentProgress: Number(building.currentProgress) || 0,
    maxProgress: Number(building.maxProgress) || 0,
    contributors: firebaseBuilding(building).contributors,
    status: 'active',
    ...(Number(building.currentProgress) === 0 ? { lock: true } : {}),
  };
}

function buildImport(report, guildKey) {
  const changes = {};
  const players = {};
  for (const player of report.players) {
    const ownerPlayerId = String(player.playerId);
    const upserts = {};
    const buildings = {};
    for (const building of player.buildings) {
      const cityEntityId = String(building.cityEntityId || '').trim();
      if (!cityEntityId) {
        throw new Error(`Споруда гравця ${ownerPlayerId} не має cityEntityId`);
      }
      if (upserts[cityEntityId]) {
        throw new Error(`Дубль ${ownerPlayerId}/${cityEntityId}`);
      }
      upserts[cityEntityId] = firebaseBuilding(building);
      buildings[cityEntityId] = localBuilding(building);
    }
    changes[ownerPlayerId] = {
      upserts,
      deleteBuildingIds: [],
      activeBuildingIds: Object.keys(upserts),
    };
    players[ownerPlayerId] = {
      playerName: String(player.playerName || '').trim(),
      buildings,
    };
  }
  const snapshot = {
    schemaVersion: 1,
    guildKey,
    baselineId: report.capturedAt || new Date().toISOString(),
    cycleNumber: 1,
    status: 'completed',
    startedAt: report.capturedAt || new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    players,
  };
  return { changes, snapshot };
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_error) {
    data = null;
  }
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `HTTP ${response.status}`);
  }
  return data;
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const reportArgument = args.find(argument => argument !== '--dry-run');
  const reportPath = reportArgument
    ? path.resolve(process.cwd(), reportArgument)
    : latestReportPath();
  const report = readJson(reportPath);
  assertCompleteReport(report);

  const config = readJson(CONFIG_PATH);
  const firebase = config.firebase || {};
  if (!firebase.enabled || !firebase.authorizeUrl || !firebase.guildDataUrl) {
    throw new Error('Firebase у GB-bot не налаштований');
  }
  const guildId = String(report.guildId || '').trim();
  const overrideEntry = Object.entries(firebase.guildOverrides || {})
    .find(([, value]) => String(value?.guildId) === guildId);
  if (!overrideEntry) {
    throw new Error(`Не знайдено Firebase bot identity для guildId=${guildId}`);
  }
  const [playerId, override] = overrideEntry;
  const worldName = String(override.worldName || '').toLowerCase();
  const guildKey = `${worldName}_${guildId}`;
  const { changes, snapshot } = buildImport(report, guildKey);
  const changesBytes = Buffer.byteLength(JSON.stringify(changes), 'utf8');
  const buildingCount = Object.values(changes)
    .reduce((total, change) => total + Object.keys(change.upserts).length, 0);
  console.log(
    `Підготовлено: гравців=${Object.keys(changes).length}; ` +
    `споруд=${buildingCount}; пакет=${changesBytes} байт`,
  );
  if (changesBytes > MAX_CHANGES_BYTES) {
    throw new Error(`Пакет перевищує серверний ліміт ${MAX_CHANGES_BYTES} байт`);
  }
  if (dryRun) {
    console.log('Dry run: Firebase і локальний current-знімок не змінено');
    return;
  }

  const authorization = await postJson(firebase.authorizeUrl, {
    playerId,
    botType: String(firebase.botType || 'GBGbot'),
    worldName,
    guildId,
  });
  if (authorization.guildKey !== guildKey) {
    throw new Error(
      `Сервер авторизував іншу гільдію: ${authorization.guildKey || 'unknown'}`,
    );
  }
  const result = await postJson(firebase.guildDataUrl, {
    playerId,
    botType: String(firebase.botType || 'GBGbot'),
    worldName,
    guildId,
    action: 'great-buildings-cycle-commit',
    changes,
  });

  const currentPath = path.join(CACHE_DIR, `${guildKey}-current.json`);
  const previousPath = path.join(CACHE_DIR, `${guildKey}-previous.json`);
  if (fs.existsSync(currentPath)) fs.copyFileSync(currentPath, previousPath);
  writeJsonAtomic(currentPath, snapshot);
  console.log(
    `Firebase: upsert=${result.upsertCount ?? 0}; delete=${result.deleteCount ?? 0}; ` +
    `гравців=${result.playerCount ?? Object.keys(changes).length}`,
  );
  console.log(`Локальний знімок: ${currentPath}`);
}

main().catch(error => {
  console.error(`Помилка: ${error.stack || error.message}`);
  process.exitCode = 1;
});
