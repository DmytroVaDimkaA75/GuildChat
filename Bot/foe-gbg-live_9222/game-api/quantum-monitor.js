'use strict';

const crypto = require('node:crypto');

const MAP_POLL_MS = 10_000;
const MEMBER_POLL_MS = 60_000;
const DETAIL_REFRESH_MS = 60_000;
// Keep inactive worlds in the same round-robin cadence as active worlds.
const INACTIVE_POLL_MS = MAP_POLL_MS;
const HEARTBEAT_MS = 60_000;

const MAP_KEYS = {
  guildRaidsMiddleAges4: 'SteelCitadel',
};

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function responseData(session, messages, request) {
  const response = session.response(messages, request);
  if (!response) {
    throw new Error(`Missing response for ${request.requestClass}.${request.requestMethod}`);
  }
  if (response.requestMethod === 'Error' || response.responseData?.__class__ === 'Error') {
    throw new Error(
      `${request.requestClass}.${request.requestMethod}: ${JSON.stringify(response.responseData)}`,
    );
  }
  return response.responseData;
}

function optionalResponseData(session, messages, request) {
  const response = session.response(messages, request);
  if (
    !response ||
    response.requestMethod === 'Error' ||
    response.responseData?.__class__ === 'Error'
  ) return null;
  return response.responseData;
}

function mapKeyFromState(state) {
  const guildRaidsType = String(state?.guildRaidsType || '').trim();
  if (MAP_KEYS[guildRaidsType]) return MAP_KEYS[guildRaidsType];
  const fallback = guildRaidsType.replace(/[^A-Za-z0-9_-]/g, '');
  return fallback || 'unknown';
}

function normalizeState(state, nowIso) {
  const raid = state?.raidInstance || {};
  const difficultyLevel = Math.max(0, Math.floor(finiteNumber(raid.difficultyLevel)));
  const mapKey = mapKeyFromState(state);
  return {
    stateClass: String(state?.__class__ || 'UnknownGuildRaidsState'),
    mapKey,
    guildRaidsType: String(state?.guildRaidsType || ''),
    raidName: String(raid.raidName || ''),
    difficultyLevel,
    ...(difficultyLevel > 0 ? { templatePath: `/quantumMaps/${mapKey}/${difficultyLevel}` } : {}),
    ...(Number.isInteger(Number(state?.startsAt)) ? { startsAt: Number(state.startsAt) } : {}),
    ...(Number.isInteger(Number(state?.endsAt)) ? { endsAt: Number(state.endsAt) } : {}),
    ...(Number.isInteger(Number(raid.expiresAt)) ? { expiresAt: Number(raid.expiresAt) } : {}),
    stateCheckedAt: nowIso,
  };
}

function normalizeResources(value) {
  const raw = value?.resources && typeof value.resources === 'object'
    ? value.resources
    : value;
  const resources = {};
  for (const [resourceId, amount] of Object.entries(raw || {})) {
    if (resourceId === '__class__') continue;
    const number = Number(amount);
    if (Number.isFinite(number)) resources[resourceId] = number;
  }
  return resources;
}

function normalizeNodes(overview) {
  const nodes = {};
  for (const node of overview?.nodes || []) {
    const id = String(node?.id || '').trim();
    if (!id) continue;
    const state = node.state || {};
    nodes[id] = {
      state: String(state.state || 'unknown'),
      currentProgress: finiteNumber(state.currentProgress),
      playersCount: Math.max(0, Math.floor(finiteNumber(state.playersCount))),
      indicator: String(state.indicator?.value || state.indicator || 'none'),
    };
  }
  return nodes;
}

function overviewFingerprint(overview) {
  const staticNodes = (overview?.nodes || []).map(node => ({
    id: String(node?.id || ''),
    type: node?.type || null,
    position: node?.position || null,
    connectedNodes: (node?.connectedNodes || []).map(connection => ({
      targetNodeId: String(connection?.targetNodeId || ''),
      movementCost: connection?.movementCost || null,
      pathTiles: connection?.pathTiles || [],
    })).sort((left, right) => left.targetNodeId.localeCompare(right.targetNodeId)),
  })).sort((left, right) => left.id.localeCompare(right.id));
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(staticNodes))
    .digest('hex');
}

function normalizeMembers(memberActivity) {
  const rows = Array.isArray(memberActivity)
    ? memberActivity
    : Array.isArray(memberActivity?.rows) ? memberActivity.rows : [];
  const members = {};
  for (const row of rows) {
    const player = row?.player || {};
    const playerId = String(player.player_id ?? player.playerId ?? '').trim();
    if (!/^\d{1,20}$/.test(playerId)) continue;
    members[playerId] = {
      name: String(player.name || ''),
      avatar: String(player.avatar || ''),
      era: String(player.era || ''),
      ...(Number.isFinite(Number(row.actionPoints))
        ? { actionPoints: Number(row.actionPoints) }
        : {}),
      ...(Number.isFinite(Number(row.progressContribution))
        ? { progressContribution: Number(row.progressContribution) }
        : {}),
    };
  }
  return members;
}

function normalizeNodeLeaderboard(leaderboard) {
  const rows = Array.isArray(leaderboard)
    ? leaderboard
    : Array.isArray(leaderboard?.rows) ? leaderboard.rows : [];
  const contributors = {};
  for (const row of rows) {
    const player = row?.player || {};
    const playerId = String(player.player_id ?? player.playerId ?? '').trim();
    if (!/^\d{1,20}$/.test(playerId)) continue;
    contributors[playerId] = {
      name: String(player.name || ''),
      avatar: String(player.avatar || ''),
      era: String(player.era || ''),
      progress: Math.max(0, finiteNumber(row.progress)),
    };
  }
  return contributors;
}

function normalizeNodeDetail(detail, nowIso) {
  const result = {
    actionProgress: finiteNumber(detail?.actionProgress),
    contributorsCount: Math.max(0, Math.floor(finiteNumber(detail?.contributorsCount))),
    updatedAt: nowIso,
  };
  if (Number.isFinite(Number(detail?.preferredUnitMultiplier))) {
    result.preferredUnitMultiplier = Number(detail.preferredUnitMultiplier);
  }
  if (Array.isArray(detail?.preferredUnitIds) && detail.preferredUnitIds.length) {
    result.preferredUnitIds = detail.preferredUnitIds.map(String);
  }
  const cost = normalizeResources(detail?.cost);
  if (Object.keys(cost).length) result.cost = cost;
  if (Array.isArray(detail?.donationOptions)) {
    result.donationOptions = detail.donationOptions.map(option => ({
      resources: normalizeResources(option?.resources),
      multiplier: finiteNumber(option?.multiplier, 1),
    }));
  }
  return result;
}

function timestampMs(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function shouldRefreshDetail(previous, node, nowMs, refreshMs = DETAIL_REFRESH_MS) {
  if (!previous) return true;
  if (timestampMs(previous.updatedAt) + refreshMs <= nowMs) return true;
  return finiteNumber(previous.currentProgress, NaN) !== finiteNumber(node.currentProgress, NaN);
}

function shouldFinalizeNode(previousNode, previousDetail, node) {
  return node?.state === 'finished' && (
    previousNode?.state !== 'finished' || previousDetail?.state !== 'finished'
  );
}

function comparableSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const ignored = new Set([
    'capturedAt',
    'lastSuccessfulPollAt',
    'stateCheckedAt',
    'membersCheckedAt',
    'lastFirebaseWriteAt',
    'nextPollAt',
    'mapFingerprint',
    'updatedAt',
    'serverUpdatedAt',
  ]);
  const clean = value => {
    if (Array.isArray(value)) return value.map(clean);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.keys(value).sort()
        .filter(key => !ignored.has(key))
        .map(key => [key, clean(value[key])]),
    );
  };
  return clean(snapshot);
}

function snapshotsEqual(left, right) {
  return JSON.stringify(comparableSnapshot(left)) === JSON.stringify(comparableSnapshot(right));
}

function isRunning(snapshot, nowMs) {
  return snapshot?.stateClass === 'GuildRaidsRunningState' &&
    (!Number.isFinite(Number(snapshot.endsAt)) || Number(snapshot.endsAt) * 1000 > nowMs);
}

async function collectQuantumSnapshot(session, previous = null, options = {}) {
  const nowMs = Number(options.nowMs) || Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const memberPollMs = Number(options.memberPollMs) || MEMBER_POLL_MS;
  const detailRefreshMs = Number(options.detailRefreshMs) || DETAIL_REFRESH_MS;
  const stateStillCurrent = isRunning(previous, nowMs);

  let stateFields = stateStillCurrent ? {
    stateClass: previous.stateClass,
    mapKey: previous.mapKey,
    guildRaidsType: previous.guildRaidsType,
    raidName: previous.raidName,
    difficultyLevel: previous.difficultyLevel,
    templatePath: previous.templatePath,
    ...(previous.startsAt != null ? { startsAt: previous.startsAt } : {}),
    ...(previous.endsAt != null ? { endsAt: previous.endsAt } : {}),
    ...(previous.expiresAt != null ? { expiresAt: previous.expiresAt } : {}),
    stateCheckedAt: previous.stateCheckedAt || nowIso,
  } : null;

  if (!stateFields) {
    const request = session.allocateRequest('GuildRaidsService', 'getState', []);
    const messages = await session.send([request]);
    stateFields = normalizeState(responseData(session, messages, request), nowIso);
  }

  if (!isRunning(stateFields, nowMs)) {
    return {
      ...stateFields,
      capturedAt: nowIso,
      lastSuccessfulPollAt: nowIso,
      nextPollAt: stateFields.startsAt && stateFields.startsAt * 1000 > nowMs
        ? Math.min(stateFields.startsAt * 1000, nowMs + INACTIVE_POLL_MS)
        : nowMs + INACTIVE_POLL_MS,
    };
  }

  // getState під час активного рейду більше не тягнеться щоцикл: тип, складність,
  // startsAt/endsAt/expiresAt незмінні. Оновлюємо його лише у режимі 'roll'
  // (вікно опівнічного скидання / кінця сезону) або якщо стан ще не підтверджено.
  const refreshState = !stateStillCurrent || options.mode === 'roll';
  const lightMode = options.mode === 'light';
  const membersDue = !lightMode && (!previous?.members ||
    timestampMs(previous.membersCheckedAt) + memberPollMs <= nowMs);
  const overviewRequest = session.allocateRequest('GuildRaidsMapService', 'getOverview', []);
  const stateRequest = refreshState && stateStillCurrent
    ? session.allocateRequest('GuildRaidsService', 'getState', [])
    : null;
  const memberRequest = membersDue
    ? session.allocateRequest('GuildRaidsService', 'getMemberActivityOverview', [])
    : null;
  const requests = [
    overviewRequest,
    ...(stateRequest ? [stateRequest] : []),
    ...(memberRequest ? [memberRequest] : []),
  ];
  const messages = await session.send(requests);
  const overview = responseData(session, messages, overviewRequest);
  if (stateRequest) {
    stateFields = normalizeState(
      responseData(session, messages, stateRequest),
      nowIso,
    );
  }
  const mapFingerprint = overviewFingerprint(overview);
  const nodes = normalizeNodes(overview);

  if (typeof options.ensureMapTemplate === 'function') {
    await options.ensureMapTemplate(stateFields, overview);
  }

  // Легкий режим (є підписки на стани вузлів, але екран ніхто не тримає):
  // достатньо станів вузлів з getOverview, щоб додаток міг звірити expectedState.
  // Деталі вузлів, лідерборди та активність учасників не запитуємо.
  if (lightMode) {
    return {
      ...stateFields,
      currentNode: String(overview?.currentNode || ''),
      capturedAt: nowIso,
      lastSuccessfulPollAt: nowIso,
      nodes,
      mapFingerprint,
      nodeDetails: previous?.nodeDetails || {},
      members: previous?.members,
      membersCheckedAt: previous?.membersCheckedAt,
      nextPollAt: nowMs + (Number(options.mapPollMs) || MAP_POLL_MS),
    };
  }

  const detailIds = Object.entries(nodes)
    .filter(([, node]) => node.state === 'open')
    .filter(([id, node]) => {
      const previousDetail = previous?.nodeDetails?.[id];
      return !previousDetail ||
        previous?.nodes?.[id]?.currentProgress !== node.currentProgress ||
        timestampMs(previousDetail.updatedAt) + detailRefreshMs <= nowMs;
    })
    .map(([id]) => id);
  const finishedIds = Object.entries(nodes)
    .filter(([id, node]) => shouldFinalizeNode(
      previous?.nodes?.[id],
      previous?.nodeDetails?.[id],
      node,
    ))
    .map(([id]) => id);
  const detailRequests = detailIds.map(id => session.allocateRequest(
    'GuildRaidsMapService',
    'getNodeExtendedInfo',
    [id],
  ));
  const leaderboardIds = [...detailIds, ...finishedIds];
  const leaderboardRequests = leaderboardIds.map(id => session.allocateRequest(
    'GuildRaidsMapService',
    'getNodeLeaderboard',
    [id],
  ));
  const detailMessages = detailRequests.length || leaderboardRequests.length
    ? await session.send([...detailRequests, ...leaderboardRequests])
    : [];
  const freshDetails = {};
  detailRequests.forEach((request, index) => {
    const detail = normalizeNodeDetail(
      responseData(session, detailMessages, request),
      nowIso,
    );
    const contributors = normalizeNodeLeaderboard(
      responseData(session, detailMessages, leaderboardRequests[index]),
    );
    freshDetails[detailIds[index]] = {
      ...detail,
      contributors,
      contributorsCount: Math.max(detail.contributorsCount, Object.keys(contributors).length),
    };
  });
  finishedIds.forEach((id, index) => {
    const leaderboardRequest = leaderboardRequests[detailIds.length + index];
    const leaderboard = optionalResponseData(session, detailMessages, leaderboardRequest);
    const previousDetail = previous?.nodeDetails?.[id];
    const contributors = leaderboard
      ? normalizeNodeLeaderboard(leaderboard)
      : previousDetail?.contributors || {};
    freshDetails[id] = {
      ...(previousDetail || {
        actionProgress: finiteNumber(nodes[id]?.currentProgress),
        contributorsCount: 0,
      }),
      state: 'finished',
      contributors,
      contributorsCount: Math.max(
        finiteNumber(previousDetail?.contributorsCount),
        Object.keys(contributors).length,
      ),
      contributorsFinal: Boolean(leaderboard),
      finishedAt: previousDetail?.finishedAt || nowIso,
      updatedAt: nowIso,
    };
  });
  const nodeDetails = {};
  for (const [id, node] of Object.entries(nodes)) {
    if (node.state !== 'open' && node.state !== 'finished') continue;
    const detail = freshDetails[id] || previous?.nodeDetails?.[id];
    if (detail) nodeDetails[id] = detail;
  }

  return {
    ...stateFields,
    currentNode: String(overview?.currentNode || ''),
    capturedAt: nowIso,
    lastSuccessfulPollAt: nowIso,
    nodes,
    mapFingerprint,
    nodeDetails,
    members: memberRequest
      ? normalizeMembers(responseData(session, messages, memberRequest))
      : previous.members,
    membersCheckedAt: memberRequest ? nowIso : previous.membersCheckedAt,
    nextPollAt: nowMs + (Number(options.mapPollMs) || MAP_POLL_MS),
  };
}

// Скільки бою (одиниць прогресу) лишилось долити вздовж найдешевшого шляху від
// будь-якого відкритого вузла до цільового. Кожен вузол на шляху (крім цілі) має
// повністю дозакінчитись, щоб відкрився наступний; ціль відкривається, коли
// закінчується останній проміжний вузол.
function quantumRemainingToTarget(template, nodes, targetId) {
  const adjacency = new Map();
  const required = new Map();
  for (const node of template?.nodes || []) {
    const id = String(node?.id || '');
    if (!id) continue;
    required.set(id, Math.max(0, Number(node?.type?.requiredProgress) || 0));
    if (!adjacency.has(id)) adjacency.set(id, new Set());
    for (const connection of node?.connectedNodes || []) {
      const other = String(connection?.targetNodeId || '');
      if (!other) continue;
      adjacency.get(id).add(other);
      if (!adjacency.has(other)) adjacency.set(other, new Set());
      adjacency.get(other).add(id);
    }
  }
  if (!adjacency.has(targetId)) return Infinity;

  const stateOf = id => nodes?.[id]?.state || 'blocked';
  const remainingOf = id => Math.max(
    0,
    (required.get(id) || 0) - (Number(nodes?.[id]?.currentProgress) || 0),
  );

  const targetState = stateOf(targetId);
  if (targetState === 'open' || targetState === 'finished') return 0;

  const openNodes = Object.keys(nodes || {}).filter(id => nodes[id]?.state === 'open');
  if (!openNodes.length) return Infinity;

  let best = Infinity;
  const walk = (id, cost, seen) => {
    if (cost >= best) return;
    if (id === targetId) { best = cost; return; }
    if (seen.size > 12) return;
    for (const next of adjacency.get(id) || []) {
      if (seen.has(next)) continue;
      if (next !== targetId && stateOf(next) === 'finished' && remainingOf(next) === 0) {
        // already cleared node — passable at no extra cost
      }
      seen.add(next);
      walk(next, cost + (next === targetId ? 0 : remainingOf(next)), seen);
      seen.delete(next);
    }
  };
  for (const start of openNodes) walk(start, remainingOf(start), new Set([start]));
  return best;
}

// Через скільки мс щонайраніше може змінити стан будь-який із цільових вузлів
// підписок. Стеля швидкості: 1 бій = +10 прогресу, не швидше ніж 1 бій / msPerFight.
function quantumPollDelayMs(template, nodes, targetIds, options = {}) {
  const msPerFight = Number(options.msPerFight) || 500;
  const fightProgress = Number(options.fightProgress) || 10;
  const fallbackMs = Number(options.fallbackMs) || 60_000;
  const targets = Array.isArray(targetIds) ? targetIds.map(String).filter(Boolean) : [];
  if (!template || !Array.isArray(template.nodes) || !template.nodes.length || !targets.length) {
    return fallbackMs;
  }
  let minRemaining = Infinity;
  for (const targetId of targets) {
    minRemaining = Math.min(minRemaining, quantumRemainingToTarget(template, nodes || {}, targetId));
    if (minRemaining === 0) break;
  }
  if (!Number.isFinite(minRemaining)) return fallbackMs;
  return Math.max(0, Math.ceil(minRemaining / fightProgress) * msPerFight);
}

module.exports = {
  MAP_POLL_MS,
  MEMBER_POLL_MS,
  DETAIL_REFRESH_MS,
  INACTIVE_POLL_MS,
  HEARTBEAT_MS,
  isRunning,
  quantumRemainingToTarget,
  quantumPollDelayMs,
  mapKeyFromState,
  normalizeState,
  normalizeNodes,
  overviewFingerprint,
  normalizeMembers,
  normalizeNodeLeaderboard,
  normalizeNodeDetail,
  shouldFinalizeNode,
  comparableSnapshot,
  snapshotsEqual,
  collectQuantumSnapshot,
};
