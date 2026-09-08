'use strict';

const fs = require('fs');
const path = require('path');
const { normalizeBattleground, normalizeSectorBuildings } = require('./index');

const SCHEMA_VERSION = 1;
const MAP_POLL_MS = 10_000;
const STATE_POLL_MS = 10_000;
const PLAYER_LEADERBOARD_POLL_MS = 60_000;
const BUILDING_FULL_AUDIT_MS = 30 * 60_000;
const EMPTY_SLOT_RECHECK_MS = 5 * 60_000;
const OWN_GUILD_SECTOR_COLOR = '#4B5563';
const DEFAULT_SEASON_DURATION_SECONDS = 11 * 24 * 60 * 60;

const OPPONENT_FIELDS = [
  'id',
  'participantId',
  'clanId',
  'name',
  'sectorColor',
  'staff',
  'victoryPoints',
  'rank',
];
const SECTOR_FIELDS = [
  'internalId',
  'owner',
  'ownerParticipantId',
  'isOwn',
  'color',
  'isLocked',
  'openTime',
  'army',
  'gainAttritionChance',
  'victoryPoints',
  'victoryPointsBonus',
  'totalSlots',
  'usedSlots',
  'freeSlots',
  'buildings',
  'availableBuildings',
];

function readSnapshot(filePath, guildKey) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return value?.schemaVersion === SCHEMA_VERSION && value?.guildKey === guildKey
      ? value
      : null;
  } catch (_error) {
    return null;
  }
}

function writeSnapshotAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function appMapId(gameMapId) {
  return gameMapId === 'volcano_archipelago'
    ? 'volcanic_archipelago'
    : gameMapId;
}

function responseData(session, messages, request) {
  return session.response(messages, request)?.responseData ?? null;
}

function asFirst(value) {
  return Array.isArray(value) ? value[0] : value;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null),
  );
}

function sameNumericId(left, right) {
  const leftValue = String(left ?? '').trim();
  const rightValue = String(right ?? '').trim();
  if (!/^\d+$/.test(leftValue) || !/^\d+$/.test(rightValue)) return false;
  return BigInt(leftValue) === BigInt(rightValue);
}

function assertBattlegroundGuild(rawBattleground, identity) {
  const participants = Array.isArray(rawBattleground?.battlegroundParticipants)
    ? rawBattleground.battlegroundParticipants
    : [];
  const expectedGuildId = identity?.guildId;
  if (!participants.some(item => sameNumericId(item?.clan?.id, expectedGuildId))) {
    throw new Error(
      `Карта ПБГ не містить очікувану гільдію ${identity?.worldName}_${expectedGuildId}; ` +
      'запис у Firebase скасовано',
    );
  }
}

function normalizeSeason(stateData, battlegroundData, previousSeason, nowMs, config = {}) {
  const state = asFirst(stateData) || {};
  const battleground = asFirst(battlegroundData) || {};
  const endsAt = Number(battleground.endsAt || state.endsAt || 0) || 0;
  const mapId = appMapId(battleground?.map?.id || previousSeason?.mapId || '');
  const seasonId = endsAt && mapId ? `${mapId}_${endsAt}` : null;
  const isSameSeason = Boolean(seasonId && previousSeason?.seasonId === seasonId);
  const configuredDuration = Math.max(
    1,
    Number(config.seasonDurationSeconds) || DEFAULT_SEASON_DURATION_SECONDS,
  );
  const detectedAt = isSameSeason
    ? Number(previousSeason.detectedAt || 0)
    : Math.floor(nowMs / 1000);
  const startAt = isSameSeason
    ? Number(previousSeason.startAt || 0)
    : endsAt
      ? Math.max(0, endsAt - configuredDuration)
      : 0;
  return compactObject({
    stateId: state.stateId || state.state || previousSeason?.stateId || 'unknown',
    seasonId,
    mapId: mapId || undefined,
    startAt: startAt || undefined,
    startAtSource: startAt ? 'calculated' : undefined,
    detectedAt: detectedAt || undefined,
    endAt: endsAt || undefined,
    championshipStartAt:
      state.championship?.startsAt || previousSeason?.championshipStartAt,
    championshipEndAt:
      state.championship?.endsAt || previousSeason?.championshipEndAt,
  });
}

function normalizeWaitingSeason(stateData) {
  const state = asFirst(stateData) || {};
  const startsAt = Number(state.startsAt || 0);
  return compactObject({
    stateId: state.stateId || state.state || 'unknown',
    startsAt: Number.isFinite(startsAt) && startsAt > 0
      ? Math.trunc(startsAt)
      : undefined,
  });
}

function normalizeOpponents(
  rawBattleground,
  normalized,
  colorData,
  includeGuildPoints,
  previous = {},
  ownGuildId = null,
) {
  const rawParticipants = Array.isArray(rawBattleground?.battlegroundParticipants)
    ? rawBattleground.battlegroundParticipants
    : [];
  const rawByParticipantId = new Map(
    rawParticipants.map(item => [String(item.participantId), item]),
  );
  const colorById = new Map(
    (Array.isArray(colorData) ? colorData : [])
      .filter(item => item?.id != null)
      .map(item => [String(item.id), item.mainColour || null]),
  );
  const rows = normalized.participants.map(item => {
    const clanId = item.clanId == null ? null : String(item.clanId);
    const raw = rawByParticipantId.get(String(item.participantId)) || {};
    const old = clanId ? previous[clanId] || {} : {};
    const colorId = raw.colour ?? raw.color ?? raw.colourId ?? raw.colorId;
    const staff = normalized.sectors.find(sector =>
      String(sector.ownerParticipantId ?? '') === String(item.participantId ?? '') &&
      Number(sector.totalBuildingSlots) === 1,
    )?.code;
    return compactObject({
      id: clanId,
      participantId: item.participantId,
      clanId: item.clanId,
      name: item.clanName,
      sectorColor: clanId && clanId === String(ownGuildId)
        ? OWN_GUILD_SECTOR_COLOR
        : item.sectorColor || colorById.get(String(colorId)) || old.sectorColor,
      staff,
      victoryPoints: includeGuildPoints
        ? Number(raw.victoryPoints || 0)
        : old.victoryPoints,
      rank: includeGuildPoints ? 0 : old.rank,
    });
  }).filter(item => item.id);

  if (includeGuildPoints) {
    [...rows]
      .sort((left, right) => Number(right.victoryPoints || 0) - Number(left.victoryPoints || 0))
      .forEach((item, index) => {
        item.rank = index + 1;
      });
  }
  return Object.fromEntries(rows.map(item => [String(item.id), item]));
}

function normalizeMapSectors(normalized, previousSectors = {}, ownGuildId = null) {
  return Object.fromEntries(normalized.sectors.map(sector => {
    const previous = previousSectors[sector.code] || {};
    const isOwn = sector.ownerClanId != null &&
      sameNumericId(sector.ownerClanId, ownGuildId);
    const next = compactObject({
      internalId: sector.id,
      owner: sector.ownerClanId == null ? '0' : String(sector.ownerClanId),
      ownerParticipantId: sector.ownerParticipantId,
      isOwn,
      color: isOwn
        ? OWN_GUILD_SECTOR_COLOR
        : sector.ownerColor || '#FFFFFF',
      isLocked: sector.isLocked,
      openTime: Number(sector.lockedUntil || 0),
      army: sector.battleType,
      gainAttritionChance: sector.gainAttritionChance,
      victoryPoints: sector.victoryPoints,
      victoryPointsBonus: sector.victoryPointsBonus,
      totalSlots: sector.totalBuildingSlots,
      usedSlots: sector.usedBuildingSlots ?? previous.usedSlots,
      freeSlots: previous.freeSlots,
      buildings: previous.buildings,
      availableBuildings: previous.availableBuildings,
      lastBuildingScanAt: previous.lastBuildingScanAt,
      nextEmptySlotCheckAt: previous.nextEmptySlotCheckAt,
    });
    return [sector.code, next];
  }));
}

function normalizeBuildingDetail(detail, nowSeconds) {
  const buildings = Object.fromEntries(detail.buildings.map((building, index) => {
    const slotId = String(building.slotId ?? index);
    const readyAt = Number(building.readyAt || 0);
    return [slotId, compactObject({
      name: building.id,
      state: readyAt > nowSeconds ? 'building' : 'active',
      readyAt: readyAt || undefined,
    })];
  }));
  const availableBuildings = Object.fromEntries(
    detail.availableBuildings
      .map(item => {
        const buildingId = String(item?.buildingId || item?.id || '').trim();
        if (!buildingId) return null;
        return [buildingId, compactObject({
          buildingId,
          costs: item?.costs?.resources
            ? { resources: item.costs.resources }
            : undefined,
        })];
      })
      .filter(Boolean),
  );
  return {
    usedSlots: detail.buildings.length,
    freeSlots: Number(detail.freeBuildingSlots || 0),
    buildings,
    availableBuildings,
  };
}

function normalizePlayerLeaderboard(rawData, mapId) {
  const rows = Array.isArray(rawData)
    ? rawData
    : Array.isArray(rawData?.ranking)
      ? rawData.ranking
      : [];
  const result = { mapId };
  for (const row of rows) {
    const playerId = row?.player?.player_id ?? row?.playerId;
    if (playerId == null) continue;
    result[String(playerId)] = {
      rank: Math.max(0, Number(row.rank || 0)),
      negotiationsWon: Math.max(0, Number(row.negotiationsWon || 0)),
      battlesWon: Math.max(0, Number(row.battlesWon || 0)),
      attrition: Math.max(0, Number(row.attrition || 0)),
    };
  }
  return result;
}

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function diffOwnedRecord(updates, basePath, previous, next, fields) {
  for (const field of fields) {
    const hadPrevious = hasOwn(previous, field);
    const hasNext = hasOwn(next, field);
    if (!hadPrevious && !hasNext) continue;
    const before = hadPrevious ? previous[field] : undefined;
    const after = hasNext ? next[field] : undefined;
    if (equal(before, after)) continue;
    updates[`${basePath}/${field}`] = hasNext ? after : null;
  }
}

function diffCollection(updates, basePath, previous, next, fields) {
  const keys = new Set([...Object.keys(previous || {}), ...Object.keys(next || {})]);
  for (const key of keys) {
    if (!hasOwn(next, key)) {
      updates[`${basePath}/${key}`] = null;
      continue;
    }
    if (!hasOwn(previous, key)) {
      diffOwnedRecord(updates, `${basePath}/${key}`, {}, next[key], fields);
      continue;
    }
    diffOwnedRecord(updates, `${basePath}/${key}`, previous[key], next[key], fields);
  }
}

function buildFirebaseUpdates(previous, next) {
  const updates = {};
  if (!equal(previous?.mapId, next.mapId)) updates['GBG/map'] = next.mapId;
  for (const field of ['stateId', 'startsAt', 'endsAt']) {
    if (!equal(previous?.[field], next[field]) && next[field] != null) {
      updates[`GBG/${field}`] = next[field];
    }
  }
  if (previous?.season && !next.season) updates['GBG/season'] = null;
  diffCollection(
    updates,
    'GBG/opponents',
    previous?.opponents || {},
    next.opponents || {},
    OPPONENT_FIELDS,
  );
  diffCollection(
    updates,
    'GBG/sectors',
    previous?.sectors || {},
    next.sectors || {},
    SECTOR_FIELDS,
  );
  const oldLeaderboard = previous?.playerLeaderboard || {};
  const newLeaderboard = next.playerLeaderboard || {};
  const leaderboardKeys = new Set([
    ...Object.keys(oldLeaderboard),
    ...Object.keys(newLeaderboard),
  ]);
  for (const key of leaderboardKeys) {
    if (!hasOwn(newLeaderboard, key)) {
      updates[`GBG/PlayerLeaderboard/${key}`] = null;
    } else if (!equal(oldLeaderboard[key], newLeaderboard[key])) {
      updates[`GBG/PlayerLeaderboard/${key}`] = newLeaderboard[key];
    }
  }
  return updates;
}

function nextHourlyMinute(nowMs, minute = 2) {
  const next = new Date(nowMs);
  next.setMinutes(minute, 0, 0);
  if (next.getTime() <= nowMs) next.setHours(next.getHours() + 1);
  return next.getTime();
}

function due(previousAt, intervalMs, nowMs) {
  return !Number.isFinite(Number(previousAt)) || nowMs - Number(previousAt) >= intervalMs;
}

async function collectGbgSnapshot({
  session,
  identity,
  previous,
  nowMs = Date.now(),
  options = {},
}) {
  const guildKey = `${identity.worldName}_${identity.guildId}`;
  const oldStateId = previous?.stateId || previous?.season?.stateId || 'unknown';
  const oldStartsAt = Number(
    previous?.startsAt || previous?.season?.startsAt || previous?.season?.nextStartAt || 0,
  );
  const oldEndsAt = Number(previous?.endsAt || previous?.season?.endAt || 0);
  const seasonIsRunning = previous?.phase === 'active' ||
    (oldStateId === 'participating' && oldEndsAt * 1000 > nowMs);
  const seasonHasEnded = (previous?.phase === 'active' || oldStateId === 'participating') &&
    oldEndsAt > 0 && oldEndsAt * 1000 <= nowMs;
  const waitingForStart = oldStateId !== 'participating' &&
    oldStartsAt > 0 && oldStartsAt * 1000 > nowMs;
  const retryAt = nowMs + Math.max(1_000, Number(options.retryIntervalMs) || MAP_POLL_MS);

  if (waitingForStart) {
    return {
      active: false,
      phase: 'waiting',
      resetWaiting: previous?.waitingResetDone !== true,
      nextPollAt: oldStartsAt * 1000,
      snapshot: {
        schemaVersion: SCHEMA_VERSION,
        guildKey,
        phase: 'waiting',
        stateId: oldStateId,
        startsAt: oldStartsAt,
        waitingResetDone: true,
      },
      stats: { requestedBuildingCount: 0 },
    };
  }

  // At endsAt all field requests stop. Only getState is retried until the
  // server publishes the next state and startsAt.
  if (seasonHasEnded) {
    const stateRequest = session.allocateRequest(
      'GuildBattlegroundStateService',
      'getState',
      [],
    );
    const stateMessages = await session.send(stateRequest);
    const waiting = normalizeWaitingSeason(responseData(session, stateMessages, stateRequest));
    if (waiting.stateId !== 'participating' && waiting.startsAt) {
      return {
        active: false,
        phase: 'waiting',
        resetWaiting: true,
        nextPollAt: waiting.startsAt * 1000,
        snapshot: {
          schemaVersion: SCHEMA_VERSION,
          guildKey,
          phase: 'waiting',
          ...waiting,
          waitingResetDone: true,
          lastStateScanAt: nowMs,
        },
        stats: { requestedBuildingCount: 0 },
      };
    }
    return {
      active: false,
      phase: 'ending',
      nextPollAt: retryAt,
      snapshot: {
        ...(previous || {}),
        schemaVersion: SCHEMA_VERSION,
        guildKey,
        phase: 'ending',
        stateId: waiting.stateId,
        lastStateScanAt: nowMs,
      },
      stats: { requestedBuildingCount: 0 },
    };
  }

  let discoveredStateData = null;
  if (
    !previous ||
    previous.phase === 'discovery' ||
    (oldStateId !== 'participating' && !oldStartsAt)
  ) {
    const stateRequest = session.allocateRequest(
      'GuildBattlegroundStateService',
      'getState',
      [],
    );
    const stateMessages = await session.send(stateRequest);
    discoveredStateData = responseData(session, stateMessages, stateRequest);
    const discovered = normalizeWaitingSeason(discoveredStateData);
    if (discovered.stateId !== 'participating' && discovered.startsAt &&
        discovered.startsAt * 1000 > nowMs) {
      return {
        active: false,
        phase: 'waiting',
        resetWaiting: true,
        nextPollAt: discovered.startsAt * 1000,
        snapshot: {
          schemaVersion: SCHEMA_VERSION,
          guildKey,
          phase: 'waiting',
          ...discovered,
          waitingResetDone: true,
          lastStateScanAt: nowMs,
        },
        stats: { requestedBuildingCount: 0 },
      };
    }
    // New/unknown state identifiers (for example trialSelection) are not
    // sufficient proof that the map is unavailable. Probe getBattleground
    // below and decide from the actual map response instead.
  }

  const bootstrapping = !seasonIsRunning;
  const requests = {};
  let stateData = discoveredStateData;
  if (bootstrapping && !stateData) {
    requests.state = session.allocateRequest(
      'GuildBattlegroundStateService',
      'getState',
      [],
    );
  }
  const getColors = bootstrapping || options.getColors === true ||
    !Array.isArray(previous?.colorData);
  const getLeaderboard = bootstrapping || options.getLeaderboard === true;
  const includeGuildPoints = bootstrapping || options.includeGuildPoints === true;
  const fullBuildingAudit = bootstrapping || options.fullBuildingAudit === true;
  if (getColors) {
    requests.colors = session.allocateRequest(
      'StaticDataService',
      'getDataDirectly',
      ['battleground_colour'],
    );
  }
  requests.map = session.allocateRequest(
    'GuildBattlegroundService',
    'getBattleground',
    [],
  );
  if (getLeaderboard) {
    requests.leaderboard = session.allocateRequest(
      'GuildBattlegroundService',
      'getPlayerLeaderboard',
      [],
    );
  }
  const messages = await session.send(Object.values(requests));
  const rawMapWrapper = responseData(session, messages, requests.map);
  const rawMap = asFirst(rawMapWrapper);
  if (requests.state) stateData = responseData(session, messages, requests.state);
  if (!rawMap?.map?.provinces) {
    const waiting = normalizeWaitingSeason(stateData);
    if (bootstrapping && waiting.stateId !== 'participating' && waiting.startsAt &&
        waiting.startsAt * 1000 > nowMs) {
      return {
        active: false,
        phase: 'waiting',
        resetWaiting: oldStateId === 'participating' || !previous?.startsAt,
        nextPollAt: waiting.startsAt * 1000,
        snapshot: {
          schemaVersion: SCHEMA_VERSION,
          guildKey,
          phase: 'waiting',
          ...waiting,
          waitingResetDone: true,
          lastStateScanAt: nowMs,
        },
        stats: { requestedBuildingCount: 0 },
      };
    }
    return {
      active: false,
      phase: 'bootstrap',
      nextPollAt: retryAt,
      snapshot: {
        ...(previous || {}),
        schemaVersion: SCHEMA_VERSION,
        guildKey,
        phase: 'bootstrap',
        stateId: waiting.stateId || oldStateId,
        startsAt: oldStartsAt || waiting.startsAt || undefined,
        lastStateScanAt: nowMs,
        lastMapScanAt: nowMs,
      },
      stats: { requestedBuildingCount: 0 },
    };
  }

  assertBattlegroundGuild(rawMap, identity);

  const colorData = requests.colors
    ? responseData(session, messages, requests.colors) || []
    : previous?.colorData || [];
  const normalized = normalizeBattleground(
    rawMap,
    Math.floor(nowMs / 1000),
    colorData,
  );
  if (!normalized) throw new Error('Не вдалося нормалізувати карту ПБГ');
  const season = normalizeSeason(
    stateData,
    rawMap,
    previous?.season,
    nowMs,
    options,
  );
  const mapId = bootstrapping ? appMapId(normalized.mapId) : previous.mapId;
  const endsAt = bootstrapping
    ? Number(rawMap.endsAt || season.endAt || 0)
    : oldEndsAt;
  const startsAt = oldStartsAt || Number(rawMap.startsAt || 0) ||
    (endsAt ? Math.max(0, endsAt - (
      Number(options.seasonDurationSeconds) || DEFAULT_SEASON_DURATION_SECONDS
    )) : 0);
  const currentOpponents = normalizeOpponents(
    rawMap,
    normalized,
    colorData,
    includeGuildPoints,
    bootstrapping ? {} : previous?.opponents || {},
    identity.guildId,
  );
  const opponents = bootstrapping
    ? currentOpponents
    : Object.fromEntries(Object.entries(previous?.opponents || {}).map(([clanId, old]) => [
        clanId,
        {
          ...old,
          ...(currentOpponents[clanId]?.staff
            ? { staff: currentOpponents[clanId].staff }
            : {}),
          ...(includeGuildPoints && currentOpponents[clanId]
            ? {
                victoryPoints: currentOpponents[clanId].victoryPoints,
                rank: currentOpponents[clanId].rank,
              }
            : {}),
        },
      ]));
  const sectors = normalizeMapSectors(
    normalized,
    bootstrapping ? {} : previous?.sectors || {},
    identity.guildId,
  );
  const bootstrapComplete = Boolean(
    mapId && Object.keys(opponents).length && Object.keys(sectors).length && endsAt,
  );
  if (bootstrapping && !bootstrapComplete) {
    return {
      active: false,
      phase: 'bootstrap',
      nextPollAt: retryAt,
      snapshot: {
        ...(previous || {}),
        schemaVersion: SCHEMA_VERSION,
        guildKey,
        phase: 'bootstrap',
        stateId: normalizeWaitingSeason(stateData).stateId,
        startsAt: startsAt || undefined,
        lastStateScanAt: nowMs,
        lastMapScanAt: nowMs,
      },
      stats: { requestedBuildingCount: 0 },
    };
  }
  const detailSectorCodes = [];
  for (const sector of normalized.sectors) {
    const code = sector.code;
    const old = bootstrapping ? null : previous?.sectors?.[code];
    const emptySlotDue = Number(old?.freeSlots || 0) > 0 &&
      nowMs >= Number(old?.nextEmptySlotCheckAt || 0);
    const ownerChanged = old && String(old.owner) !== String(sectors[code].owner);
    const slotsChanged = old && sector.usedBuildingSlots != null &&
      Number(old.usedSlots) !== Number(sector.usedBuildingSlots);
    if (
      fullBuildingAudit ||
      bootstrapping ||
      !old ||
      !hasOwn(old, 'buildings') ||
      ownerChanged ||
      slotsChanged ||
      emptySlotDue
    ) {
      detailSectorCodes.push(code);
    }
  }

  const sectorByCode = new Map(normalized.sectors.map(item => [item.code, item]));
  const detailTasks = detailSectorCodes.map(code => ({
    code,
    request: session.allocateRequest(
      'GuildBattlegroundBuildingService',
      'getBuildings',
      [Number(sectorByCode.get(code).id)],
    ),
  }));
  if (detailTasks.length) {
    const detailMessages = await session.sendBatches(
      detailTasks.map(item => item.request),
      40,
      'ПБГ: споруди секторів',
    );
    for (const task of detailTasks) {
      const rawDetail = responseData(session, detailMessages, task.request);
      const detail = normalizeSectorBuildings(rawDetail);
      if (!detail) {
        throw new Error(`Не отримано споруди сектора ${task.code}`);
      }
      Object.assign(
        sectors[task.code],
        normalizeBuildingDetail(detail, Math.floor(nowMs / 1000)),
        {
          lastBuildingScanAt: nowMs,
          nextEmptySlotCheckAt: Number(detail.freeBuildingSlots || 0) > 0
            ? nowMs + Math.max(
                60_000,
                Number(options.emptySlotRecheckMs) || EMPTY_SLOT_RECHECK_MS,
              )
            : 0,
        },
      );
    }
  }

  const next = {
    schemaVersion: SCHEMA_VERSION,
    guildKey,
    phase: 'active',
    stateId: 'participating',
    startsAt: startsAt || undefined,
    endsAt,
    mapId,
    colorData,
    opponents,
    sectors,
    playerLeaderboard: requests.leaderboard
      ? normalizePlayerLeaderboard(
          responseData(session, messages, requests.leaderboard),
          mapId,
        )
      : previous?.playerLeaderboard || {},
    lastStateScanAt: requests.state ? nowMs : previous?.lastStateScanAt || 0,
    lastMapScanAt: nowMs,
    lastLeaderboardScanAt: requests.leaderboard
      ? nowMs
      : previous?.lastLeaderboardScanAt || 0,
    lastGuildPointsScanAt: includeGuildPoints
      ? nowMs
      : previous?.lastGuildPointsScanAt || 0,
    nextGuildPointsScanAt: includeGuildPoints
      ? nextHourlyMinute(nowMs, Number(options.guildPointsMinute) || 2)
      : previous?.nextGuildPointsScanAt ||
        nextHourlyMinute(nowMs, Number(options.guildPointsMinute) || 2),
    lastFullBuildingAuditAt: fullBuildingAudit || bootstrapping
      ? nowMs
      : previous?.lastFullBuildingAuditAt || 0,
  };
  return {
    active: true,
    phase: 'active',
    nextPollAt: nowMs + Math.max(1_000, Number(options.mapPollIntervalMs) || MAP_POLL_MS),
    snapshot: next,
    stats: {
      requestedBuildingCount: detailTasks.length,
      sectorCount: Object.keys(sectors).length,
      playerCount: Math.max(0, Object.keys(next.playerLeaderboard).length - 1),
      seasonChanged: bootstrapping,
    },
  };
}

module.exports = {
  MAP_POLL_MS,
  STATE_POLL_MS,
  PLAYER_LEADERBOARD_POLL_MS,
  BUILDING_FULL_AUDIT_MS,
  EMPTY_SLOT_RECHECK_MS,
  OWN_GUILD_SECTOR_COLOR,
  appMapId,
  normalizeWaitingSeason,
  normalizeSeason,
  normalizeOpponents,
  sameNumericId,
  normalizeMapSectors,
  normalizeBuildingDetail,
  normalizePlayerLeaderboard,
  assertBattlegroundGuild,
  buildFirebaseUpdates,
  nextHourlyMinute,
  due,
  readSnapshot,
  writeSnapshotAtomic,
  collectGbgSnapshot,
};
