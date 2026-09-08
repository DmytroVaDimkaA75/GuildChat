'use strict';

const fs = require('fs');
const path = require('path');
const {
  contributorsFromConstruction,
  formatElapsed,
} = require('./index');
const { GameSession } = require('./game-session');
const { resolveCaptureConfig } = require('./capture-quantum-snapshot');
const {
  MAP_POLL_MS,
  PLAYER_LEADERBOARD_POLL_MS,
  BUILDING_FULL_AUDIT_MS,
  buildFirebaseUpdates,
  due,
  nextHourlyMinute,
  readSnapshot: readGbgSnapshot,
  writeSnapshotAtomic: writeGbgSnapshotAtomic,
  collectGbgSnapshot,
} = require('./gbg-monitor');
const {
  MAP_POLL_MS: QUANTUM_MAP_POLL_MS,
  MEMBER_POLL_MS: QUANTUM_MEMBER_POLL_MS,
  DETAIL_REFRESH_MS: QUANTUM_DETAIL_REFRESH_MS,
  HEARTBEAT_MS: QUANTUM_HEARTBEAT_MS,
  snapshotsEqual: quantumSnapshotsEqual,
  isRunning: quantumIsRunning,
  quantumPollDelayMs,
  collectQuantumSnapshot,
} = require('./quantum-monitor');

const ROOT_DIR = __dirname;
const CONFIG_PATH = path.join(ROOT_DIR, 'config.json');
const CACHE_DIR = path.join(ROOT_DIR, 'local-scan-cache');
const WORKER_LOCK_PATH = path.join(ROOT_DIR, '.worker.lock');
const QUANTUM_MAPS_SNAPSHOT_PATH = path.join(
  CACHE_DIR,
  'quantum-maps-server-current.json',
);

function processIsRunning(processId) {
  if (!Number.isSafeInteger(processId) || processId <= 0) return false;
  try {
    process.kill(processId, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireWorkerLock(lockPath = WORKER_LOCK_PATH) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(descriptor, `${process.pid}\n`, 'utf8');
      let released = false;
      return () => {
        if (released) return;
        released = true;
        fs.closeSync(descriptor);
        const owner = Number.parseInt(fs.readFileSync(lockPath, 'utf8'), 10);
        if (owner === process.pid) fs.unlinkSync(lockPath);
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = Number.parseInt(fs.readFileSync(lockPath, 'utf8'), 10);
      if (processIsRunning(owner)) {
        throw new Error(
          `Бот уже запущений (PID ${owner}). Другий екземпляр не запускається, ` +
          'щоб процеси не перезавантажували вкладки один одному.',
        );
      }
      fs.unlinkSync(lockPath);
    }
  }
  throw new Error('Не вдалося отримати блокування запуску бота');
}

async function withWorldLogPrefix(worldName, callback) {
  const prefix = `[${worldName}]`;
  const methods = ['log', 'warn', 'error'];
  const originals = Object.fromEntries(methods.map(method => [method, console[method]]));
  for (const method of methods) {
    console[method] = (...values) => {
      if (typeof values[0] === 'string' && values[0].startsWith(prefix)) {
        originals[method](...values);
      } else {
        originals[method](prefix, ...values);
      }
    };
  }
  try {
    return await callback();
  } finally {
    for (const method of methods) console[method] = originals[method];
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function normalizeWorldAssignments(value, primaryIdentity) {
  const assignments = Array.isArray(value) ? value : [];
  const candidates = assignments.length ? assignments : [primaryIdentity];
  const byWorld = new Map();
  for (const candidate of candidates) {
    const playerId = String(candidate?.playerId || '').trim();
    const worldName = String(candidate?.worldName || '').trim().toLowerCase();
    const guildId = String(candidate?.guildId || '').trim();
    if (
      !/^\d{1,20}$/.test(playerId) ||
      !/^[a-z]{2,4}\d{1,4}$/.test(worldName) ||
      !/^\d{1,20}$/.test(guildId)
    ) {
      continue;
    }
    byWorld.set(worldName, {
      playerId,
      botType: 'GBGbot',
      worldName,
      guildId,
    });
  }
  if (!byWorld.has(primaryIdentity.worldName)) {
    byWorld.set(primaryIdentity.worldName, primaryIdentity);
  }
  return [...byWorld.values()].sort((left, right) =>
    left.worldName.localeCompare(right.worldName));
}

function configForIdentity(baseConfig, identity) {
  return {
    ...baseConfig,
    gameOrigin: `https://${identity.worldName}.forgeofempires.com`,
    firebase: {
      ...baseConfig.firebase,
      playerId: identity.playerId,
      worldName: identity.worldName,
      guildId: identity.guildId,
    },
  };
}

function workerIdForWorld(baseWorkerId, worldName) {
  const suffix = `-${worldName}`;
  const maximumBaseLength = Math.max(1, 100 - suffix.length);
  return `${String(baseWorkerId).slice(0, maximumBaseLength)}${suffix}`;
}

function sameNumericId(left, right) {
  const leftValue = String(left || '').trim();
  const rightValue = String(right || '').trim();
  if (!/^\d+$/.test(leftValue) || !/^\d+$/.test(rightValue)) return false;
  return BigInt(leftValue) === BigInt(rightValue);
}

const FIREBASE_TRAFFIC_LOG_PATH = path.join(CACHE_DIR, 'firebase-traffic.log');

function logFirebaseTraffic(url, body, reqBytes, resBytes, durationMs) {
  try {
    const action = body?.action || (url.includes('authorizeBot') ? 'authorize' : 'unknown');
    const line = `${new Date().toISOString()}\t${action}\treq=${reqBytes}\tres=${resBytes}\t${durationMs}ms\n`;
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.appendFileSync(FIREBASE_TRAFFIC_LOG_PATH, line, 'utf8');
  } catch (_error) {
    // Logging must never break the worker.
  }
}

async function postJson(url, body) {
  const startedAtMs = Date.now();
  const requestBody = JSON.stringify(body);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: requestBody,
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  logFirebaseTraffic(
    url,
    body,
    Buffer.byteLength(requestBody, 'utf8'),
    Buffer.byteLength(text, 'utf8'),
    Date.now() - startedAtMs,
  );
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_error) {
    // The status below still contains the useful failure category.
  }
  if (!response.ok || data?.ok === false) {
    const error = new Error(data?.message || data?.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.code = data?.error;
    throw error;
  }
  return data;
}

function normalizeOverviewBuilding(row) {
  const cityEntityId = String(row?.city_entity_id || '').trim();
  const entityId = Number(row?.entity_id);
  if (!cityEntityId || !Number.isFinite(entityId)) {
    throw new Error(`Некоректна споруда в overview: ${JSON.stringify(row).slice(0, 300)}`);
  }
  return {
    entityId,
    cityEntityId,
    name: String(row?.name || '').trim(),
    level: Number(row?.level) || 0,
    currentProgress: Number(row?.current_progress) || 0,
    maxProgress: Number(row?.max_progress) || 0,
    contributors: {},
    status: 'active',
    ...(Number(row?.current_progress) === 0 ? { lock: true } : {}),
  };
}

function overviewChanged(previous, current) {
  return !previous ||
    Number(previous.level) !== Number(current.level) ||
    Number(previous.currentProgress) !== Number(current.currentProgress);
}

function contributorsObject(construction) {
  return Object.fromEntries(
    contributorsFromConstruction(construction)
      .filter(item => item.playerId != null)
      .map(item => [String(item.playerId), {
        rank: Math.max(1, Math.floor(Number(item.rank) || 1)),
        forgePoints: Number(item.forgePoints) || 0,
        playerName: String(item.playerName || '').trim(),
        avatar: String(item.avatar || '').trim(),
      }]),
  );
}

function firebaseBuilding(building) {
  return {
    level: Number(building.level) || 0,
    contributors: building.contributors || {},
    status: 'active',
    ...(building.lock === true ? { lock: true } : {}),
  };
}

function buildDiff(previousSnapshot, scannedPlayers) {
  const previousPlayers = previousSnapshot?.players || {};
  const nextPlayers = {};
  const changes = {};
  let changedCount = 0;

  for (const player of scannedPlayers) {
    const playerId = String(player.playerId);
    const previousBuildings = previousPlayers[playerId]?.buildings || {};
    const buildings = {};
    const upserts = {};
    const activeIds = new Set();

    for (const building of player.buildings) {
      const cityEntityId = building.cityEntityId;
      if (activeIds.has(cityEntityId)) {
        throw new Error(`Дубль споруди ${playerId}/${cityEntityId}`);
      }
      activeIds.add(cityEntityId);
      const previous = previousBuildings[cityEntityId];
      const changed = overviewChanged(previous, building);
      buildings[cityEntityId] = changed
        ? building
        : {
            ...building,
            contributors: previous.contributors || {},
            status: 'active',
            ...(building.currentProgress === 0 ? { lock: true } : {}),
          };
      if (changed) {
        if (!building.detailLoaded) {
          throw new Error(`Немає детальних даних ${playerId}/${cityEntityId}`);
        }
        upserts[cityEntityId] = firebaseBuilding(building);
        changedCount += 1;
      }
      delete buildings[cityEntityId].detailLoaded;
    }

    const deleteBuildingIds = Object.keys(previousBuildings)
      .filter(cityEntityId => !activeIds.has(cityEntityId));
    changedCount += deleteBuildingIds.length;
    if (Object.keys(upserts).length || deleteBuildingIds.length) {
      changes[playerId] = { upserts, deleteBuildingIds };
    }
    nextPlayers[playerId] = {
      playerName: player.playerName,
      buildings,
    };
  }

  const activePlayerIds = new Set(scannedPlayers.map(player => String(player.playerId)));
  for (const [playerId, previousPlayer] of Object.entries(previousPlayers)) {
    if (activePlayerIds.has(playerId)) continue;
    const deleteBuildingIds = Object.keys(previousPlayer?.buildings || {});
    if (deleteBuildingIds.length) {
      changes[playerId] = { upserts: {}, deleteBuildingIds };
      changedCount += deleteBuildingIds.length;
    }
  }

  return { changes, nextPlayers, changedCount };
}

function parsePrivateMessageCommand(value) {
  const text = String(value ?? '').trim();
  const separator = text.indexOf('_');
  if (separator <= 0 || separator >= text.length - 1) return null;
  const targetChatName = text.slice(0, separator).trim();
  const payload = text.slice(separator + 1).trim();
  const publishAsSender = payload.startsWith('я_');
  const messageText = publishAsSender ? payload.slice(2).trim() : payload;
  if (!targetChatName || !messageText) return null;
  return {
    targetChatName,
    text: messageText,
    publishAs: publishAsSender ? 'sender' : 'bot',
  };
}

function parseGameMessageDate(value, now = new Date()) {
  const text = String(value ?? '').trim();
  const time = text.match(/(\d{1,2}):(\d{2})/);
  if (!time) return null;
  const result = new Date(now);
  result.setSeconds(0, 0);
  result.setHours(Number(time[1]), Number(time[2]));
  if (/^(?:вчера|учора|yesterday)/iu.test(text)) {
    result.setDate(result.getDate() - 1);
    return result;
  }
  if (/^(?:сегодня|сьогодні|today)/iu.test(text)) return result;
  const date = text.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?/);
  if (!date) return null;
  const suppliedYear = date[3] == null ? now.getFullYear() : Number(date[3]);
  const year = suppliedYear < 100 ? 2000 + suppliedYear : suppliedYear;
  result.setFullYear(year, Number(date[2]) - 1, Number(date[1]));
  return result;
}

function normalizeGuildMember(value) {
  const playerId = String(value?.player_id ?? '').trim();
  const userName = String(value?.name ?? '').trim();
  const avatar = String(value?.avatar ?? '').trim();
  if (!/^\d{1,20}$/.test(playerId) || !userName) {
    throw new Error(`Некоректний співгільдієць: ${JSON.stringify(value).slice(0, 300)}`);
  }
  return { playerId, userName, avatar };
}

function buildGuildMemberDiff(previousMembers, currentMembers) {
  const previousById = new Map(
    (Array.isArray(previousMembers) ? previousMembers : [])
      .map(member => [String(member.playerId), member]),
  );
  const normalizedCurrent = currentMembers
    .map(member => ({
      ...member,
      avatar: member.avatar || String(previousById.get(member.playerId)?.avatar || ''),
    }))
    .sort((left, right) => left.playerId.localeCompare(right.playerId));
  const currentById = new Map(normalizedCurrent.map(member => [member.playerId, member]));
  const added = [];
  const updated = [];
  for (const member of normalizedCurrent) {
    const previous = previousById.get(member.playerId);
    if (!previous) {
      added.push(member);
    } else if (
      String(previous.userName || '') !== member.userName ||
      String(previous.avatar || '') !== member.avatar
    ) {
      updated.push(member);
    }
  }
  const removed = [...previousById.keys()]
    .filter(playerId => !currentById.has(playerId))
    .sort();
  return { members: normalizedCurrent, added, updated, removed };
}

function validGuildMemberSnapshot(value, guildKey) {
  return value?.schemaVersion === 1 && value?.guildKey === guildKey &&
    Array.isArray(value.members) && value.members.every(member =>
      /^\d{1,20}$/.test(String(member?.playerId || '')) &&
      Boolean(String(member?.userName || '').trim()));
}

async function collectGuildMembers(config, gameSession = null) {
  const ownedSession = !gameSession;
  const session = gameSession || await GameSession.connect(config);
  try {
    const clanRequest = session.allocateRequest(
      'ClanService', 'getOwnClanData', [],
    );
    const responses = await session.send(clanRequest);
    const response = session.response(responses, clanRequest);
    const rawMembers = response?.responseData?.members;
    if (!Array.isArray(rawMembers) || !rawMembers.length) {
      throw new Error('ClanService.getOwnClanData не повернув список співгільдійців');
    }
    const members = rawMembers.map(normalizeGuildMember);
    if (new Set(members.map(member => member.playerId)).size !== members.length) {
      throw new Error('FoE повернула повторний playerId у списку співгільдійців');
    }
    return members;
  } finally {
    if (ownedSession) await session.close();
  }
}

async function syncGuildMembers(config, identity, gameSession = null) {
  const collectedMembers = await collectGuildMembers(config, gameSession);
  if (!collectedMembers.some(member => member.playerId === identity.playerId)) {
    throw new Error('Список співгільдійців не містить акаунт GBGbot; синхронізацію скасовано');
  }
  const guildKey = `${identity.worldName}_${identity.guildId}`;
  const snapshotPath = path.join(CACHE_DIR, `${guildKey}-guild-members.json`);
  let previousSnapshot = null;
  if (fs.existsSync(snapshotPath)) {
    try {
      const candidate = readJson(snapshotPath);
      if (validGuildMemberSnapshot(candidate, guildKey)) previousSnapshot = candidate;
    } catch (error) {
      console.warn(`Локальний знімок складу пошкоджений: ${error.message}`);
    }
  }
  if (
    previousSnapshot?.members?.length >= 10 &&
    collectedMembers.length < Math.ceil(previousSnapshot.members.length / 2)
  ) {
    throw new Error(
      `FoE повернула підозріло короткий список: ${collectedMembers.length} із ` +
      `${previousSnapshot.members.length}; синхронізацію скасовано`,
    );
  }

  const diff = buildGuildMemberDiff(previousSnapshot?.members, collectedMembers);
  const now = Date.now();
  const fullReconcileIntervalMs = Math.max(
    60 * 60 * 1000,
    Number(config.worker?.guildMemberFullReconcileIntervalMs) || 24 * 60 * 60 * 1000,
  );
  const lastFullReconcileAt = Date.parse(previousSnapshot?.lastFullReconcileAt || '');
  const needsFullReconcile = !previousSnapshot || !Number.isFinite(lastFullReconcileAt) ||
    now - lastFullReconcileAt >= fullReconcileIntervalMs;
  let result;
  let mode;
  if (needsFullReconcile) {
    mode = 'повна звірка';
    result = await postJson(config.firebase.guildDataUrl, {
      ...identity,
      action: 'guild-members-sync',
      members: diff.members,
    });
  } else if (diff.added.length || diff.updated.length || diff.removed.length) {
    mode = 'лише зміни';
    result = await postJson(config.firebase.guildDataUrl, {
      ...identity,
      action: 'guild-members-diff-sync',
      changes: {
        added: diff.added,
        updated: diff.updated,
        removed: diff.removed,
      },
    });
  } else {
    mode = 'без звернення до Firebase';
    result = {
      memberCount: diff.members.length,
      changedPlayerCount: 0,
      createdUserCount: 0,
      addedMembershipCount: 0,
      removedGuildUserCount: 0,
      deletedUserCount: 0,
      updateCount: 0,
    };
  }

  writeJsonAtomic(
    snapshotPath,
    {
      schemaVersion: 1,
      guildKey,
      checkedAt: new Date(now).toISOString(),
      lastFullReconcileAt: needsFullReconcile
        ? new Date(now).toISOString()
        : previousSnapshot.lastFullReconcileAt,
      members: diff.members,
    },
  );
  console.log(
    `Склад гільдії (${mode}): отримано=${diff.members.length}; ` +
    `змінено=${result.changedPlayerCount}; нових users=${result.createdUserCount}; ` +
    `додано членств=${result.addedMembershipCount}; ` +
    `видалено з гільдії=${result.removedGuildUserCount}; ` +
    `видалено users=${result.deletedUserCount}; записів=${result.updateCount}`,
  );
  return result;
}

async function collectPrivateMessages(config, gameSession = null) {
  const ownedSession = !gameSession;
  const session = gameSession || await GameSession.connect(config);
  try {
    const categoryRequests = [
      session.allocateRequest(
        'ConversationService', 'getCategory', ['social', 100, 0, 'none'],
      ),
      session.allocateRequest(
        'ConversationService', 'getCategory', ['social', 100, 0, 'hidden'],
      ),
    ];
    const categoryMessages = await session.send(categoryRequests);
    const directConversations = new Map();
    for (const request of categoryRequests) {
      const response = session.response(categoryMessages, request);
      if (!response || !Array.isArray(response.responseData?.teasers)) {
        throw new Error(`Не отримано приватні розмови (${request.requestData[3]})`);
      }
      for (const teaser of response.responseData.teasers) {
        if (Number(teaser?.type) !== 1 || teaser?.id == null) continue;
        directConversations.set(String(teaser.id), teaser);
      }
    }

    const conversationTasks = [...directConversations.values()].map(teaser => ({
      teaser,
      request: session.allocateRequest(
        'ConversationService', 'getConversation', [Number(teaser.id), 30],
      ),
    }));
    const conversationMessages = conversationTasks.length
      ? await session.sendBatches(
          conversationTasks.map(item => item.request),
          40,
          'Приватні повідомлення',
        )
      : [];
    const messages = [];
    for (const task of conversationTasks) {
      const response = session.response(conversationMessages, task.request);
      if (!response || !Array.isArray(response.responseData?.messages)) {
        throw new Error(`Не отримано приватну розмову ${task.teaser.id}`);
      }
      for (const message of response.responseData.messages) {
        messages.push({
          messageId: String(message.id),
          conversationId: String(message.conversationId || task.teaser.id),
          text: String(message.text || ''),
          date: String(message.date || ''),
          senderPlayerId: String(message.sender?.player_id || ''),
          senderName: String(message.sender?.name || ''),
          deleted: message.deleted === true,
        });
      }
    }
    return messages;
  } finally {
    if (ownedSession) await session.close();
  }
}

async function pollPrivateMessageCommands(config, identity, gameSession = null) {
  const guildKey = `${identity.worldName}_${identity.guildId}`;
  const statePath = path.join(
    CACHE_DIR,
    `${guildKey}-private-message-state.json`,
  );
  const state = fs.existsSync(statePath)
    ? readJson(statePath)
    : { schemaVersion: 1, guildKey, seen: {} };
  const seen = state.seen && typeof state.seen === 'object' ? state.seen : {};
  const messages = await collectPrivateMessages(config, gameSession);
  const now = new Date();
  let publishedCount = 0;
  let ignoredCount = 0;

  for (const message of messages) {
    if (!message.messageId || seen[message.messageId]) continue;
    const messageDate = parseGameMessageDate(message.date, now);
    const ageMs = messageDate ? now.getTime() - messageDate.getTime() : Infinity;
    const isFresh = ageMs >= 0 && ageMs <= 60 * 60 * 1000;
    const isIncoming = message.senderPlayerId !== identity.playerId;
    const command = parsePrivateMessageCommand(message.text);
    if (message.deleted || !isFresh || !isIncoming || !command) {
      seen[message.messageId] = Date.now();
      ignoredCount += 1;
      const reason = message.deleted
        ? 'видалене'
        : !isFresh
          ? `не свіже (дата FoE: «${message.date || 'відсутня'}»)`
          : !isIncoming
            ? 'надіслане самим ботом'
            : 'не є командою виду Чат_Текст або Чат_я_Текст';
      console.log(`Приватне повідомлення ${message.messageId} проігноровано: ${reason}`);
      continue;
    }

    try {
      const result = await postJson(config.firebase.guildDataUrl, {
        ...identity,
        action: 'foe-private-command-publish',
        sourceMessageId: message.messageId,
        sourceConversationId: message.conversationId,
        senderPlayerId: message.senderPlayerId,
        senderName: message.senderName,
        targetChatName: command.targetChatName,
        text: command.text,
        publishAs: command.publishAs,
      });
      seen[message.messageId] = Date.now();
      publishedCount += result.duplicate ? 0 : 1;
      console.log(
        `Приватна команда від ${message.senderName || message.senderPlayerId}: ` +
        `чат «${command.targetChatName}», автор=${command.publishAs}, ` +
        `повідомлення «${command.text}»` +
        `${result.duplicate ? ' (вже оброблено)' : ''}`,
      );
    } catch (error) {
      if (error.code === 'sender-not-guild-member') {
        seen[message.messageId] = Date.now();
        ignoredCount += 1;
        console.warn(
          `Приватне повідомлення ${message.messageId} відхилено: відправник не співгільдієць`,
        );
        continue;
      }
      console.error(`Команду ${message.messageId} не опубліковано: ${error.message}`);
    }
  }

  const compactSeen = Object.fromEntries(
    Object.entries(seen)
      .sort((left, right) => Number(right[1]) - Number(left[1]))
      .slice(0, 5000),
  );
  writeJsonAtomic(statePath, {
    schemaVersion: 1,
    guildKey,
    lastPollAt: new Date().toISOString(),
    seen: compactSeen,
  });
  console.log(
    `Перевірка приватних повідомлень: отримано=${messages.length}; ` +
    `опубліковано=${publishedCount}; проігноровано=${ignoredCount}`,
  );
  return { messageCount: messages.length, publishedCount, ignoredCount };
}

async function collectGuildGreatBuildings(config, previousSnapshot, gameSession = null) {
  const ownedSession = !gameSession;
  const session = gameSession || await GameSession.connect(config);
  try {
    const clanRequest = session.allocateRequest(
      'ClanService', 'getOwnClanData', [],
    );
    const clanMessages = await session.send(clanRequest);
    const clanResponse = session.response(clanMessages, clanRequest);
    const members = clanResponse?.responseData?.members;
    if (!Array.isArray(members) || !members.length) {
      throw new Error('ClanService.getOwnClanData не повернув список співгільдійців');
    }

    const overviewTasks = members.map(member => ({
      member,
      request: session.allocateRequest(
        'GreatBuildingsService',
        'getOtherPlayerOverview',
        [Number(member.player_id)],
      ),
    }));
    const overviewMessages = await session.sendBatches(
      overviewTasks.map(item => item.request),
      40,
      'Огляди ВС',
    );
    const scannedPlayers = overviewTasks.map(({ member, request }) => {
      const response = session.response(overviewMessages, request);
      if (!response || !Array.isArray(response.responseData)) {
        throw new Error(`Немає overview для playerId=${member.player_id}`);
      }
      return {
        playerId: String(member.player_id),
        playerName: String(member.name || '').trim(),
        buildings: response.responseData.map(normalizeOverviewBuilding),
      };
    });

    const detailTasks = [];
    for (const player of scannedPlayers) {
      const previousBuildings = previousSnapshot?.players?.[player.playerId]?.buildings || {};
      for (const building of player.buildings) {
        if (!overviewChanged(previousBuildings[building.cityEntityId], building)) continue;
        detailTasks.push({
          player,
          building,
          request: session.allocateRequest(
            'GreatBuildingsService',
            'getConstruction',
            [building.entityId, Number(player.playerId)],
          ),
        });
      }
    }

    let detailMessages = [];
    if (detailTasks.length) {
      detailMessages = await session.sendBatches(
        detailTasks.map(item => item.request),
        40,
        'Вкладники змінених ВС',
      );
    }
    for (const task of detailTasks) {
      const response = session.response(detailMessages, task.request);
      if (!response || !response.responseData) {
        throw new Error(
          `Немає construction для ${task.player.playerId}/${task.building.cityEntityId}`,
        );
      }
      task.building.contributors = contributorsObject(response.responseData);
      task.building.detailLoaded = true;
    }
    return {
      guildId: clanResponse.responseData.id,
      guildName: clanResponse.responseData.name,
      scannedPlayers,
      detailCount: detailTasks.length,
    };
  } finally {
    if (ownedSession) await session.close();
  }
}

function makeIdentity(config) {
  const firebase = config.firebase || {};
  for (const key of ['authorizeUrl', 'guildDataUrl', 'playerId', 'worldName', 'guildId']) {
    if (!firebase[key]) throw new Error(`У config.json відсутнє firebase.${key}`);
  }
  return {
    playerId: String(firebase.playerId),
    botType: String(firebase.botType || 'GBGbot'),
    worldName: String(firebase.worldName).toLowerCase(),
    guildId: String(firebase.guildId),
  };
}

async function runClaimedJob(config, identity, workerId, job, gameSession = null) {
  const startedAtMs = Date.now();
  const guildKey = `${identity.worldName}_${identity.guildId}`;
  const currentPath = path.join(CACHE_DIR, `${guildKey}-current.json`);
  const previousPath = path.join(CACHE_DIR, `${guildKey}-previous.json`);
  const currentSnapshot = fs.existsSync(currentPath)
    ? readJson(currentPath)
    : {
        schemaVersion: 1,
        guildKey,
        baselineId: new Date(startedAtMs).toISOString(),
        cycleNumber: 0,
        status: 'initializing',
        players: {},
      };
  if (!currentSnapshot) throw new Error(`Не знайдено локальну базу ${currentPath}`);

  const heartbeatIntervalMs = Math.max(
    10000,
    Number(config.worker?.heartbeatIntervalMs) || 30000,
  );
  const heartbeat = setInterval(() => {
    postJson(config.firebase.guildDataUrl, {
      ...identity,
      action: 'great-buildings-refresh-heartbeat',
      workerId,
      requestId: job.requestId,
    }).catch(error => console.error(`Heartbeat: ${error.message}`));
  }, heartbeatIntervalMs);
  heartbeat.unref();

  try {
    console.log(`Запуск оновлення ВС, requestId=${job.requestId}`);
    const scan = await collectGuildGreatBuildings(config, currentSnapshot, gameSession);
    if (!sameNumericId(scan.guildId, identity.guildId)) {
      throw new Error(`Відкрита інша гільдія: ${scan.guildId}`);
    }
    const diff = buildDiff(currentSnapshot, scan.scannedPlayers);
    const fullReconcileIntervalMs = Math.max(
      60_000,
      Number(config.worker?.greatBuildingFullReconcileIntervalMs) || 86_400_000,
    );
    const previousFullReconcileAt = Date.parse(
      String(currentSnapshot.lastFullReconcileAt || ''),
    );
    const performFullReconcile =
      !Number.isFinite(previousFullReconcileAt) ||
      Date.now() - previousFullReconcileAt >= fullReconcileIntervalMs;
    const changes = { ...diff.changes };
    if (performFullReconcile) {
      for (const [playerId, player] of Object.entries(diff.nextPlayers)) {
        changes[playerId] = {
          upserts: Object.fromEntries(
            Object.entries(player.buildings).map(([cityEntityId, building]) => [
              cityEntityId,
              firebaseBuilding(building),
            ]),
          ),
          deleteBuildingIds: diff.changes[playerId]?.deleteBuildingIds || [],
          activeBuildingIds: Object.keys(player.buildings),
        };
      }
    }
    const durationMs = Date.now() - startedAtMs;
    const result = await postJson(config.firebase.guildDataUrl, {
      ...identity,
      action: 'great-buildings-refresh-complete',
      workerId,
      requestId: job.requestId,
      changes,
      durationMs,
      stats: {
        playerCount: scan.scannedPlayers.length,
        overviewCount: scan.scannedPlayers.reduce(
          (total, player) => total + player.buildings.length,
          0,
        ),
        detailedCount: scan.detailCount,
        changedCount: diff.changedCount,
      },
    });

    const now = new Date().toISOString();
    const nextSnapshot = {
      schemaVersion: 1,
      guildKey,
      baselineId: currentSnapshot.baselineId || now,
      cycleNumber: Number(currentSnapshot.cycleNumber || 0) + 1,
      status: 'completed',
      startedAt: new Date(startedAtMs).toISOString(),
      finishedAt: now,
      lastFullReconcileAt: performFullReconcile
        ? now
        : currentSnapshot.lastFullReconcileAt,
      players: diff.nextPlayers,
    };
    if (fs.existsSync(currentPath)) fs.copyFileSync(currentPath, previousPath);
    writeJsonAtomic(currentPath, nextSnapshot);
    console.log(
      `Готово: гравців=${scan.scannedPlayers.length}; ВС=${result.overviewCount}; ` +
      `детально=${scan.detailCount}; змін=${diff.changedCount}; ` +
      `Firebase upsert=${result.upsertCount}; delete=${result.deleteCount}; ` +
      `час=${formatElapsed(durationMs)}`,
    );
  } finally {
    clearInterval(heartbeat);
  }
}

async function runGbgCycle(
  config,
  identity,
  gameSession,
  nowMs = Date.now(),
  forceReplace = false,
) {
  const expectedOrigin = `https://${identity.worldName}.forgeofempires.com`;
  let actualOrigin;
  try {
    actualOrigin = new URL(gameSession.page.url()).origin;
  } catch (_error) {
    actualOrigin = null;
  }
  if (actualOrigin !== expectedOrigin) {
    throw new Error(
      `Сесію ПБГ відкрито для ${actualOrigin || 'невідомої адреси'}, ` +
      `очікувався світ ${expectedOrigin}; запис у Firebase скасовано`,
    );
  }
  const guildKey = `${identity.worldName}_${identity.guildId}`;
  const snapshotPath = path.join(CACHE_DIR, `${guildKey}-gbg-current.json`);
  const previous = readGbgSnapshot(snapshotPath, guildKey);
  const leaderboardIntervalMs = Math.max(
    60_000,
    Number(config.worker?.gbgPlayerLeaderboardPollIntervalMs) ||
      PLAYER_LEADERBOARD_POLL_MS,
  );
  const buildingAuditIntervalMs = Math.max(
    5 * 60_000,
    Number(config.worker?.gbgBuildingFullAuditIntervalMs) ||
      BUILDING_FULL_AUDIT_MS,
  );
  const guildPointsMinute = Math.min(
    59,
    Math.max(0, Number(config.worker?.gbgGuildPointsMinute) || 2),
  );
  const leaderboardDue = due(
    previous?.lastLeaderboardScanAt,
    leaderboardIntervalMs,
    nowMs,
  );
  const guildPointsDue = previous
    ? nowMs >= Number(
        previous.nextGuildPointsScanAt || nextHourlyMinute(nowMs, guildPointsMinute),
      )
    : new Date(nowMs).getMinutes() === guildPointsMinute;
  const buildingAuditDue = due(
    previous?.lastFullBuildingAuditAt,
    buildingAuditIntervalMs,
    nowMs,
  );
  const result = await collectGbgSnapshot({
    session: gameSession,
    identity,
    previous,
    nowMs,
    options: {
      getColors: !previous,
      getLeaderboard: leaderboardDue,
      includeGuildPoints: guildPointsDue,
      fullBuildingAudit: buildingAuditDue,
      seasonDurationSeconds: config.worker?.gbgSeasonDurationSeconds,
      emptySlotRecheckMs: config.worker?.gbgEmptySlotRecheckIntervalMs,
      guildPointsMinute,
      retryIntervalMs: Number(config.worker?.gbgMapPollIntervalMs) || MAP_POLL_MS,
      mapPollIntervalMs: Number(config.worker?.gbgMapPollIntervalMs) || MAP_POLL_MS,
    },
  });
  let updateCount = 0;
  if (result.resetWaiting) {
    await postJson(config.firebase.guildDataUrl, {
      ...identity,
      action: 'gbg-reset-waiting',
      stateId: result.snapshot.stateId,
      startsAt: result.snapshot.startsAt,
    });
    updateCount = 1;
  } else if (result.phase !== 'waiting' && result.phase !== 'ending') {
    const replaceGbg = forceReplace || result.stats.seasonChanged || buildingAuditDue;
    const updates = buildFirebaseUpdates(replaceGbg ? null : previous, result.snapshot);
    updateCount = Object.keys(updates).length;
    if (updateCount) {
      await postJson(config.firebase.guildDataUrl, {
        ...identity,
        action: replaceGbg ? 'gbg-replace' : 'gbg-batch-update',
        updates,
      });
    }
  }
  writeGbgSnapshotAtomic(snapshotPath, result.snapshot);
  console.log(
    `ПБГ: стан=${result.snapshot.stateId || 'unknown'}; фаза=${result.phase}; ` +
    `секторів=${result.stats.sectorCount || 0}; ` +
    `детальних запитів=${result.stats.requestedBuildingCount}; ` +
    `змін Firebase=${updateCount}`,
  );
  return { ...result, updateCount };
}

// Кванти опитуються не постійно, а лише коли це комусь потрібно (машина станів):
//  live       — хтось відкрив екран квантової карти в додатку
//  light      — екран ніхто не тримає, але є підписки на стани вузлів
//  roll       — вікно опівнічного скидання складності або кінця сезону
//  discovery  — рейд не підтверджено активним (між сезонами / очікування старту)
//  idle       — нічого з переліченого; жодного запиту до гри
const QUANTUM_IDLE_RECHECK_MS = 4_000;
const QUANTUM_BETWEEN_SEASON_MS = 30 * 60_000;
const QUANTUM_ROLL_LEAD_MS = 5 * 60_000;
const QUANTUM_ROLL_CAP_MS = 20 * 60_000;
const QUANTUM_MS_PER_FIGHT = 500;
// Москва — постійний UTC+3 без переведення годинника, тож 00:00 MSK = 21:00 UTC.
const MOSCOW_MIDNIGHT_UTC_HOUR = 21;

function nextMoscowMidnightMs(nowMs) {
  const date = new Date(nowMs);
  const candidate = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    MOSCOW_MIDNIGHT_UTC_HOUR,
  );
  return candidate > nowMs ? candidate : candidate + 86_400_000;
}

function quantumRollAtMs(previous, nowMs) {
  const expiresMs = Number(previous?.expiresAt) * 1000;
  // Поки з моменту expiresAt минуло менше 6 год — вважаємо, що скидання ще
  // «те саме» (сервер міг забаритись), і тримаємось за нього.
  if (Number.isFinite(expiresMs) && expiresMs > 0 && nowMs < expiresMs + 6 * 60 * 60_000) {
    return expiresMs;
  }
  return nextMoscowMidnightMs(nowMs);
}

// Щоб «режим=сон» не засмічував лог кожні кілька секунд.
const quantumIdleLoggedAt = new Map();

function readQuantumCatalog() {
  if (!fs.existsSync(QUANTUM_MAPS_SNAPSHOT_PATH)) return null;
  try {
    return readJson(QUANTUM_MAPS_SNAPSHOT_PATH);
  } catch (error) {
    console.warn(`Локальний знімок quantumMaps пошкоджений: ${error.message}`);
    return null;
  }
}

function pickQuantumMode(previous, nowMs, signals) {
  const running = quantumIsRunning(previous, nowMs);
  const rollAtMs = quantumRollAtMs(previous, nowMs);
  const seasonEndMs = Number(previous?.endsAt) * 1000;
  // Скидання «настало, але ще не побачене»: expiresAt минув, а знімок досі на
  // старій складності. Тримаємось у roll, доки сервер не віддасть нову карту.
  const rollOverdue = running &&
    nowMs >= rollAtMs && nowMs < rollAtMs + 6 * 60 * 60_000;
  const nearRoll = running && (
    rollOverdue ||
    (nowMs >= rollAtMs - QUANTUM_ROLL_LEAD_MS && nowMs <= rollAtMs + QUANTUM_ROLL_CAP_MS)
  );
  const nearSeasonEnd = running &&
    Number.isFinite(seasonEndMs) && nowMs >= seasonEndMs - QUANTUM_ROLL_LEAD_MS;

  if (!running) return { mode: 'discovery', notificationNodes: [], rollAtMs };
  if (nearRoll || nearSeasonEnd) return { mode: 'roll', notificationNodes: [], rollAtMs };

  // Сигнал присутності недоступний (стара Cloud Function без поля quantum) —
  // не ризикуємо застоєм даних, поводимось як раніше: постійний живий режим.
  if (!signals || typeof signals !== 'object') {
    return { mode: 'live', notificationNodes: [], rollAtMs };
  }

  const viewers = Math.max(0, Number(signals.viewers) || 0);
  const notificationNodes = Array.isArray(signals.notificationNodes)
    ? signals.notificationNodes.map(String).filter(Boolean)
    : [];
  if (viewers > 0) return { mode: 'live', notificationNodes, rollAtMs };
  if (notificationNodes.length) return { mode: 'light', notificationNodes, rollAtMs };
  return { mode: 'idle', notificationNodes, rollAtMs };
}

async function runQuantumCycle(config, identity, getSession, nowMs = Date.now(), signals = {}) {
  const guildKey = `${identity.worldName}_${identity.guildId}`;
  const snapshotPath = path.join(CACHE_DIR, `${guildKey}-quantum-current.json`);
  const previous = fs.existsSync(snapshotPath) ? readJson(snapshotPath) : null;

  const liveCadenceMs = Math.max(
    10_000,
    Number(config.worker?.quantumMapPollIntervalMs) || QUANTUM_MAP_POLL_MS,
  );
  const { mode, notificationNodes, rollAtMs } = pickQuantumMode(previous, nowMs, signals);

  if (mode === 'idle') {
    const nextPollAt = Math.min(
      nowMs + QUANTUM_IDLE_RECHECK_MS,
      Math.max(nowMs + 1_000, rollAtMs - QUANTUM_ROLL_LEAD_MS),
    );
    if (nowMs - (quantumIdleLoggedAt.get(guildKey) || 0) > 5 * 60_000) {
      console.log('Кванти: режим=сон (глядачів немає, підписок немає); запитів до гри 0');
      quantumIdleLoggedAt.set(guildKey, nowMs);
    }
    return { snapshot: previous, nextPollAt, wroteFirebase: false, mode };
  }

  const gameSession = typeof getSession === 'function' ? await getSession() : getSession;
  const snapshot = await collectQuantumSnapshot(gameSession, previous, {
    nowMs,
    mode,
    mapPollMs: liveCadenceMs,
    memberPollMs: Math.max(
      60_000,
      Number(config.worker?.quantumMemberPollIntervalMs) || QUANTUM_MEMBER_POLL_MS,
    ),
    detailRefreshMs: Math.max(
      10_000,
      Number(config.worker?.quantumDetailRefreshIntervalMs) || QUANTUM_DETAIL_REFRESH_MS,
    ),
    ensureMapTemplate: (state, overview) => ensureQuantumMapTemplate(
      config,
      identity,
      state,
      overview,
    ),
  });
  const heartbeatMs = Math.max(
    60_000,
    Number(config.worker?.quantumFirebaseHeartbeatIntervalMs) || QUANTUM_HEARTBEAT_MS,
  );
  const lastWriteAt = Date.parse(String(previous?.lastFirebaseWriteAt || '')) || 0;
  const changed = !quantumSnapshotsEqual(previous, snapshot);
  const heartbeatDue = lastWriteAt + heartbeatMs <= nowMs;
  let wroteFirebase = false;

  if (changed || heartbeatDue) {
    const {
      nextPollAt: _nextPollAt,
      lastFirebaseWriteAt: _lastFirebaseWriteAt,
      mapFingerprint: _mapFingerprint,
      ...firebaseSnapshot
    } = snapshot;
    await postJson(config.firebase.guildDataUrl, {
      ...identity,
      action: 'quantum-set',
      snapshot: firebaseSnapshot,
    });
    snapshot.lastFirebaseWriteAt = new Date(nowMs).toISOString();
    wroteFirebase = true;
  } else if (previous?.lastFirebaseWriteAt) {
    snapshot.lastFirebaseWriteAt = previous.lastFirebaseWriteAt;
  }

  let nextPollAt;
  if (mode === 'discovery') {
    if (quantumIsRunning(snapshot, nowMs)) {
      // Рейд щойно виявився активним — наступний цикл обере справжній режим.
      nextPollAt = nowMs + liveCadenceMs;
    } else {
      const startsAtMs = Number(snapshot.startsAt) * 1000;
      nextPollAt = Number.isFinite(startsAtMs) && startsAtMs > nowMs
        ? Math.min(startsAtMs, nowMs + QUANTUM_BETWEEN_SEASON_MS)
        : nowMs + QUANTUM_BETWEEN_SEASON_MS;
    }
  } else if (mode === 'light') {
    const template = findQuantumMapTemplate(
      readQuantumCatalog(),
      snapshot.guildRaidsType,
      snapshot.difficultyLevel,
    );
    const delayMs = quantumPollDelayMs(template, snapshot.nodes, notificationNodes, {
      msPerFight: QUANTUM_MS_PER_FIGHT,
    });
    const ceilingMs = Math.max(liveCadenceMs, rollAtMs - QUANTUM_ROLL_LEAD_MS - nowMs);
    nextPollAt = nowMs + Math.min(Math.max(delayMs, liveCadenceMs), ceilingMs);
  } else {
    // live / roll
    nextPollAt = nowMs + liveCadenceMs;
  }

  writeJsonAtomic(snapshotPath, snapshot);
  console.log(
    `Кванти: режим=${mode}; стан=${snapshot.stateClass}; ` +
    `вузлів=${Object.keys(snapshot.nodes || {}).length}; ` +
    `відкритих=${Object.values(snapshot.nodes || {}).filter(node => node.state === 'open').length}; ` +
    `учасників=${Object.keys(snapshot.members || {}).length}; ` +
    `Firebase=${wroteFirebase ? 'оновлено' : 'без змін'}; ` +
    `далі через ${Math.round((nextPollAt - nowMs) / 1000)} с`,
  );
  return { snapshot, nextPollAt, wroteFirebase, mode };
}

// Наявність шаблону визначається лише типом рейду, рівнем і набором вузлів.
// Поле rotation у цю перевірку НЕ входить: бот уміє порахувати тільки -90/нічого,
// а в каталозі бувають і ручні 90. Розбіжність повороту не повинна змушувати
// бота знову і знову пересоздавати вже наявний шаблон.
function findQuantumMapTemplate(catalog, guildRaidsType, difficultyLevel) {
  const expectedType = String(guildRaidsType || '').trim();
  const expectedLevel = Number(difficultyLevel);
  if (!catalog || typeof catalog !== 'object' || !expectedType || !Number.isInteger(expectedLevel)) {
    return null;
  }
  for (const levels of Object.values(catalog)) {
    const template = levels?.[expectedLevel];
    if (
      template &&
      String(template.guildRaidsType || '').trim() === expectedType &&
      Number(template.difficultyLevel) === expectedLevel &&
      Array.isArray(template.nodes) && template.nodes.length > 0
    ) {
      return template;
    }
  }
  return null;
}

function quantumMapTemplateExists(catalog, guildRaidsType, difficultyLevel) {
  return findQuantumMapTemplate(catalog, guildRaidsType, difficultyLevel) != null;
}

function normalizeQuantumMapPosition(position) {
  if (!position || typeof position !== 'object' || Array.isArray(position)) {
    return position;
  }
  return {
    ...position,
    x: position.x == null ? 0 : position.x,
    y: position.y == null ? 0 : position.y,
  };
}

function normalizeQuantumMapConnection(connection) {
  if (!connection || typeof connection !== 'object' || Array.isArray(connection)) {
    return connection;
  }
  return {
    ...connection,
    ...(Array.isArray(connection.pathTiles) ? {
      pathTiles: connection.pathTiles.map(normalizeQuantumMapPosition),
    } : {}),
  };
}

function quantumMapRotation(nodes) {
  if (!Array.isArray(nodes) || nodes.length < 2) return null;

  const positions = [];
  const addPosition = position => {
    const normalized = normalizeQuantumMapPosition(position);
    const x = Number(normalized?.x);
    const y = Number(normalized?.y);
    if (Number.isFinite(x) && Number.isFinite(y)) positions.push({ x, y });
  };

  for (const node of nodes) {
    addPosition(node?.position);
    for (const connection of node?.connectedNodes || []) {
      for (const pathTile of connection?.pathTiles || []) addPosition(pathTile);
    }
  }
  if (positions.length < 2) return null;

  const xs = positions.map(position => position.x);
  const ys = positions.map(position => position.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  return height > width ? -90 : null;
}

function buildQuantumMapTemplate(state, overview) {
  const guildRaidsType = String(state?.guildRaidsType || '').trim();
  const difficultyLevel = Number(state?.difficultyLevel);
  if (!guildRaidsType || !Number.isInteger(difficultyLevel) || difficultyLevel <= 0) {
    throw new Error('Не вдалося визначити тип або рівень квантової карти');
  }
  if (!Array.isArray(overview?.nodes) || !overview.nodes.length) {
    throw new Error('GuildRaidsMapService.getOverview не повернув вузли карти');
  }
  const rotation = quantumMapRotation(overview.nodes);
  return {
    guildRaidsType,
    difficultyLevel,
    raidName: String(state?.raidName || '').trim(),
    nodes: overview.nodes.map(node => ({
      id: node.id,
      type: node.type,
      position: normalizeQuantumMapPosition(node.position),
      connectedNodes: Array.isArray(node.connectedNodes)
        ? node.connectedNodes.map(normalizeQuantumMapConnection)
        : node.connectedNodes,
      __class__: node.__class__,
    })),
    ...(rotation === null ? {} : { rotation }),
    __class__: overview.__class__,
  };
}

async function downloadQuantumMapCatalog(config, identity) {
  const result = await postJson(config.firebase.guildDataUrl, {
    ...identity,
    action: 'quantum-maps-get',
  });
  const catalog = result?.data;
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
    throw new Error('Firebase повернув некоректний каталог quantumMaps');
  }
  writeJsonAtomic(QUANTUM_MAPS_SNAPSHOT_PATH, catalog);
  return catalog;
}

async function ensureQuantumMapTemplate(config, identity, state, overview) {
  if (!Number.isInteger(Number(state?.difficultyLevel)) || Number(state.difficultyLevel) <= 0) {
    return { created: false, skipped: true };
  }

  let catalog = null;
  if (fs.existsSync(QUANTUM_MAPS_SNAPSHOT_PATH)) {
    try {
      catalog = readJson(QUANTUM_MAPS_SNAPSHOT_PATH);
    } catch (error) {
      console.warn(`Локальний знімок quantumMaps пошкоджений: ${error.message}`);
    }
  }
  if (!catalog) catalog = await downloadQuantumMapCatalog(config, identity);

  const template = buildQuantumMapTemplate(state, overview);
  const stored = findQuantumMapTemplate(
    catalog,
    state.guildRaidsType,
    state.difficultyLevel,
  );
  if (stored) {
    // Шаблон уже є. Поворот бот лише дописує, якщо його бракує; наявне значення
    // (зокрема виставлене вручну) не чіпає і НЕ кидає помилку через розбіжність.
    const rotationMissing = stored.rotation == null && template.rotation != null;
    if (!rotationMissing) return { created: false, skipped: false };
    try {
      const result = await postJson(config.firebase.guildDataUrl, {
        ...identity,
        action: 'quantum-map-create',
        mapKey: state.mapKey || state.guildRaidsType,
        template,
      });
      await downloadQuantumMapCatalog(config, identity);
      if (result.rotationAdded) {
        console.log(
          `Шаблон квантової карти ${state.guildRaidsType}/${state.difficultyLevel}: ` +
          `дописано поворот ${template.rotation}`,
        );
      }
    } catch (error) {
      console.warn(
        `Не вдалося дописати поворот шаблону ` +
        `${state.guildRaidsType}/${state.difficultyLevel}: ${error.message}`,
      );
    }
    return { created: false, skipped: false };
  }

  const result = await postJson(config.firebase.guildDataUrl, {
    ...identity,
    action: 'quantum-map-create',
    mapKey: state.mapKey || state.guildRaidsType,
    template,
  });
  const refreshedCatalog = await downloadQuantumMapCatalog(config, identity);
  if (!quantumMapTemplateExists(
    refreshedCatalog,
    state.guildRaidsType,
    state.difficultyLevel,
  )) {
    throw new Error('Новий шаблон квантової карти не з’явився у Firebase');
  }
  console.log(
    `Шаблон квантової карти ${state.guildRaidsType}/${state.difficultyLevel}: ` +
    `${result.created ? 'створено' : 'вже створено іншим воркером'}; ` +
    'локальний знімок оновлено',
  );
  return { created: Boolean(result.created), skipped: false };
}

async function prepareWorldContext(baseConfig, identity, baseWorkerId) {
  const expectedConfig = configForIdentity(baseConfig, identity);
  const resolved = await resolveCaptureConfig(expectedConfig, {
    worldName: identity.worldName,
  });
  const actualIdentity = makeIdentity(resolved.config);
  if (
    actualIdentity.playerId !== identity.playerId ||
    actualIdentity.worldName !== identity.worldName ||
    !sameNumericId(actualIdentity.guildId, identity.guildId)
  ) {
    throw new Error(
      `Світ ${identity.worldName} відкрив іншу ідентичність: ` +
      `playerId=${actualIdentity.playerId}, guildId=${actualIdentity.guildId}`,
    );
  }
  return {
    config: configForIdentity(resolved.config, identity),
    identity,
    workerId: workerIdForWorld(baseWorkerId, identity.worldName),
    createdPage: resolved.createdPage,
    gameSession: null,
    nextPrivateMessagePollAt: 0,
    nextGuildMemberSyncAt: 0,
    nextGbgMapPollAt: 0,
    forceGbgReplace: true,
    nextQuantumMapPollAt: 0,
    quantumSignals: null,
    sessionDeadSince: 0,
  };
}

async function ensureWorldSession(context) {
  if (!context.gameSession || context.gameSession.closed) {
    try {
      context.gameSession = await GameSession.connect(context.config);
    } catch (error) {
      if (!context.sessionDeadSince) context.sessionDeadSince = Date.now();
      throw error;
    }
  }
  context.sessionDeadSince = 0;
  return context.gameSession;
}

async function resetWorldSession(context) {
  if (context.gameSession) {
    await context.gameSession.close({ reload: false }).catch(() => {});
  }
  context.gameSession = null;
}

async function closeWorldContext(context) {
  if (context.gameSession && context.createdPage) {
    await context.gameSession.page.close().catch(() => {});
  }
  await resetWorldSession(context);
}

async function runWorldTurn(context) {
  const { config, identity, workerId } = context;
  const prefix = `[${identity.worldName}]`;
  const privateMessagePollIntervalMs = Math.max(
    60000,
    Number(config.worker?.privateMessagePollIntervalMs) || 60000,
  );
  const guildMemberSyncIntervalMs = Math.max(
    60 * 60 * 1000,
    Number(config.worker?.guildMemberSyncIntervalMs) || 60 * 60 * 1000,
  );
  const gbgMapPollIntervalMs = Math.max(
    10_000,
    Number(config.worker?.gbgMapPollIntervalMs) || MAP_POLL_MS,
  );
  const quantumMapPollIntervalMs = Math.max(
    10_000,
    Number(config.worker?.quantumMapPollIntervalMs) || QUANTUM_MAP_POLL_MS,
  );

  let claim;
  try {
    claim = await postJson(config.firebase.guildDataUrl, {
      ...identity,
      action: 'great-buildings-refresh-claim',
      workerId,
    });
    context.quantumSignals = claim && typeof claim.quantum === 'object'
      ? claim.quantum
      : null;
    if (claim.claimed) {
      try {
        await runClaimedJob(
          config,
          identity,
          workerId,
          claim.job,
          await ensureWorldSession(context),
        );
      } catch (error) {
        await resetWorldSession(context);
        console.error(`${prefix} Оновлення ВС зірвано: ${error.stack || error.message}`);
        await postJson(config.firebase.guildDataUrl, {
          ...identity,
          action: 'great-buildings-refresh-fail',
          workerId,
          requestId: claim.job.requestId,
          error: error.message,
        }).catch(failError => console.error(
          `${prefix} Не вдалося записати failed: ${failError.message}`,
        ));
      }
    }
  } catch (error) {
    console.error(`${prefix} Опитування Firebase: ${error.message}`);
  }

  if (Date.now() >= context.nextGuildMemberSyncAt) {
    try {
      await syncGuildMembers(config, identity, await ensureWorldSession(context));
    } catch (error) {
      await resetWorldSession(context);
      console.error(`${prefix} Синхронізація складу гільдії: ${error.message}`);
    } finally {
      context.nextGuildMemberSyncAt = Date.now() + guildMemberSyncIntervalMs;
    }
  }

  if (Date.now() >= context.nextPrivateMessagePollAt) {
    try {
      await pollPrivateMessageCommands(config, identity, await ensureWorldSession(context));
    } catch (error) {
      await resetWorldSession(context);
      console.error(`${prefix} Перевірка приватних повідомлень: ${error.message}`);
    } finally {
      context.nextPrivateMessagePollAt = Date.now() + privateMessagePollIntervalMs;
    }
  }

  if (Date.now() >= context.nextGbgMapPollAt) {
    try {
      const result = await runGbgCycle(
        config,
        identity,
        await ensureWorldSession(context),
        Date.now(),
        context.forceGbgReplace,
      );
      context.forceGbgReplace = false;
      context.nextGbgMapPollAt = Math.max(Date.now() + 1000, Number(result.nextPollAt));
    } catch (error) {
      await resetWorldSession(context);
      console.error(`${prefix} Оновлення ПБГ: ${error.stack || error.message}`);
      context.nextGbgMapPollAt = Date.now() + gbgMapPollIntervalMs;
    }
  }

  if (Date.now() >= context.nextQuantumMapPollAt) {
    try {
      const result = await runQuantumCycle(
        config,
        identity,
        () => ensureWorldSession(context),
        Date.now(),
        context.quantumSignals,
      );
      context.nextQuantumMapPollAt = Math.max(Date.now() + 1000, Number(result.nextPollAt));
    } catch (error) {
      await resetWorldSession(context);
      console.error(`${prefix} Оновлення квантів: ${error.stack || error.message}`);
      context.nextQuantumMapPollAt = Date.now() + quantumMapPollIntervalMs;
    }
  }
}

// Якщо ігрова сесія не піднімається так довго в КОЖНОМУ світі — далі крутитись
// немає сенсу (це лише марні запити до Firebase). Бот зупиняється з інструкцією.
const SESSION_DEAD_EXIT_MS = 3 * 60_000;

function assertGameSessionsAlive(contexts, config) {
  const limitMs = Math.max(
    60_000,
    Number(config.worker?.sessionDeadExitMs) || SESSION_DEAD_EXIT_MS,
  );
  const now = Date.now();
  const allDead = contexts.every(
    context => context.sessionDeadSince > 0 && now - context.sessionDeadSince >= limitMs,
  );
  if (!allDead) return;
  throw new Error(
    'Ігрова вкладка недоступна вже кілька хвилин у кожному світі; бот зупинено, ' +
    'щоб не робити марних запитів. Відкрий Forge of Empires у Chrome ' +
    `(${config.browserURL || 'http://127.0.0.1:9222'}), дочекайся появи міста ` +
    'і знову запусти START-BOT.cmd.',
  );
}

async function runWorker() {
  const once = process.argv.includes('--once');
  const config = readJson(CONFIG_PATH);
  const primaryIdentity = makeIdentity(config);
  const baseWorkerId = String(config.worker?.id || `gb-api-${process.pid}`);
  const pollIntervalMs = Math.max(1000, Number(config.worker?.pollIntervalMs) || 3000);
  const authorization = await postJson(config.firebase.authorizeUrl, primaryIdentity);
  const assignments = normalizeWorldAssignments(authorization.worlds, primaryIdentity);
  const contexts = [];

  for (const identity of assignments) {
    try {
      const context = await prepareWorldContext(config, identity, baseWorkerId);
      contexts.push(context);
      console.log(
        `[${identity.worldName}] Авторизовано: playerId=${identity.playerId}; ` +
        `guildId=${identity.guildId}; вкладка=${context.createdPage ? 'створена' : 'вже відкрита'}`,
      );
    } catch (error) {
      console.error(`[${identity.worldName}] Світ пропущено: ${error.message}`);
    }
  }
  if (!contexts.length) throw new Error('Не вдалося підготувати жодного зареєстрованого світу');

  console.log(
    `Worker ${baseWorkerId}; світи=${contexts.map(item => item.identity.worldName).join(',')}; ` +
    `Chrome=${config.browserURL || 'http://127.0.0.1:9222'}; ` +
    `режим=${once ? 'один обхід' : 'постійний round-robin'}`,
  );

  try {
    do {
      for (const context of contexts) {
        await withWorldLogPrefix(
          context.identity.worldName,
          () => runWorldTurn(context),
        );
      }
      if (once) break;
      assertGameSessionsAlive(contexts, config);
      await sleep(pollIntervalMs);
    } while (true);
  } finally {
    await Promise.all(contexts.map(closeWorldContext));
  }
}

async function main() {
  const releaseWorkerLock = acquireWorkerLock();
  try {
    await runWorker();
  } finally {
    releaseWorkerLock();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Помилка: ${error.stack || error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  normalizeOverviewBuilding,
  overviewChanged,
  contributorsObject,
  firebaseBuilding,
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
  withWorldLogPrefix,
  quantumMapTemplateExists,
  findQuantumMapTemplate,
  quantumMapRotation,
  buildQuantumMapTemplate,
  ensureQuantumMapTemplate,
  runQuantumCycle,
  pickQuantumMode,
  quantumRollAtMs,
  nextMoscowMidnightMs,
  assertGameSessionsAlive,
};
