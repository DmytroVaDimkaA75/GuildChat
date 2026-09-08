'use strict';

const crypto = require('crypto');
const { onRequest } = require('firebase-functions/v2/https');
const { onValueCreated, onValueWritten } = require('firebase-functions/v2/database');
const { logger } = require('firebase-functions');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase, ServerValue } = require('firebase-admin/database');

initializeApp();

const REGION = 'europe-west1';
const ROLE_BOT = 'bot';
const ROLE_GBG_BOT = 'GBGbot';
const MAX_BODY_BYTES = 1_000_000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 10;
const GREAT_BUILDINGS_REFRESH_COOLDOWN_MS = 60 * 1000;
const GREAT_BUILDINGS_REFRESH_LEASE_MS = 2 * 60 * 1000;
const GREAT_BUILDINGS_TRIGGER_PATH = 'refreshTriggers/greatBuildings';
const GREAT_BUILDINGS_STATE_PATH = 'refreshState/greatBuildings';
const RTDB_INSTANCE = 'foechat-b903e-default-rtdb';
const QUANT_SCREEN = 'QuantScreen';
// Онлайн-присутність із дуже старим lastChanged вважаємо застряглою (обірваний
// onDisconnect) і не рахуємо як живого глядача.
const QUANTUM_PRESENCE_STALE_MS = 6 * 60 * 60 * 1000;
const FOE_AVATAR_BASE_URL = 'https://foe.scoredb.io/img/games/foe/avatars/';

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function sendJson(response, status, body) {
  response
    .status(status)
    .set('Cache-Control', 'no-store')
    .set('Content-Type', 'application/json; charset=utf-8')
    .send(JSON.stringify(body));
}

function assertPost(request) {
  if (request.method !== 'POST') {
    throw new HttpError(405, 'method-not-allowed', 'Дозволений лише POST');
  }
}

function cleanId(value, pattern, label) {
  const normalized = String(value ?? '').trim();
  if (!pattern.test(normalized)) {
    throw new HttpError(400, 'invalid-request', `Некоректне поле ${label}`);
  }
  return normalized;
}

function parseIdentity(body) {
  const playerId = cleanId(body?.playerId, /^\d{1,20}$/, 'playerId');
  const worldName = cleanId(
    body?.worldName,
    /^[a-z]{2,4}\d{1,4}$/i,
    'worldName',
  ).toLowerCase();
  const guildId = cleanId(body?.guildId, /^\d{1,20}$/, 'guildId');
  return { playerId, worldName, guildId, guildKey: `${worldName}_${guildId}` };
}

function requiredBotRole(body) {
  return body?.botType === 'GBGbot' ? ROLE_GBG_BOT : ROLE_BOT;
}

function cleanWorkerId(value, label = 'workerId') {
  return cleanId(value, /^[A-Za-z0-9_-]{1,100}$/, label);
}

function cleanRequestId(value) {
  return cleanId(value, /^[A-Za-z0-9_-]{1,160}$/, 'requestId');
}

function parseGuildKey(value) {
  const guildKey = cleanId(
    value,
    /^[a-z]{2,4}\d{1,4}_\d{1,20}$/i,
    'guildKey',
  ).toLowerCase();
  const separator = guildKey.lastIndexOf('_');
  return {
    guildKey,
    worldName: guildKey.slice(0, separator),
    guildId: guildKey.slice(separator + 1),
  };
}

function authorizedUserWorlds(playerId, userGuilds) {
  const worlds = [];
  for (const [guildKey, membership] of Object.entries(userGuilds || {})) {
    if (membership?.role !== ROLE_GBG_BOT) continue;
    try {
      const parsed = parseGuildKey(guildKey);
      worlds.push({
        playerId,
        worldName: parsed.worldName,
        guildId: parsed.guildId,
        guildKey: parsed.guildKey,
      });
    } catch (_error) {
      // Ignore malformed legacy membership keys.
    }
  }
  return worlds.sort((left, right) => left.worldName.localeCompare(right.worldName));
}

function finiteNonNegativeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function cleanErrorMessage(value) {
  const message = String(value ?? '').trim();
  return (message || 'Невідома помилка').slice(0, 1000);
}

function cleanChatCommandText(value, label, maxLength) {
  const text = String(value ?? '').trim();
  if (!text || text.length > maxLength || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) {
    throw new HttpError(400, 'invalid-command', `Некоректне поле ${label}`);
  }
  return text;
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function validateGuildMembers(value) {
  if (!Array.isArray(value) || !value.length || value.length > 500) {
    throw new HttpError(400, 'invalid-members', 'Некоректний список співгільдійців');
  }
  const members = [];
  const playerIds = new Set();
  for (const item of value) {
    const playerId = cleanId(item?.playerId, /^\d{1,20}$/, 'member.playerId');
    const userName = String(item?.userName ?? '').trim();
    const avatar = String(item?.avatar ?? '').trim();
    if (!userName || userName.length > 200) {
      throw new HttpError(400, 'invalid-members', 'Некоректне ім’я співгільдійця');
    }
    if (avatar.length > 200 || (avatar && !/^[A-Za-z0-9_-]+$/.test(avatar))) {
      throw new HttpError(400, 'invalid-members', 'Некоректний аватар співгільдійця');
    }
    if (playerIds.has(playerId)) {
      throw new HttpError(400, 'invalid-members', `Повторний playerId ${playerId}`);
    }
    playerIds.add(playerId);
    members.push({ playerId, userName, avatar });
  }
  return members;
}

function validateGuildMemberDiff(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'invalid-members', 'Некоректні зміни складу гільдії');
  }
  const normalizeMemberList = (items, label) => {
    if (!Array.isArray(items) || items.length > 500) {
      throw new HttpError(400, 'invalid-members', `Некоректний список ${label}`);
    }
    return items.length ? validateGuildMembers(items) : [];
  };
  const added = normalizeMemberList(value.added ?? [], 'added');
  const updated = normalizeMemberList(value.updated ?? [], 'updated');
  const rawRemoved = value.removed ?? [];
  if (!Array.isArray(rawRemoved) || rawRemoved.length > 500) {
    throw new HttpError(400, 'invalid-members', 'Некоректний список removed');
  }
  const removed = rawRemoved.map(playerId =>
    cleanId(playerId, /^\d{1,20}$/, 'removed.playerId'));
  const allPlayerIds = [
    ...added.map(member => member.playerId),
    ...updated.map(member => member.playerId),
    ...removed,
  ];
  if (new Set(allPlayerIds).size !== allPlayerIds.length) {
    throw new HttpError(400, 'invalid-members', 'playerId повторюється у змінах');
  }
  if (Buffer.byteLength(JSON.stringify({ added, updated, removed }), 'utf8') > MAX_BODY_BYTES) {
    throw new HttpError(413, 'payload-too-large', 'Зміни складу перевищують 1 МБ');
  }
  return { added, updated, removed };
}

function avatarImageUrl(avatar) {
  return avatar ? `${FOE_AVATAR_BASE_URL}${avatar}.jpg` : null;
}

function randomAccessCode() {
  return Buffer.concat([
    Buffer.from('Salted__', 'ascii'),
    crypto.randomBytes(24),
  ]).toString('base64');
}

function loginRateKey(request, playerId) {
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0];
  const ip = forwarded.trim() || request.ip || 'unknown';
  return crypto
    .createHash('sha256')
    .update(`${ip}|${playerId}`, 'utf8')
    .digest('hex');
}

async function registerLoginAttempt(request, playerId) {
  const ref = getDatabase().ref(`botAuthRateLimits/${loginRateKey(request, playerId)}`);
  const now = Date.now();
  const result = await ref.transaction(current => {
    if (!current || now - Number(current.windowStartedAt || 0) >= LOGIN_WINDOW_MS) {
      return { count: 1, windowStartedAt: now, updatedAt: now };
    }
    if (Number(current.count || 0) >= MAX_LOGIN_ATTEMPTS) return;
    return {
      count: Number(current.count || 0) + 1,
      windowStartedAt: Number(current.windowStartedAt || now),
      updatedAt: now,
    };
  }, undefined, false);

  if (!result.committed) {
    throw new HttpError(
      429,
      'too-many-attempts',
      'Забагато спроб входу. Повторіть пізніше',
    );
  }
  return ref;
}

async function requireBotIdentity(body) {
  const identity = parseIdentity(body);
  const requiredRole = requiredBotRole(body);
  const liveRole = (
    await getDatabase()
      .ref(`users/${identity.playerId}/userGuilds/${identity.guildKey}/role`)
      .get()
  ).val();
  if (liveRole !== requiredRole) {
    throw new HttpError(403, 'forbidden', `Роль ${requiredRole} відкликана або відсутня`);
  }
  return identity;
}

function validateQuantumSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'invalid-quantum-snapshot', 'quantum snapshot має бути об’єктом');
  }
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_BODY_BYTES) {
    throw new HttpError(413, 'payload-too-large', 'Quantum snapshot перевищує 1 МБ');
  }
  const text = (input, label, maxLength, pattern = null, allowEmpty = true) => {
    const result = String(input ?? '').trim();
    if ((!allowEmpty && !result) || result.length > maxLength || (pattern && !pattern.test(result))) {
      throw new HttpError(400, 'invalid-quantum-snapshot', `Некоректне поле ${label}`);
    }
    return result;
  };
  const number = (input, label, { integer = false, optional = false } = {}) => {
    if (optional && input == null) return undefined;
    const result = Number(input);
    if (!Number.isFinite(result) || result < 0 || (integer && !Number.isInteger(result))) {
      throw new HttpError(400, 'invalid-quantum-snapshot', `Некоректне поле ${label}`);
    }
    return result;
  };
  const iso = (input, label, optional = false) => {
    if (optional && input == null) return undefined;
    const result = text(input, label, 40, null, false);
    if (!Number.isFinite(Date.parse(result))) {
      throw new HttpError(400, 'invalid-quantum-snapshot', `Некоректне поле ${label}`);
    }
    return result;
  };
  const object = (input, label, maxEntries) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new HttpError(400, 'invalid-quantum-snapshot', `${label} має бути об’єктом`);
    }
    if (Object.keys(input).length > maxEntries) {
      throw new HttpError(400, 'invalid-quantum-snapshot', `Забагато записів у ${label}`);
    }
    return input;
  };
  const resourceMap = (input, label) => Object.fromEntries(
    Object.entries(object(input, label, 100)).map(([resourceId, amount]) => [
      text(resourceId, `${label} resourceId`, 100, /^[A-Za-z0-9_-]+$/, false),
      number(amount, `${label}/${resourceId}`),
    ]),
  );

  const stateClass = text(value.stateClass, 'stateClass', 100, /^[A-Za-z0-9_-]+$/, false);
  const mapKey = text(value.mapKey, 'mapKey', 80, /^[A-Za-z0-9_-]+$/, false);
  const guildRaidsType = text(value.guildRaidsType, 'guildRaidsType', 100);
  const raidName = text(value.raidName, 'raidName', 200);
  const difficultyLevel = number(value.difficultyLevel, 'difficultyLevel', { integer: true });
  const result = {
    stateClass,
    mapKey,
    guildRaidsType,
    raidName,
    difficultyLevel,
  };
  if (value.templatePath != null) {
    const expected = `/quantumMaps/${mapKey}/${difficultyLevel}`;
    if (value.templatePath !== expected) {
      throw new HttpError(400, 'invalid-quantum-snapshot', 'Некоректне поле templatePath');
    }
    result.templatePath = expected;
  }
  for (const field of ['startsAt', 'endsAt', 'expiresAt']) {
    const parsed = number(value[field], field, { integer: true, optional: true });
    if (parsed != null) result[field] = parsed;
  }
  for (const field of ['capturedAt', 'lastSuccessfulPollAt', 'stateCheckedAt', 'membersCheckedAt']) {
    const parsed = iso(value[field], field, field === 'membersCheckedAt');
    if (parsed != null) result[field] = parsed;
  }

  if (value.currentNode != null) {
    result.currentNode = text(value.currentNode, 'currentNode', 30, /^[A-Za-z0-9_-]*$/);
  }
  if (value.nodes != null) {
    result.nodes = {};
    for (const [nodeId, rawNode] of Object.entries(object(value.nodes, 'nodes', 200))) {
      const id = text(nodeId, 'nodeId', 30, /^[A-Za-z0-9_-]+$/, false);
      const node = object(rawNode, `nodes/${id}`, 10);
      result.nodes[id] = {
        state: text(node.state, `nodes/${id}/state`, 30, /^[A-Za-z0-9_-]+$/, false),
        currentProgress: number(node.currentProgress, `nodes/${id}/currentProgress`),
        playersCount: number(node.playersCount, `nodes/${id}/playersCount`, { integer: true }),
        indicator: text(node.indicator, `nodes/${id}/indicator`, 30, /^[A-Za-z0-9_-]+$/, false),
      };
    }
  }
  if (value.nodeDetails != null) {
    result.nodeDetails = {};
    for (const [nodeId, rawDetail] of Object.entries(object(value.nodeDetails, 'nodeDetails', 200))) {
      const id = text(nodeId, 'node detail id', 30, /^[A-Za-z0-9_-]+$/, false);
      const detail = object(rawDetail, `nodeDetails/${id}`, 20);
      const normalized = {
        actionProgress: number(detail.actionProgress, `nodeDetails/${id}/actionProgress`),
        contributorsCount: number(detail.contributorsCount, `nodeDetails/${id}/contributorsCount`, { integer: true }),
        updatedAt: iso(detail.updatedAt, `nodeDetails/${id}/updatedAt`),
      };
      if (detail.preferredUnitMultiplier != null) {
        normalized.preferredUnitMultiplier = number(
          detail.preferredUnitMultiplier,
          `nodeDetails/${id}/preferredUnitMultiplier`,
        );
      }
      if (detail.preferredUnitIds != null) {
        if (!Array.isArray(detail.preferredUnitIds) || detail.preferredUnitIds.length > 100) {
          throw new HttpError(400, 'invalid-quantum-snapshot', `Некоректне поле nodeDetails/${id}/preferredUnitIds`);
        }
        normalized.preferredUnitIds = detail.preferredUnitIds.map(unitId =>
          text(unitId, 'preferredUnitId', 100, /^[A-Za-z0-9_-]+$/, false));
      }
      if (detail.cost != null) normalized.cost = resourceMap(detail.cost, `nodeDetails/${id}/cost`);
      if (detail.donationOptions != null) {
        if (!Array.isArray(detail.donationOptions) || detail.donationOptions.length > 50) {
          throw new HttpError(400, 'invalid-quantum-snapshot', `Некоректне поле nodeDetails/${id}/donationOptions`);
        }
        normalized.donationOptions = detail.donationOptions.map((option, index) => {
          const row = object(option, `donationOptions/${index}`, 5);
          return {
            resources: resourceMap(row.resources, `donationOptions/${index}/resources`),
            multiplier: number(row.multiplier, `donationOptions/${index}/multiplier`),
          };
        });
      }
      if (detail.contributors != null) {
        normalized.contributors = {};
        for (const [playerId, rawContributor] of Object.entries(
          object(detail.contributors, `nodeDetails/${id}/contributors`, 500),
        )) {
          const contributorId = text(
            playerId,
            `nodeDetails/${id}/contributors playerId`,
            20,
            /^\d+$/,
            false,
          );
          const contributor = object(
            rawContributor,
            `nodeDetails/${id}/contributors/${contributorId}`,
            10,
          );
          normalized.contributors[contributorId] = {
            name: text(contributor.name, `contributors/${contributorId}/name`, 200),
            avatar: text(contributor.avatar, `contributors/${contributorId}/avatar`, 200),
            era: text(contributor.era, `contributors/${contributorId}/era`, 100),
            progress: number(contributor.progress, `contributors/${contributorId}/progress`),
          };
        }
      }
      if (detail.state != null) {
        normalized.state = text(
          detail.state,
          `nodeDetails/${id}/state`,
          30,
          /^[A-Za-z0-9_-]+$/,
          false,
        );
      }
      if (detail.contributorsFinal != null) {
        if (typeof detail.contributorsFinal !== 'boolean') {
          throw new HttpError(400, 'invalid-quantum-snapshot', `Некоректне поле nodeDetails/${id}/contributorsFinal`);
        }
        normalized.contributorsFinal = detail.contributorsFinal;
      }
      if (detail.finishedAt != null) {
        normalized.finishedAt = iso(detail.finishedAt, `nodeDetails/${id}/finishedAt`);
      }
      result.nodeDetails[id] = normalized;
    }
  }
  if (value.members != null) {
    result.members = {};
    for (const [playerId, rawMember] of Object.entries(object(value.members, 'members', 500))) {
      const id = text(playerId, 'member playerId', 20, /^\d+$/, false);
      const member = object(rawMember, `members/${id}`, 10);
      result.members[id] = {
        name: text(member.name, `members/${id}/name`, 200),
        avatar: text(member.avatar, `members/${id}/avatar`, 200),
        era: text(member.era, `members/${id}/era`, 100),
      };
      for (const field of ['actionPoints', 'progressContribution']) {
        const parsed = number(member[field], `members/${id}/${field}`, { optional: true });
        if (parsed != null) result.members[id][field] = parsed;
      }
    }
  }
  return result;
}

function cloneQuantumMapValue(value, label, depth = 0) {
  if (depth > 15) {
    throw new HttpError(400, 'invalid-quantum-map', `${label} має надмірну вкладеність`);
  }
  if (value == null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new HttpError(400, 'invalid-quantum-map', `Некоректне число у ${label}`);
    }
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > 2000) {
      throw new HttpError(400, 'invalid-quantum-map', `Завеликий текст у ${label}`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 500) {
      throw new HttpError(400, 'invalid-quantum-map', `Забагато елементів у ${label}`);
    }
    return value.map((item, index) => cloneQuantumMapValue(item, `${label}/${index}`, depth + 1));
  }
  if (typeof value !== 'object') {
    throw new HttpError(400, 'invalid-quantum-map', `Некоректне значення у ${label}`);
  }
  const entries = Object.entries(value);
  if (entries.length > 250) {
    throw new HttpError(400, 'invalid-quantum-map', `Забагато полів у ${label}`);
  }
  const result = {};
  for (const [key, item] of entries) {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(key)) {
      throw new HttpError(400, 'invalid-quantum-map', `Некоректний ключ у ${label}`);
    }
    result[key] = cloneQuantumMapValue(item, `${label}/${key}`, depth + 1);
  }
  return result;
}

function validateQuantumMapTemplate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'invalid-quantum-map', 'Шаблон квантової карти має бути об’єктом');
  }
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_BODY_BYTES) {
    throw new HttpError(413, 'payload-too-large', 'Шаблон квантової карти перевищує 1 МБ');
  }
  const guildRaidsType = cleanId(
    value.guildRaidsType,
    /^[A-Za-z0-9_-]{1,100}$/,
    'template.guildRaidsType',
  );
  const difficultyLevel = Number(value.difficultyLevel);
  if (!Number.isInteger(difficultyLevel) || difficultyLevel < 1 || difficultyLevel > 100) {
    throw new HttpError(400, 'invalid-quantum-map', 'Некоректний difficultyLevel шаблону');
  }
  const raidName = String(value.raidName || '').trim();
  if (!raidName || raidName.length > 200) {
    throw new HttpError(400, 'invalid-quantum-map', 'Некоректний raidName шаблону');
  }
  if (!Array.isArray(value.nodes) || !value.nodes.length || value.nodes.length > 200) {
    throw new HttpError(400, 'invalid-quantum-map', 'Некоректний список вузлів шаблону');
  }
  const nodeIds = new Set();
  for (const node of value.nodes) {
    const nodeId = cleanId(node?.id, /^[A-Za-z0-9_-]{1,30}$/, 'template.node.id');
    if (nodeIds.has(nodeId)) {
      throw new HttpError(400, 'invalid-quantum-map', `Повторний вузол ${nodeId}`);
    }
    nodeIds.add(nodeId);
    if (!node.type || typeof node.type !== 'object' || Array.isArray(node.type)) {
      throw new HttpError(400, 'invalid-quantum-map', `Вузол ${nodeId} не містить type`);
    }
    if (!node.position || !Number.isFinite(Number(node.position.x)) ||
        !Number.isFinite(Number(node.position.y))) {
      throw new HttpError(400, 'invalid-quantum-map', `Вузол ${nodeId} не містить position`);
    }
    if (!Array.isArray(node.connectedNodes)) {
      throw new HttpError(400, 'invalid-quantum-map', `Вузол ${nodeId} не містить connectedNodes`);
    }
  }
  const cloned = cloneQuantumMapValue(value, 'template');
  const rotation = value.rotation == null ? null : Number(value.rotation);
  if (rotation !== null && rotation !== -90 && rotation !== 90) {
    throw new HttpError(400, 'invalid-quantum-map', 'Некоректний rotation шаблону');
  }
  return {
    guildRaidsType,
    difficultyLevel,
    raidName,
    nodes: cloned.nodes,
    ...(rotation === null ? {} : { rotation }),
    __class__: String(value.__class__ || 'GuildRaidsMapOverview').slice(0, 100),
  };
}

function validateGbgUpdate(updates) {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    throw new HttpError(400, 'invalid-update', 'updates має бути об’єктом');
  }

  const allowedKeys = new Set(['GBG/map', 'GBG/opponents', 'GBG/sectors']);
  for (const key of Object.keys(updates)) {
    if (!allowedKeys.has(key)) {
      throw new HttpError(400, 'invalid-update', `Запис поля ${key} заборонений`);
    }
  }

  if ('GBG/map' in updates) {
    if (
      typeof updates['GBG/map'] !== 'string' ||
      updates['GBG/map'].length < 1 ||
      updates['GBG/map'].length > 100
    ) {
      throw new HttpError(400, 'invalid-update', 'Некоректне значення GBG/map');
    }
  }

  if ('GBG/opponents' in updates && !Array.isArray(updates['GBG/opponents'])) {
    throw new HttpError(400, 'invalid-update', 'GBG/opponents має бути масивом');
  }
  if (Array.isArray(updates['GBG/opponents']) && updates['GBG/opponents'].length > 100) {
    throw new HttpError(400, 'invalid-update', 'Забагато суперників');
  }

  if ('GBG/sectors' in updates) {
    const sectors = updates['GBG/sectors'];
    if (!sectors || typeof sectors !== 'object' || Array.isArray(sectors)) {
      throw new HttpError(400, 'invalid-update', 'GBG/sectors має бути об’єктом');
    }
    if (Object.keys(sectors).length > 200) {
      throw new HttpError(400, 'invalid-update', 'Забагато секторів');
    }
  }

  if (Buffer.byteLength(JSON.stringify(updates), 'utf8') > MAX_BODY_BYTES) {
    throw new HttpError(413, 'payload-too-large', 'Оновлення перевищує 1 МБ');
  }
}

function validateGbgBatchUpdates(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'invalid-update', 'updates має бути об’єктом');
  }
  const entries = Object.entries(value);
  if (!entries.length || entries.length > 5000) {
    throw new HttpError(400, 'invalid-update', 'Некоректна кількість змін ПБГ');
  }
  const opponentField =
    '(?:id|participantId|clanId|name|sectorColor|staff|victoryPoints|rank)';
  const sectorField =
    '(?:internalId|owner|ownerParticipantId|isOwn|color|isLocked|openTime|army|' +
    'gainAttritionChance|victoryPoints|victoryPointsBonus|totalSlots|usedSlots|' +
    'freeSlots|buildings|availableBuildings)';
  const allowed = [
    /^GBG\/map$/,
    /^GBG\/(?:stateId|startsAt|endsAt)$/,
    /^GBG\/season$/,
    new RegExp(`^GBG/opponents/[A-Za-z0-9_-]{1,40}(?:/${opponentField})?$`),
    new RegExp(`^GBG/sectors/[A-Za-z0-9_-]{1,40}(?:/${sectorField})?$`),
    /^GBG\/PlayerLeaderboard\/(?:mapId|[0-9]{1,20})$/,
  ];
  const updates = {};
  for (const [rawPath, updateValue] of entries) {
    const updatePath = String(rawPath || '').trim();
    if (!allowed.some(pattern => pattern.test(updatePath))) {
      throw new HttpError(400, 'invalid-update', `Запис поля ${updatePath} заборонений`);
    }
    if (updateValue === undefined) {
      throw new HttpError(400, 'invalid-update', `Поле ${updatePath} має undefined`);
    }
    updates[updatePath] = updateValue;
  }
  for (const timestampPath of ['GBG/startsAt', 'GBG/endsAt']) {
    if (timestampPath in updates) {
      const timestamp = Number(updates[timestampPath]);
      if (!Number.isInteger(timestamp) || timestamp <= 0) {
        throw new HttpError(400, 'invalid-update', `Некоректне значення ${timestampPath}`);
      }
      updates[timestampPath] = timestamp;
    }
  }
  if ('GBG/stateId' in updates) {
    const stateId = String(updates['GBG/stateId'] || '').trim();
    if (!stateId || stateId.length > 50) {
      throw new HttpError(400, 'invalid-update', 'Некоректне значення GBG/stateId');
    }
    updates['GBG/stateId'] = stateId;
  }
  if ('GBG/season' in updates && updates['GBG/season'] !== null) {
    throw new HttpError(400, 'invalid-update', 'GBG/season дозволено лише видаляти');
  }
  if (Buffer.byteLength(JSON.stringify(updates), 'utf8') > MAX_BODY_BYTES) {
    throw new HttpError(413, 'payload-too-large', 'Пакет змін ПБГ перевищує 1 МБ');
  }
  return updates;
}

function buildGbgReplacement(value, expectedGuildId) {
  const updates = validateGbgBatchUpdates(value);
  if (Object.values(updates).some(item => item === null)) {
    throw new HttpError(400, 'invalid-update', 'Повний знімок ПБГ не може містити видалення');
  }
  for (const requiredPath of ['GBG/map', 'GBG/stateId', 'GBG/startsAt', 'GBG/endsAt']) {
    if (!(requiredPath in updates)) {
      throw new HttpError(400, 'invalid-update', `У повному знімку відсутнє ${requiredPath}`);
    }
  }
  const opponentIds = Object.keys(updates)
    .map(updatePath => updatePath.match(/^GBG\/opponents\/([0-9]{1,20})(?:\/|$)/)?.[1])
    .filter(Boolean);
  const expected = String(BigInt(String(expectedGuildId)));
  if (!opponentIds.some(guildId => String(BigInt(guildId)) === expected)) {
    throw new HttpError(409, 'guild-mismatch', 'Карта ПБГ не містить авторизовану гільдію');
  }
  const sectorKeys = new Set(
    Object.keys(updates)
      .map(updatePath => updatePath.match(/^GBG\/sectors\/([A-Za-z0-9_-]{1,40})(?:\/|$)/)?.[1])
      .filter(Boolean),
  );
  if (!sectorKeys.size) {
    throw new HttpError(400, 'invalid-update', 'Повний знімок ПБГ не містить секторів');
  }

  // Firebase Realtime Database compat validates values through
  // obj.hasOwnProperty(), so the replacement tree must use normal JSON
  // objects rather than null-prototype dictionaries.
  const replacement = {};
  for (const [updatePath, updateValue] of Object.entries(updates)) {
    const segments = updatePath.split('/').slice(1);
    let cursor = replacement;
    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index];
      if (!cursor[segment] || typeof cursor[segment] !== 'object') {
        cursor[segment] = {};
      }
      cursor = cursor[segment];
    }
    cursor[segments.at(-1)] = updateValue;
  }
  return replacement;
}

function validateGuildFolderPath(value) {
  const normalized = String(value ?? '').trim().replace(/^\/+|\/+$/g, '');
  if (!normalized || normalized.length > 300) {
    throw new HttpError(400, 'invalid-path', 'Некоректний відносний шлях у теці гільдії');
  }
  const segments = normalized.split('/');
  if (
    segments.length > 20 ||
    segments.some(segment =>
      !segment ||
      segment.length > 100 ||
      /[.#$\[\]\u0000-\u001f\u007f]/.test(segment),
    )
  ) {
    throw new HttpError(400, 'invalid-path', 'Шлях містить заборонений сегмент Firebase');
  }
  return segments.join('/');
}

function validateGuildFolderUpdate(value, depth = 0) {
  if (depth > 20) {
    throw new HttpError(400, 'invalid-update', 'Перевищено глибину даних');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'invalid-update', 'data має бути об’єктом');
  }
  for (const [key, child] of Object.entries(value)) {
    if (
      !key || key.length > 100 ||
      /[.#$\[\]/\u0000-\u001f\u007f]/.test(key)
    ) {
      throw new HttpError(400, 'invalid-update', `Заборонене ім’я поля ${key}`);
    }
    if (child === null || child === undefined) {
      throw new HttpError(400, 'invalid-update', `Видалення поля ${key} заборонене`);
    }
    if (typeof child === 'number' && !Number.isFinite(child)) {
      throw new HttpError(400, 'invalid-update', `Некоректне число у полі ${key}`);
    }
    if (typeof child === 'object' && !Array.isArray(child)) {
      validateGuildFolderUpdate(child, depth + 1);
    }
  }
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_BODY_BYTES) {
    throw new HttpError(413, 'payload-too-large', 'Оновлення перевищує 1 МБ');
  }
}

function cleanBuildingKey(value, label = 'cityEntityId') {
  return cleanId(value, /^[A-Za-z0-9_-]{1,160}$/, label);
}

function validateGreatBuildingRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'invalid-update', 'building має бути об’єктом');
  }
  const level = Number(value.level);
  if (!Number.isInteger(level) || level < 0 || level > 10000) {
    throw new HttpError(400, 'invalid-update', 'Некоректний рівень споруди');
  }
  const hasLock = Object.hasOwn(value, 'lock');
  if (hasLock && typeof value.lock !== 'boolean') {
    throw new HttpError(400, 'invalid-update', 'Поле lock має бути логічним значенням');
  }
  const contributors = value.contributors;
  if (!contributors || typeof contributors !== 'object' || Array.isArray(contributors)) {
    throw new HttpError(400, 'invalid-update', 'contributors має бути об’єктом');
  }
  if (Object.keys(contributors).length > 1000) {
    throw new HttpError(400, 'invalid-update', 'Забагато вкладників');
  }
  const normalizedContributors = {};
  for (const [playerId, contributor] of Object.entries(contributors)) {
    const normalizedPlayerId = cleanId(playerId, /^\d{1,20}$/, 'contributor.playerId');
    const playerName = String(contributor?.playerName ?? '').trim();
    const forgePoints = Number(contributor?.forgePoints);
    const hasRank = contributor?.rank !== null && contributor?.rank !== undefined;
    const rank = hasRank ? Number(contributor.rank) : null;
    const hasAvatar = contributor && Object.hasOwn(contributor, 'avatar');
    const avatar = hasAvatar ? String(contributor.avatar ?? '').trim() : null;
    if (!playerName || playerName.length > 200) {
      throw new HttpError(400, 'invalid-update', 'Некоректне ім’я вкладника');
    }
    if (!Number.isFinite(forgePoints) || forgePoints < 0) {
      throw new HttpError(400, 'invalid-update', 'Некоректний внесок вкладника');
    }
    if (hasRank && (!Number.isInteger(rank) || rank < 1 || rank > 1000)) {
      throw new HttpError(400, 'invalid-update', 'Некоректний ранг вкладника');
    }
    if (hasAvatar && avatar.length > 200) {
      throw new HttpError(400, 'invalid-update', 'Некоректний avatar вкладника');
    }
    normalizedContributors[normalizedPlayerId] = {
      playerName,
      forgePoints,
      ...(hasRank ? { rank } : {}),
      ...(hasAvatar ? { avatar } : {}),
    };
  }
  const normalized = {
    level,
    contributors: normalizedContributors,
    status: 'active',
    ...(value.lock === true ? { lock: true } : {}),
  };
  if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > MAX_BODY_BYTES) {
    throw new HttpError(413, 'payload-too-large', 'Споруда перевищує 1 МБ');
  }
  return normalized;
}

function validateActiveBuildingIds(value) {
  if (!Array.isArray(value) || value.length > 1000) {
    throw new HttpError(400, 'invalid-update', 'activeBuildingIds має бути масивом');
  }
  return [...new Set(value.map(item => cleanBuildingKey(item)))];
}

function validateGreatBuildingBatch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'invalid-update', 'buildings має бути об’єктом');
  }
  const entries = Object.entries(value);
  if (!entries.length || entries.length > 1000) {
    throw new HttpError(400, 'invalid-update', 'Некоректна кількість споруд');
  }
  const buildings = {};
  for (const [cityEntityIdValue, building] of entries) {
    const cityEntityId = cleanBuildingKey(cityEntityIdValue);
    buildings[cityEntityId] = validateGreatBuildingRecord(building);
  }
  if (Buffer.byteLength(JSON.stringify(buildings), 'utf8') > MAX_BODY_BYTES) {
    throw new HttpError(413, 'payload-too-large', 'Пакет споруд перевищує 1 МБ');
  }
  return buildings;
}

function validateGreatBuildingCycleChanges(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'invalid-update', 'changes має бути об’єктом');
  }
  const playerEntries = Object.entries(value);
  if (playerEntries.length > 500) {
    throw new HttpError(400, 'invalid-update', 'Забагато гравців у змінах циклу');
  }
  const changes = {};
  for (const [ownerPlayerIdValue, change] of playerEntries) {
    const ownerPlayerId = cleanId(
      ownerPlayerIdValue,
      /^\d{1,20}$/,
      'ownerPlayerId',
    );
    if (!change || typeof change !== 'object' || Array.isArray(change)) {
      throw new HttpError(400, 'invalid-update', 'Зміни гравця мають бути об’єктом');
    }
    const upserts = {};
    const rawUpserts = change.upserts ?? {};
    if (!rawUpserts || typeof rawUpserts !== 'object' || Array.isArray(rawUpserts)) {
      throw new HttpError(400, 'invalid-update', 'upserts має бути об’єктом');
    }
    if (Object.keys(rawUpserts).length > 1000) {
      throw new HttpError(400, 'invalid-update', 'Забагато споруд для оновлення');
    }
    for (const [cityEntityIdValue, building] of Object.entries(rawUpserts)) {
      const cityEntityId = cleanBuildingKey(cityEntityIdValue);
      upserts[cityEntityId] = validateGreatBuildingRecord(building);
    }
    const deleteBuildingIds = validateActiveBuildingIds(
      change.deleteBuildingIds ?? [],
    );
    const activeBuildingIds = Object.hasOwn(change, 'activeBuildingIds')
      ? validateActiveBuildingIds(change.activeBuildingIds)
      : null;
    changes[ownerPlayerId] = {
      upserts,
      deleteBuildingIds,
      activeBuildingIds,
    };
  }
  if (Buffer.byteLength(JSON.stringify(changes), 'utf8') > MAX_BODY_BYTES) {
    throw new HttpError(413, 'payload-too-large', 'Зміни циклу перевищують 1 МБ');
  }
  return changes;
}

function comparableGreatBuildingRecord(value) {
  const contributors =
    value?.contributors && typeof value.contributors === 'object' &&
    !Array.isArray(value.contributors)
      ? value.contributors
      : {};
  const normalizedContributors = Object.fromEntries(
    Object.keys(contributors)
      .sort()
      .map(playerId => {
        const contributor = contributors[playerId] || {};
        return [playerId, {
          playerName: String(contributor.playerName || ''),
          forgePoints: Number(contributor.forgePoints) || 0,
          ...(contributor.rank !== null && contributor.rank !== undefined
            ? { rank: Number(contributor.rank) }
            : {}),
          ...(Object.hasOwn(contributor, 'avatar')
            ? { avatar: String(contributor.avatar || '') }
            : {}),
        }];
      }),
  );
  return {
    level: Number(value?.level) || 0,
    contributors: normalizedContributors,
    status: String(value?.status || ''),
    ...(value?.lock === true ? { lock: true } : {}),
  };
}

function sameGreatBuildingRecord(left, right) {
  return JSON.stringify(comparableGreatBuildingRecord(left)) ===
    JSON.stringify(comparableGreatBuildingRecord(right));
}

function buildDeletedGreatBuildingWithLastScan(currentValue) {
  const current = currentValue && typeof currentValue === 'object' &&
    !Array.isArray(currentValue) ? currentValue : {};
  const previousScan = comparableGreatBuildingRecord(current);
  return {
    ...current,
    status: 'delete',
    updateAt: ServerValue.TIMESTAMP,
    lastScan: previousScan,
  };
}

function buildGreatBuildingWithLastScan(building, currentValue) {
  const current = currentValue && typeof currentValue === 'object' &&
    !Array.isArray(currentValue) ? currentValue : {};
  const nextValue = {
    ...current,
    ...building,
    updateAt: ServerValue.TIMESTAMP,
  };
  // `lock` is omitted for an unlocked building. Do not preserve an old
  // `lock: true` from Firebase when the current scan says it is unlocked.
  if (building.lock !== true) delete nextValue.lock;
  if (Object.keys(current).length) {
    nextValue.lastScan = comparableGreatBuildingRecord(current);
  }
  return nextValue;
}

async function prepareGreatBuildingCycleUpdates(guildRef, changes) {
  const updates = {};
  let upsertCount = 0;
  let deleteCount = 0;

  for (const [ownerPlayerId, change] of Object.entries(changes)) {
    const basePath = `guildUsers/${ownerPlayerId}/greatBuild`;
    const greatBuildRef = guildRef.child(basePath);
    let currentBuildings = {};
    if (Array.isArray(change.activeBuildingIds)) {
      const snapshot = await greatBuildRef.get();
      const value = snapshot.val();
      currentBuildings = value && typeof value === 'object' ? value : {};
    } else {
      const affectedIds = [...new Set([
        ...Object.keys(change.upserts),
        ...change.deleteBuildingIds,
      ])];
      const snapshots = await Promise.all(
        affectedIds.map(cityEntityId => greatBuildRef.child(cityEntityId).get()),
      );
      currentBuildings = Object.fromEntries(
        affectedIds.map((cityEntityId, index) => [
          cityEntityId,
          snapshots[index].val(),
        ]),
      );
    }

    for (const [cityEntityId, building] of Object.entries(change.upserts)) {
      const currentValue = currentBuildings[cityEntityId];
      if (sameGreatBuildingRecord(building, currentValue)) continue;
      updates[`${basePath}/${cityEntityId}`] = buildGreatBuildingWithLastScan(
        building,
        currentValue,
      );
      upsertCount += 1;
    }

    const deleteIds = new Set(change.deleteBuildingIds);
    if (Array.isArray(change.activeBuildingIds)) {
      const activeSet = new Set(change.activeBuildingIds);
      for (const cityEntityId of Object.keys(currentBuildings)) {
        if (!activeSet.has(cityEntityId)) deleteIds.add(cityEntityId);
      }
    }
    for (const cityEntityId of deleteIds) {
      const currentValue = currentBuildings[cityEntityId];
      if (
        !currentValue || typeof currentValue !== 'object' ||
        currentValue.status === 'delete'
      ) continue;
      updates[`${basePath}/${cityEntityId}`] =
        buildDeletedGreatBuildingWithLastScan(currentValue);
      deleteCount += 1;
    }
  }

  return { updates, upsertCount, deleteCount };
}

function validatePlayerLeaderboard(mapIdValue, playersValue) {
  const mapId =
    typeof mapIdValue === 'number' && Number.isFinite(mapIdValue)
      ? mapIdValue
      : String(mapIdValue ?? '').trim();
  if (
    (typeof mapId === 'string' && (!mapId || mapId.length > 100)) ||
    (typeof mapId === 'number' && !Number.isFinite(mapId))
  ) {
    throw new HttpError(400, 'invalid-update', 'Некоректне значення mapId');
  }
  if (!playersValue || typeof playersValue !== 'object' || Array.isArray(playersValue)) {
    throw new HttpError(400, 'invalid-update', 'players має бути об’єктом');
  }
  if (Object.keys(playersValue).length > 200) {
    throw new HttpError(400, 'invalid-update', 'Забагато гравців у PlayerLeaderboard');
  }

  const players = {};
  for (const [playerIdValue, entry] of Object.entries(playersValue)) {
    const playerId = cleanId(playerIdValue, /^\d{1,20}$/, 'leaderboard.playerId');
    const normalized = {};
    for (const field of ['negotiationsWon', 'battlesWon', 'attrition']) {
      const value = Number(entry?.[field]);
      if (!Number.isInteger(value) || value < 0 || value > 1_000_000_000) {
        throw new HttpError(
          400,
          'invalid-update',
          `Некоректне поле ${field} для гравця ${playerId}`,
        );
      }
      normalized[field] = value;
    }
    players[playerId] = normalized;
  }

  const result = { mapId, ...players };
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_BODY_BYTES) {
    throw new HttpError(413, 'payload-too-large', 'PlayerLeaderboard перевищує 1 МБ');
  }
  return result;
}

function handleError(response, error) {
  const status = error instanceof HttpError ? error.status : 500;
  const code = error instanceof HttpError ? error.code : 'internal';
  if (!(error instanceof HttpError)) logger.error('Bot API error', error);
  sendJson(response, status, {
    ok: false,
    error: code,
    message: error instanceof HttpError ? error.message : 'Внутрішня помилка сервера',
  });
}

exports.queueGreatBuildingsRefresh = onValueCreated(
  {
    ref: '/guilds/{guildKey}/refreshRequests/greatBuildings/{requestId}',
    region: REGION,
    instance: 'foechat-b903e-default-rtdb',
  },
  async event => {
    const requestedAt = Date.now();
    const requestRef = event.data.ref;
    try {
      const { guildKey } = parseGuildKey(event.params.guildKey);
      const requestId = cleanRequestId(event.params.requestId);
      const request = event.data.val();
      const requestedBy = cleanId(
        request?.requestedBy,
        /^\d{1,20}$/,
        'requestedBy',
      );
      const userSnapshot = await getDatabase().ref(`users/${requestedBy}`).get();
      const user = userSnapshot.val();
      const membership = user?.userGuilds?.[guildKey];
      if (!user || user.enabled === false || !membership?.role) {
        await requestRef.update({
          status: 'rejected',
          processedAt: ServerValue.TIMESTAMP,
          error: 'Користувач не належить до цієї гільдії',
        });
        logger.warn('Great buildings refresh request rejected', {
          guildKey,
          requestId,
          requestedBy,
        });
        return;
      }

      const triggerRef = getDatabase().ref(
        `guilds/${guildKey}/${GREAT_BUILDINGS_TRIGGER_PATH}`,
      );
      let outcome = 'queued';
      const transaction = await triggerRef.transaction(currentValue => {
        const current = currentValue && typeof currentValue === 'object'
          ? currentValue
          : {};
        const lastCompletedAt = Number(current.lastCompletedAt || 0);
        const leaseUntil = Number(current.leaseUntil || 0);
        if (
          current.status === 'running' &&
          leaseUntil > requestedAt
        ) {
          outcome = 'coalesced';
          return current;
        }
        if (current.status === 'pending') {
          outcome = 'coalesced';
          return current;
        }
        if (
          lastCompletedAt > 0 &&
          requestedAt - lastCompletedAt < GREAT_BUILDINGS_REFRESH_COOLDOWN_MS
        ) {
          outcome = 'cached';
          return current;
        }
        outcome = 'queued';
        return {
          ...current,
          status: 'pending',
          requestId,
          requestedAt,
          requestedBy,
          attempt: 0,
          workerId: null,
          startedAt: null,
          leaseUntil: null,
          error: null,
        };
      }, undefined, false);

      await requestRef.update({
        status: outcome,
        processedAt: ServerValue.TIMESTAMP,
        triggerRequestId:
          transaction.snapshot.val()?.requestId || requestId,
      });
      logger.info('Great buildings refresh request processed', {
        guildKey,
        requestId,
        requestedBy,
        outcome,
      });
    } catch (error) {
      logger.error('Great buildings refresh trigger failed', error);
      await requestRef.update({
        status: 'rejected',
        processedAt: ServerValue.TIMESTAMP,
        error: cleanErrorMessage(error.message),
      }).catch(() => {});
    }
  },
);

// --- Кванти: сигнали для воркера (щоб не опитувати гру, коли нікому не треба) ---

function quantumPresenceTimestamp(presence) {
  if (!presence || typeof presence !== 'object') return 0;
  if (presence.state !== 'online' || presence.screen !== QUANT_SCREEN) return 0;
  const timestamp = Number(presence.lastChanged || presence.lastActivityAt || 0);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now();
}

// Дзеркалить факт «цей гравець зараз на екрані квантової карти» у компактний
// вузол guilds/{guildKey}/live/quantumViewers/{playerId} = час останньої зміни.
exports.trackQuantumPresence = onValueWritten(
  {
    ref: '/guilds/{guildKey}/guildUsers/{playerId}/presence',
    region: REGION,
    instance: RTDB_INSTANCE,
  },
  async event => {
    const timestamp = quantumPresenceTimestamp(event.data.after.val());
    await getDatabase()
      .ref(`guilds/${event.params.guildKey}/live/quantumViewers/${event.params.playerId}`)
      .set(timestamp > 0 ? timestamp : null);
  },
);

// Дзеркалить наявність підписок на стан вузла у compact-набір
// guilds/{guildKey}/live/quantumNotificationNodes/{nodeId} = true.
exports.trackQuantumNotificationNodes = onValueWritten(
  {
    ref: '/guilds/{guildKey}/quantumStateNotifications/{nodeId}',
    region: REGION,
    instance: RTDB_INSTANCE,
  },
  async event => {
    const value = event.data.after.val();
    const hasSubscribers = value && typeof value === 'object' &&
      Object.keys(value).length > 0;
    await getDatabase()
      .ref(`guilds/${event.params.guildKey}/live/quantumNotificationNodes/${event.params.nodeId}`)
      .set(hasSubscribers ? true : null);
  },
);

async function readQuantumSignals(guildRef) {
  const [viewersSnapshot, nodesSnapshot] = await Promise.all([
    guildRef.child('live/quantumViewers').get(),
    guildRef.child('live/quantumNotificationNodes').get(),
  ]);
  const now = Date.now();
  const viewersRaw = viewersSnapshot.val() || {};
  let viewers = 0;
  const staleViewerIds = [];
  for (const [playerId, timestamp] of Object.entries(viewersRaw)) {
    if (Number(timestamp) > 0 && now - Number(timestamp) <= QUANTUM_PRESENCE_STALE_MS) {
      viewers += 1;
    } else {
      staleViewerIds.push(playerId);
    }
  }
  if (staleViewerIds.length) {
    const updates = {};
    for (const playerId of staleViewerIds) {
      updates[`live/quantumViewers/${playerId}`] = null;
    }
    guildRef.update(updates).catch(() => {});
  }
  const notificationNodes = Object.keys(nodesSnapshot.val() || {});
  return { viewers, notificationNodes };
}

exports.authorizeBot = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: '256MiB' },
  async (request, response) => {
    try {
      assertPost(request);
      const identity = parseIdentity(request.body);
      const rateRef = await registerLoginAttempt(request, identity.playerId);
      const userSnapshot = await getDatabase().ref(`users/${identity.playerId}`).get();
      const user = userSnapshot.val();
      const role = user?.userGuilds?.[identity.guildKey]?.role;
      const requiredRole = requiredBotRole(request.body);

      if (!user || user.enabled === false || role !== requiredRole) {
        throw new HttpError(401, 'invalid-credentials', `Невірні дані або немає ролі ${requiredRole}`);
      }

      await rateRef.remove();

      const worlds = requiredRole === ROLE_GBG_BOT
        ? authorizedUserWorlds(identity.playerId, user.userGuilds)
        : undefined;

      logger.info('Bot authorized', {
        playerId: identity.playerId,
        guildKey: identity.guildKey,
        role: requiredRole,
      });
      sendJson(response, 200, {
        ok: true,
        playerId: identity.playerId,
        guildKey: identity.guildKey,
        role: requiredRole,
        authenticationMode: 'browser-role',
        ...(worlds ? { worlds } : {}),
      });
    } catch (error) {
      handleError(response, error);
    }
  },
);

exports.guildData = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: '256MiB' },
  async (request, response) => {
    try {
      assertPost(request);
      const identity = await requireBotIdentity(request.body);
      const action = String(request.body?.action || '');
      const guildRef = getDatabase().ref(`guilds/${identity.guildKey}`);
      const guildIdRef = getDatabase().ref(`guilds/${identity.guildId}`);

      if (action === 'get') {
        const snapshot = await guildRef.child('GBG').get();
        sendJson(response, 200, {
          ok: true,
          guildKey: identity.guildKey,
          data: snapshot.val(),
        });
        return;
      }

      if (action === 'quantum-set') {
        const snapshot = validateQuantumSnapshot(request.body?.snapshot);
        await guildRef.child('quantum').set({
          ...snapshot,
          serverUpdatedAt: ServerValue.TIMESTAMP,
        });
        logger.info('Guild quantum snapshot updated by bot', {
          ...identity,
          stateClass: snapshot.stateClass,
          nodeCount: Object.keys(snapshot.nodes || {}).length,
          memberCount: Object.keys(snapshot.members || {}).length,
        });
        sendJson(response, 200, {
          ok: true,
          guildKey: identity.guildKey,
          path: `guilds/${identity.guildKey}/quantum`,
        });
        return;
      }

      if (action === 'quantum-maps-get') {
        const snapshot = await getDatabase().ref('quantumMaps').get();
        sendJson(response, 200, {
          ok: true,
          data: snapshot.val() || {},
        });
        return;
      }

      if (action === 'quantum-map-create') {
        const mapKey = cleanId(
          request.body?.mapKey,
          /^[A-Za-z0-9_-]{1,100}$/,
          'mapKey',
        );
        const template = validateQuantumMapTemplate(request.body?.template);
        const templateRef = getDatabase().ref(
          `quantumMaps/${mapKey}/${template.difficultyLevel}`,
        );
        let changeType = 'unchanged';
        const transaction = await templateRef.transaction(current => {
          if (current == null) {
            changeType = 'created';
            return template;
          }
          const sameTemplate =
            current.guildRaidsType === template.guildRaidsType &&
            Number(current.difficultyLevel) === template.difficultyLevel;
          if (sameTemplate && current.rotation == null && template.rotation != null) {
            changeType = 'rotation-added';
            return { ...current, rotation: template.rotation };
          }
          changeType = 'unchanged';
          return undefined;
        }, undefined, false);
        const storedTemplate = transaction.snapshot.val();
        if (!storedTemplate ||
            storedTemplate.guildRaidsType !== template.guildRaidsType ||
            Number(storedTemplate.difficultyLevel) !== template.difficultyLevel) {
          throw new HttpError(
            409,
            'quantum-map-conflict',
            'За цим шляхом уже збережено інший шаблон квантової карти',
          );
        }
        logger.info('Quantum map template ensured by bot', {
          ...identity,
          mapKey,
          guildRaidsType: template.guildRaidsType,
          difficultyLevel: template.difficultyLevel,
          created: transaction.committed && changeType === 'created',
          rotationAdded: transaction.committed && changeType === 'rotation-added',
        });
        sendJson(response, 200, {
          ok: true,
          path: `quantumMaps/${mapKey}/${template.difficultyLevel}`,
          created: transaction.committed && changeType === 'created',
          rotationAdded: transaction.committed && changeType === 'rotation-added',
        });
        return;
      }

      if (action === 'update') {
        const updates = request.body?.updates;
        validateGbgUpdate(updates);
        await guildRef.update({
          ...updates,
          lastUpdate: ServerValue.TIMESTAMP,
        });
        logger.info('Guild GBG updated by bot', identity);
        sendJson(response, 200, {
          ok: true,
          guildKey: identity.guildKey,
        });
        return;
      }

      if (action === 'gbg-batch-update') {
        const updates = validateGbgBatchUpdates(request.body?.updates);
        await guildRef.update(updates);
        logger.info('Guild GBG differences updated by bot', {
          ...identity,
          updateCount: Object.keys(updates).length,
        });
        sendJson(response, 200, {
          ok: true,
          guildKey: identity.guildKey,
          updateCount: Object.keys(updates).length,
        });
        return;
      }

      if (action === 'gbg-replace') {
        const replacement = buildGbgReplacement(request.body?.updates, identity.guildId);
        await guildRef.child('GBG').set(replacement);
        logger.info('Guild GBG atomically replaced by bot', {
          ...identity,
          sectorCount: Object.keys(replacement.sectors || {}).length,
        });
        sendJson(response, 200, {
          ok: true,
          guildKey: identity.guildKey,
          sectorCount: Object.keys(replacement.sectors || {}).length,
        });
        return;
      }

      if (action === 'gbg-reset-waiting') {
        const stateId = String(request.body?.stateId || '').trim();
        const startsAt = Number(request.body?.startsAt);
        if (!stateId || stateId.length > 50) {
          throw new HttpError(400, 'invalid-update', 'Некоректне значення GBG/stateId');
        }
        if (!Number.isInteger(startsAt) || startsAt <= 0) {
          throw new HttpError(400, 'invalid-update', 'Некоректне значення GBG/startsAt');
        }
        await guildRef.child('GBG').set({ stateId, startsAt });
        logger.info('Guild GBG reset for waiting season', {
          ...identity,
          stateId,
          startsAt,
        });
        sendJson(response, 200, {
          ok: true,
          guildKey: identity.guildKey,
          stateId,
          startsAt,
        });
        return;
      }

      if (action === 'guild-folder-get') {
        const relativePath = validateGuildFolderPath(request.body?.path);
        const snapshot = await guildIdRef.child(relativePath).get();
        sendJson(response, 200, {
          ok: true,
          guildId: identity.guildId,
          path: `guilds/${identity.guildId}/${relativePath}`,
          data: snapshot.val(),
        });
        return;
      }

      if (action === 'guild-folder-update') {
        const relativePath = validateGuildFolderPath(request.body?.path);
        const data = request.body?.data;
        validateGuildFolderUpdate(data);
        await guildIdRef.child(relativePath).update(data);
        logger.info('Numeric guild folder updated by bot', {
          ...identity,
          relativePath,
        });
        sendJson(response, 200, {
          ok: true,
          guildId: identity.guildId,
          path: `guilds/${identity.guildId}/${relativePath}`,
        });
        return;
      }

      if (action === 'guild-members-diff-sync') {
        const changes = validateGuildMemberDiff(request.body?.changes);
        if (changes.removed.includes(identity.playerId)) {
          throw new HttpError(409, 'incomplete-members', 'Заборонено видаляти акаунт GBGbot');
        }
        const changedMembers = [...changes.added, ...changes.updated];
        const changedPlayerIds = [
          ...changedMembers.map(member => member.playerId),
          ...changes.removed,
        ];
        if (!changedPlayerIds.length) {
          sendJson(response, 200, {
            ok: true,
            guildKey: identity.guildKey,
            changedPlayerCount: 0,
            createdUserCount: 0,
            addedMembershipCount: 0,
            removedGuildUserCount: 0,
            removedMembershipCount: 0,
            deletedUserCount: 0,
            updateCount: 0,
          });
          return;
        }

        const database = getDatabase();
        const userSnapshots = await Promise.all(
          changedPlayerIds.map(playerId => database.ref(`users/${playerId}`).get()),
        );
        const userSnapshotsById = new Map(
          changedPlayerIds.map((playerId, index) => [playerId, userSnapshots[index]]),
        );
        const updates = {};
        let createdUserCount = 0;
        let addedMembershipCount = 0;
        let removedGuildUserCount = 0;
        let removedMembershipCount = 0;
        let deletedUserCount = 0;

        for (const member of changedMembers) {
          const { playerId, userName, avatar } = member;
          const imageUrl = avatarImageUrl(avatar);
          const userSnapshot = userSnapshotsById.get(playerId);
          const rawUser = userSnapshot.val();
          const user = rawUser && typeof rawUser === 'object' && !Array.isArray(rawUser)
            ? rawUser
            : {};
          const membership = user?.userGuilds?.[identity.guildKey];

          updates[`guilds/${identity.guildKey}/guildUsers/${playerId}/userName`] = userName;
          updates[`users/${playerId}/userName`] = userName;
          if (imageUrl) {
            updates[`guilds/${identity.guildKey}/guildUsers/${playerId}/imageUrl`] = imageUrl;
            updates[`users/${playerId}/userGuilds/${identity.guildKey}/imageUrl`] = imageUrl;
          }
          if (!userSnapshot.exists()) {
            updates[`users/${playerId}/password`] = randomAccessCode();
            createdUserCount += 1;
          }
          if (!membership || typeof membership !== 'object' || Array.isArray(membership) ||
              !String(membership.role || '').trim()) {
            updates[`users/${playerId}/userGuilds/${identity.guildKey}/role`] = 'member';
            addedMembershipCount += 1;
          }
        }

        for (const playerId of changes.removed) {
          updates[`guilds/${identity.guildKey}/guildUsers/${playerId}`] = null;
          removedGuildUserCount += 1;
          const userSnapshot = userSnapshotsById.get(playerId);
          if (!userSnapshot?.exists()) continue;
          const rawUser = userSnapshot.val();
          const user = rawUser && typeof rawUser === 'object' && !Array.isArray(rawUser)
            ? rawUser
            : {};
          const userGuilds =
            user.userGuilds && typeof user.userGuilds === 'object' &&
            !Array.isArray(user.userGuilds)
              ? user.userGuilds
              : {};
          const otherGuildKeys = Object.keys(userGuilds)
            .filter(guildKey => guildKey !== identity.guildKey);
          if (otherGuildKeys.length) {
            updates[`users/${playerId}/userGuilds/${identity.guildKey}`] = null;
            removedMembershipCount += 1;
          } else {
            updates[`users/${playerId}`] = null;
            deletedUserCount += 1;
          }
        }

        await database.ref().update(updates);
        logger.info('Guild member diff synchronized by GBG bot', {
          ...identity,
          addedCount: changes.added.length,
          updatedCount: changes.updated.length,
          removedCount: changes.removed.length,
          createdUserCount,
          addedMembershipCount,
          removedGuildUserCount,
          removedMembershipCount,
          deletedUserCount,
          updateCount: Object.keys(updates).length,
        });
        sendJson(response, 200, {
          ok: true,
          guildKey: identity.guildKey,
          changedPlayerCount: changedPlayerIds.length,
          createdUserCount,
          addedMembershipCount,
          removedGuildUserCount,
          removedMembershipCount,
          deletedUserCount,
          updateCount: Object.keys(updates).length,
        });
        return;
      }

      if (action === 'guild-members-sync') {
        const members = validateGuildMembers(request.body?.members);
        if (!members.some(member => member.playerId === identity.playerId)) {
          throw new HttpError(
            409,
            'incomplete-members',
            'Список співгільдійців не містить акаунт GBGbot',
          );
        }
        const database = getDatabase();
        const guildUsersSnapshot = await guildRef.child('guildUsers').get();
        const guildUsers = guildUsersSnapshot.val();
        const existingGuildUsers =
          guildUsers && typeof guildUsers === 'object' && !Array.isArray(guildUsers)
            ? guildUsers
            : {};
        const currentPlayerIds = new Set(members.map(member => member.playerId));
        const removedPlayerIds = Object.keys(existingGuildUsers)
          .filter(playerId => /^\d{1,20}$/.test(playerId) && !currentPlayerIds.has(playerId));
        const allPlayerIds = [...new Set([
          ...members.map(member => member.playerId),
          ...removedPlayerIds,
        ])];
        const userSnapshots = await Promise.all(
          allPlayerIds.map(playerId => database.ref(`users/${playerId}`).get()),
        );
        const userSnapshotsById = new Map(
          allPlayerIds.map((playerId, index) => [playerId, userSnapshots[index]]),
        );
        const updates = {};
        let createdUserCount = 0;
        let addedMembershipCount = 0;
        let removedGuildUserCount = 0;
        let removedMembershipCount = 0;
        let deletedUserCount = 0;
        const changedPlayerIds = new Set();

        members.forEach(member => {
          const { playerId, userName, avatar } = member;
          const imageUrl = avatarImageUrl(avatar);
          const guildUser = existingGuildUsers[playerId];
          const existingGuildUser =
            guildUser && typeof guildUser === 'object' && !Array.isArray(guildUser)
              ? guildUser
              : {};
          const userSnapshot = userSnapshotsById.get(playerId);
          const rawUser = userSnapshot.val();
          const user = rawUser && typeof rawUser === 'object' && !Array.isArray(rawUser)
            ? rawUser
            : {};
          const membership = user?.userGuilds?.[identity.guildKey];

          if (String(existingGuildUser.userName || '') !== userName) {
            updates[`guilds/${identity.guildKey}/guildUsers/${playerId}/userName`] = userName;
            changedPlayerIds.add(playerId);
          }
          if (imageUrl && String(existingGuildUser.imageUrl || '') !== imageUrl) {
            updates[`guilds/${identity.guildKey}/guildUsers/${playerId}/imageUrl`] = imageUrl;
            changedPlayerIds.add(playerId);
          }

          if (!userSnapshot.exists()) {
            updates[`users/${playerId}/password`] = randomAccessCode();
            createdUserCount += 1;
            changedPlayerIds.add(playerId);
          }
          if (String(user.userName || '') !== userName) {
            updates[`users/${playerId}/userName`] = userName;
            changedPlayerIds.add(playerId);
          }
          if (!membership || typeof membership !== 'object' || Array.isArray(membership)) {
            updates[`users/${playerId}/userGuilds/${identity.guildKey}/role`] = 'member';
            addedMembershipCount += 1;
            changedPlayerIds.add(playerId);
          } else if (!String(membership.role || '').trim()) {
            updates[`users/${playerId}/userGuilds/${identity.guildKey}/role`] = 'member';
            addedMembershipCount += 1;
            changedPlayerIds.add(playerId);
          }
          if (imageUrl && String(membership?.imageUrl || '') !== imageUrl) {
            updates[`users/${playerId}/userGuilds/${identity.guildKey}/imageUrl`] = imageUrl;
            changedPlayerIds.add(playerId);
          }
        });

        for (const playerId of removedPlayerIds) {
          updates[`guilds/${identity.guildKey}/guildUsers/${playerId}`] = null;
          removedGuildUserCount += 1;
          changedPlayerIds.add(playerId);

          const userSnapshot = userSnapshotsById.get(playerId);
          if (!userSnapshot?.exists()) continue;
          const rawUser = userSnapshot.val();
          const user = rawUser && typeof rawUser === 'object' && !Array.isArray(rawUser)
            ? rawUser
            : {};
          const userGuilds =
            user.userGuilds && typeof user.userGuilds === 'object' &&
            !Array.isArray(user.userGuilds)
              ? user.userGuilds
              : {};
          const otherGuildKeys = Object.keys(userGuilds)
            .filter(guildKey => guildKey !== identity.guildKey);
          if (otherGuildKeys.length) {
            updates[`users/${playerId}/userGuilds/${identity.guildKey}`] = null;
            removedMembershipCount += 1;
          } else {
            updates[`users/${playerId}`] = null;
            deletedUserCount += 1;
          }
        }

        if (Object.keys(updates).length) {
          await database.ref().update(updates);
        }
        logger.info('Guild members synchronized by GBG bot', {
          ...identity,
          memberCount: members.length,
          changedPlayerCount: changedPlayerIds.size,
          createdUserCount,
          addedMembershipCount,
          removedGuildUserCount,
          removedMembershipCount,
          deletedUserCount,
          updateCount: Object.keys(updates).length,
        });
        sendJson(response, 200, {
          ok: true,
          guildKey: identity.guildKey,
          memberCount: members.length,
          changedPlayerCount: changedPlayerIds.size,
          createdUserCount,
          addedMembershipCount,
          removedGuildUserCount,
          removedMembershipCount,
          deletedUserCount,
          updateCount: Object.keys(updates).length,
        });
        return;
      }

      if (action === 'foe-private-command-publish') {
        const sourceMessageId = cleanId(
          request.body?.sourceMessageId,
          /^\d{1,30}$/,
          'sourceMessageId',
        );
        const sourceConversationId = cleanId(
          request.body?.sourceConversationId,
          /^\d{1,30}$/,
          'sourceConversationId',
        );
        const senderPlayerId = cleanId(
          request.body?.senderPlayerId,
          /^\d{1,20}$/,
          'senderPlayerId',
        );
        const senderName = cleanChatCommandText(
          request.body?.senderName || senderPlayerId,
          'senderName',
          100,
        );
        const targetChatName = cleanChatCommandText(
          request.body?.targetChatName,
          'targetChatName',
          100,
        );
        const text = cleanChatCommandText(
          request.body?.text,
          'text',
          4000,
        );
        const publishAs = cleanId(
          request.body?.publishAs || 'bot',
          /^(?:bot|sender)$/,
          'publishAs',
        );

        const senderSnapshot = await getDatabase()
          .ref(`users/${senderPlayerId}`)
          .get();
        const sender = senderSnapshot.val();
        const senderMembership = sender?.userGuilds?.[identity.guildKey];
        if (!sender || sender.enabled === false || !senderMembership?.role) {
          throw new HttpError(
            403,
            'sender-not-guild-member',
            'Відправник FoE-повідомлення не є співгільдійцем',
          );
        }

        const publishedSenderId = publishAs === 'sender'
          ? senderPlayerId
          : identity.playerId;
        let publishedSenderName = cleanChatCommandText(
          sender.userName || senderName,
          'publishedSenderName',
          100,
        );
        if (publishAs === 'bot') {
          const bot = (
            await getDatabase().ref(`users/${identity.playerId}`).get()
          ).val();
          publishedSenderName = cleanChatCommandText(
            bot?.userName || 'GBGbot',
            'botName',
            100,
          );
        }

        const chatsSnapshot = await guildRef.child('chats').get();
        const chats = chatsSnapshot.val();
        const normalizedTarget = targetChatName.toLocaleLowerCase();
        const matchingChats = Object.entries(
          chats && typeof chats === 'object' ? chats : {},
        ).filter(([, chat]) =>
          chat?.type === 'group' &&
          String(chat?.name || '').trim().toLocaleLowerCase() === normalizedTarget,
        );
        if (!matchingChats.length) {
          throw new HttpError(
            404,
            'target-chat-not-found',
            `Груповий чат «${targetChatName}» не знайдено`,
          );
        }
        if (matchingChats.length > 1) {
          throw new HttpError(
            409,
            'ambiguous-target-chat',
            `Знайдено кілька групових чатів «${targetChatName}»`,
          );
        }

        const [chatId] = matchingChats[0];
        const messageId = `foe_${sourceMessageId}`;
        const messagePath = `chats/${chatId}/messages/${messageId}`;
        const messageRef = guildRef.child(messagePath);
        const existing = (await messageRef.get()).val();
        if (!existing) {
          await guildRef.update({
            [messagePath]: {
              senderId: publishedSenderId,
              senderName: publishedSenderName,
              text,
              html: escapeHtml(text),
              status: 'sent',
              timestamp: ServerValue.TIMESTAMP,
              source: {
                type: 'foe-private-message',
                messageId: sourceMessageId,
                conversationId: sourceConversationId,
                relayedBy: identity.playerId,
                originalSenderId: senderPlayerId,
                publishAs,
              },
            },
            [`privateMessageCommands/${sourceMessageId}`]: {
              status: 'published',
              chatId,
              targetChatName,
              senderPlayerId,
              publishedSenderId,
              publishAs,
              publishedAt: ServerValue.TIMESTAMP,
            },
          });
        }
        logger.info('FoE private command published to guild chat', {
          ...identity,
          sourceMessageId,
          senderPlayerId,
          publishedSenderId,
          publishAs,
          chatId,
          targetChatName,
          duplicate: Boolean(existing),
        });
        sendJson(response, 200, {
          ok: true,
          guildKey: identity.guildKey,
          chatId,
          messageId,
          duplicate: Boolean(existing),
        });
        return;
      }

      if (action === 'great-buildings-get') {
        const ownerPlayerId = cleanId(
          request.body?.ownerPlayerId,
          /^\d{1,20}$/,
          'ownerPlayerId',
        );
        const relativePath = `guildUsers/${ownerPlayerId}/greatBuild`;
        const snapshot = await guildRef.child(relativePath).get();
        sendJson(response, 200, {
          ok: true,
          guildKey: identity.guildKey,
          path: `guilds/${identity.guildKey}/${relativePath}`,
          data: snapshot.val(),
        });
        return;
      }

      if (action === 'great-buildings-refresh-claim') {
        const workerId = cleanWorkerId(request.body?.workerId);
        const now = Date.now();
        const triggerRef = guildRef.child(GREAT_BUILDINGS_TRIGGER_PATH);
        const [triggerValue, quantum] = await Promise.all([
          triggerRef.get().then(snapshot => snapshot.val()),
          readQuantumSignals(guildRef),
        ]);
        const isAppTimestamp = Number.isFinite(Number(triggerValue)) &&
          Number(triggerValue) > 0;
        const source = isAppTimestamp
          ? {
              requestId: `app_${Math.floor(Number(triggerValue))}`,
              requestedAt: Math.floor(Number(triggerValue)),
              requestedBy: null,
              sourceType: 'app-trigger',
            }
          : triggerValue && typeof triggerValue === 'object' &&
            triggerValue.status === 'pending' && triggerValue.requestId
            ? {
                requestId: cleanRequestId(triggerValue.requestId),
                requestedAt: Number(triggerValue.requestedAt || now),
                requestedBy: triggerValue.requestedBy || null,
                sourceType: 'request',
              }
            : null;
        if (!source) {
          sendJson(response, 200, {
            ok: true,
            guildKey: identity.guildKey,
            claimed: false,
            job: null,
            quantum,
          });
          return;
        }
        const stateRef = guildRef.child(GREAT_BUILDINGS_STATE_PATH);
        const initialState = (await stateRef.get()).val();
        const transaction = await stateRef.transaction(currentValue => {
          const current = currentValue ?? initialState;
          const state = current && typeof current === 'object' ? current : {};
          const running = state.status === 'running' &&
            Number(state.leaseUntil || 0) > now;
          if (running) return;
          const sameRequest = state.requestId === source.requestId;
          if (sameRequest && state.status !== 'running') return;
          return {
            ...state,
            ...source,
            status: 'running',
            workerId,
            startedAt: now,
            leaseUntil: now + GREAT_BUILDINGS_REFRESH_LEASE_MS,
            attempt: sameRequest ? Number(state.attempt || 0) + 1 : 1,
            error: null,
          };
        }, undefined, false);
        const trigger = transaction.snapshot.val();
        sendJson(response, 200, {
          ok: true,
          guildKey: identity.guildKey,
          claimed: transaction.committed,
          job: transaction.committed ? {
            requestId: trigger.requestId,
            requestedAt: trigger.requestedAt,
            requestedBy: trigger.requestedBy,
            leaseUntil: trigger.leaseUntil,
          } : null,
          quantum,
        });
        return;
      }

      if (action === 'great-buildings-refresh-heartbeat') {
        const workerId = cleanWorkerId(request.body?.workerId);
        const requestId = cleanRequestId(request.body?.requestId);
        const now = Date.now();
        const stateRef = guildRef.child(GREAT_BUILDINGS_STATE_PATH);
        const initialState = (await stateRef.get()).val();
        const transaction = await stateRef.transaction(currentValue => {
          currentValue ??= initialState;
          if (
            currentValue?.status !== 'running' ||
            currentValue.workerId !== workerId ||
            currentValue.requestId !== requestId
          ) return;
          return {
            ...currentValue,
            leaseUntil: now + GREAT_BUILDINGS_REFRESH_LEASE_MS,
            heartbeatAt: now,
          };
        }, undefined, false);
        if (!transaction.committed) {
          throw new HttpError(409, 'lease-lost', 'Завдання вже не належить цьому worker');
        }
        sendJson(response, 200, {
          ok: true,
          leaseUntil: transaction.snapshot.val().leaseUntil,
        });
        return;
      }

      if (action === 'great-buildings-refresh-complete') {
        const workerId = cleanWorkerId(request.body?.workerId);
        const requestId = cleanRequestId(request.body?.requestId);
        const changes = validateGreatBuildingCycleChanges(request.body?.changes);
        const durationMs = finiteNonNegativeNumber(request.body?.durationMs);
        const stats = {
          playerCount: finiteNonNegativeNumber(request.body?.stats?.playerCount),
          overviewCount: finiteNonNegativeNumber(request.body?.stats?.overviewCount),
          detailedCount: finiteNonNegativeNumber(request.body?.stats?.detailedCount),
          changedCount: finiteNonNegativeNumber(request.body?.stats?.changedCount),
        };
        const triggerSnapshot = await guildRef.child(
          GREAT_BUILDINGS_STATE_PATH,
        ).get();
        const trigger = triggerSnapshot.val();
        if (
          trigger?.status !== 'running' ||
          trigger.workerId !== workerId ||
          trigger.requestId !== requestId
        ) {
          throw new HttpError(409, 'lease-lost', 'Завдання вже не належить цьому worker');
        }

        const prepared = await prepareGreatBuildingCycleUpdates(guildRef, changes);
        const triggerPath = GREAT_BUILDINGS_STATE_PATH;
        Object.assign(prepared.updates, {
          [`${triggerPath}/status`]: 'completed',
          [`${triggerPath}/completedAt`]: ServerValue.TIMESTAMP,
          [`${triggerPath}/lastCompletedAt`]: ServerValue.TIMESTAMP,
          [`${triggerPath}/durationMs`]: durationMs,
          [`${triggerPath}/stats`]: stats,
          [`${triggerPath}/workerId`]: null,
          [`${triggerPath}/leaseUntil`]: null,
          [`${triggerPath}/heartbeatAt`]: null,
          [`${triggerPath}/error`]: null,
        });
        if (trigger.sourceType === 'request') {
          prepared.updates[`${GREAT_BUILDINGS_TRIGGER_PATH}/status`] = 'completed';
          prepared.updates[`${GREAT_BUILDINGS_TRIGGER_PATH}/completedAt`] =
            ServerValue.TIMESTAMP;
          prepared.updates[`${GREAT_BUILDINGS_TRIGGER_PATH}/lastCompletedAt`] =
            ServerValue.TIMESTAMP;
          prepared.updates[`refreshRequests/greatBuildings/${requestId}/status`] =
            'completed';
          prepared.updates[`refreshRequests/greatBuildings/${requestId}/completedAt`] =
            ServerValue.TIMESTAMP;
        }
        await guildRef.update(prepared.updates);
        logger.info('Great buildings refresh completed by worker', {
          ...identity,
          workerId,
          requestId,
          ...stats,
          upsertCount: prepared.upsertCount,
          deleteCount: prepared.deleteCount,
        });
        sendJson(response, 200, {
          ok: true,
          guildKey: identity.guildKey,
          ...stats,
          upsertCount: prepared.upsertCount,
          deleteCount: prepared.deleteCount,
        });
        return;
      }

      if (action === 'great-buildings-refresh-fail') {
        const workerId = cleanWorkerId(request.body?.workerId);
        const requestId = cleanRequestId(request.body?.requestId);
        const message = cleanErrorMessage(request.body?.error);
        const triggerRef = guildRef.child(GREAT_BUILDINGS_STATE_PATH);
        const initialTrigger = (await triggerRef.get()).val();
        const transaction = await triggerRef.transaction(currentValue => {
          currentValue ??= initialTrigger;
          if (
            currentValue?.status !== 'running' ||
            currentValue.workerId !== workerId ||
            currentValue.requestId !== requestId
          ) return;
          return {
            ...currentValue,
            status: 'failed',
            failedAt: Date.now(),
            workerId: null,
            leaseUntil: null,
            heartbeatAt: null,
            error: message,
          };
        }, undefined, false);
        if (!transaction.committed) {
          throw new HttpError(409, 'lease-lost', 'Завдання вже не належить цьому worker');
        }
        if (transaction.snapshot.val()?.sourceType === 'request') {
          await guildRef.update({
            [`${GREAT_BUILDINGS_TRIGGER_PATH}/status`]: 'failed',
            [`${GREAT_BUILDINGS_TRIGGER_PATH}/failedAt`]: ServerValue.TIMESTAMP,
            [`${GREAT_BUILDINGS_TRIGGER_PATH}/error`]: message,
            [`refreshRequests/greatBuildings/${requestId}/status`]: 'failed',
            [`refreshRequests/greatBuildings/${requestId}/failedAt`]:
              ServerValue.TIMESTAMP,
            [`refreshRequests/greatBuildings/${requestId}/error`]: message,
          });
        }
        logger.error('Great buildings refresh failed in worker', {
          ...identity,
          workerId,
          requestId,
          error: message,
        });
        sendJson(response, 200, { ok: true, guildKey: identity.guildKey });
        return;
      }

      if (action === 'great-building-upsert') {
        const ownerPlayerId = cleanId(
          request.body?.ownerPlayerId,
          /^\d{1,20}$/,
          'ownerPlayerId',
        );
        const cityEntityId = cleanBuildingKey(request.body?.cityEntityId);
        const building = validateGreatBuildingRecord(request.body?.building);
        const relativePath =
          `guildUsers/${ownerPlayerId}/greatBuild/${cityEntityId}`;
        await guildRef.child(relativePath).transaction(currentValue => {
          return buildGreatBuildingWithLastScan(building, currentValue);
        });
        logger.info('Great building written by bot', {
          ...identity,
          ownerPlayerId,
          cityEntityId,
        });
        sendJson(response, 200, {
          ok: true,
          guildKey: identity.guildKey,
          path: `guilds/${identity.guildKey}/${relativePath}`,
        });
        return;
      }

      if (action === 'great-buildings-batch-upsert') {
        const ownerPlayerId = cleanId(
          request.body?.ownerPlayerId,
          /^\d{1,20}$/,
          'ownerPlayerId',
        );
        const buildings = validateGreatBuildingBatch(request.body?.buildings);
        const relativePath = `guildUsers/${ownerPlayerId}/greatBuild`;
        const buildingCount = Object.keys(buildings).length;
        await guildRef.child(relativePath).transaction(currentValue => {
          const nextValue =
            currentValue &&
            typeof currentValue === 'object' &&
            !Array.isArray(currentValue)
              ? { ...currentValue }
              : {};
          for (const [cityEntityId, building] of Object.entries(buildings)) {
            nextValue[cityEntityId] = buildGreatBuildingWithLastScan(
              building,
              nextValue[cityEntityId],
            );
          }
          return nextValue;
        });
        logger.info('Guild great buildings batch updated by bot', {
          ...identity,
          ownerPlayerId,
          buildingCount,
        });
        sendJson(response, 200, {
          ok: true,
          guildKey: identity.guildKey,
          path: `guilds/${identity.guildKey}/${relativePath}`,
          buildingCount,
        });
        return;
      }

      if (action === 'great-buildings-cycle-commit') {
        const changes = validateGreatBuildingCycleChanges(request.body?.changes);
        const prepared = await prepareGreatBuildingCycleUpdates(guildRef, changes);
        if (Object.keys(prepared.updates).length) {
          await guildRef.update(prepared.updates);
        }
        logger.info('Great building cycle committed by bot', {
          ...identity,
          playerCount: Object.keys(changes).length,
          upsertCount: prepared.upsertCount,
          deleteCount: prepared.deleteCount,
        });
        sendJson(response, 200, {
          ok: true,
          guildKey: identity.guildKey,
          path: `guilds/${identity.guildKey}/guildUsers`,
          playerCount: Object.keys(changes).length,
          upsertCount: prepared.upsertCount,
          deleteCount: prepared.deleteCount,
        });
        return;
      }

      if (action === 'player-leaderboard-update') {
        const leaderboard = validatePlayerLeaderboard(
          request.body?.mapId,
          request.body?.players,
        );
        const relativePath = 'GBG/PlayerLeaderboard';
        await guildRef.child(relativePath).set(leaderboard);
        logger.info('GBG player leaderboard updated by bot', {
          ...identity,
          mapId: leaderboard.mapId,
          playerCount: Object.keys(leaderboard).length - 1,
        });
        sendJson(response, 200, {
          ok: true,
          guildKey: identity.guildKey,
          path: `guilds/${identity.guildKey}/${relativePath}`,
          playerCount: Object.keys(leaderboard).length - 1,
        });
        return;
      }

      if (action === 'great-buildings-reconcile') {
        const ownerPlayerId = cleanId(
          request.body?.ownerPlayerId,
          /^\d{1,20}$/,
          'ownerPlayerId',
        );
        const activeBuildingIds = validateActiveBuildingIds(
          request.body?.activeBuildingIds,
        );
        const activeSet = new Set(activeBuildingIds);
        const greatBuildRef = guildRef.child(
          `guildUsers/${ownerPlayerId}/greatBuild`,
        );
        const snapshot = await greatBuildRef.get();
        const existing = snapshot.val();
        const updates = {};
        let activeCount = 0;
        let deleteCount = 0;
        for (const cityEntityId of Object.keys(
          existing && typeof existing === 'object' ? existing : {},
        )) {
          const status = activeSet.has(cityEntityId) ? 'active' : 'delete';
          updates[`${cityEntityId}/status`] = status;
          if (
            status === 'delete' &&
            existing?.[cityEntityId]?.status !== 'delete'
          ) {
            updates[`${cityEntityId}/updateAt`] = ServerValue.TIMESTAMP;
          }
          if (status === 'active') activeCount += 1;
          else deleteCount += 1;
        }
        if (Object.keys(updates).length) await greatBuildRef.update(updates);
        logger.info('Great buildings reconciled by bot', {
          ...identity,
          ownerPlayerId,
          activeCount,
          deleteCount,
        });
        sendJson(response, 200, {
          ok: true,
          guildKey: identity.guildKey,
          path: `guilds/${identity.guildKey}/guildUsers/${ownerPlayerId}/greatBuild`,
          activeCount,
          deleteCount,
        });
        return;
      }

      throw new HttpError(
        400,
        'invalid-action',
        'Непідтримувана дія guildData',
      );
    } catch (error) {
      handleError(response, error);
    }
  },
);
