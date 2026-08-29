import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';
import database from '@react-native-firebase/database';

import { VOLCANIC_ARCHIPELAGO_DATA } from './volcanicData';
import { WATERFALL_ARCHIPELAGO_DATA } from './waterfallData';

import { writeNext5ToCache, writeFullMapToCache } from './widgetCache';

// ===== Константи мап =====
const VOLCANIC_SVG_WIDTH = 248.83203;
const VOLCANIC_SVG_HEIGHT = 248.83203;
const WATERFALL_SVG_WIDTH = 138.53601;
const WATERFALL_SVG_HEIGHT = 164.52901;

const DEFAULT_MAP_KEY = 'volcanic_archipelago';

const normalizeWidgetMapKey = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'volcano_archipelago') return DEFAULT_MAP_KEY;
  return MAP_DIMENSIONS[raw] ? raw : DEFAULT_MAP_KEY;
};

const MAP_DIMENSIONS = {
  [DEFAULT_MAP_KEY]: { width: VOLCANIC_SVG_WIDTH, height: VOLCANIC_SVG_HEIGHT },
  waterfall_archipelago: { width: WATERFALL_SVG_WIDTH, height: WATERFALL_SVG_HEIGHT },
};

const MAP_DATA = {
  [DEFAULT_MAP_KEY]: VOLCANIC_ARCHIPELAGO_DATA,
  waterfall_archipelago: WATERFALL_ARCHIPELAGO_DATA,
};

// Якщо в data-файлах є neighbors — беремо їх. Якщо ні — можеш додати fallback як у GBGscreen.js
const MAP_NEIGHBORS = {
  [DEFAULT_MAP_KEY]: {},
  waterfall_archipelago: {},
};

const STAFF_SECTOR_SPLIT_REGEX = /[,\s;|\/\\]+/;

const BUILDING_BONUS_MAP = {
  guild_command_post_improvised: 20,
  guild_command_post_forward: 40,
  guild_command_post_fortified: 60,
  barracks_improvised: 20,
  barracks: 40,
  barracks_reinforced: 60,
  basic_field_outpost_diamond: 20,
  regular_field_outpost_diamond: 40,
  advanced_field_outpost_diamond: 60,
};
const STAFF_ONLY_BUILDING_BONUS_MAP = {
  guild_fieldcamp_small: 26,
  guild_fieldcamp: 52,
  guild_fieldcamp_fortified: 80,
  basic_guild_fortress_diamond: 26,
  regular_guild_fortress_diamond: 52,
  advanced_guild_fortress_diamond: 80,
};

const parseStaffSectors = (rawValue) => {
  const sectors = new Set();
  const register = (value) => {
    if (value === undefined || value === null) return;
    const normalized = String(value).trim().toUpperCase();
    if (normalized) sectors.add(normalized);
  };

  if (Array.isArray(rawValue)) {
    rawValue.forEach((item) => {
      if (typeof item === 'string') {
        item
          .split(STAFF_SECTOR_SPLIT_REGEX)
          .map((part) => part.trim())
          .filter(Boolean)
          .forEach(register);
      } else {
        register(item);
      }
    });
  } else if (typeof rawValue === 'string') {
    rawValue
      .split(STAFF_SECTOR_SPLIT_REGEX)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach(register);
  } else {
    register(rawValue);
  }

  return Array.from(sectors);
};

const isOwnSector = (entry) => entry?.isOwn === true;

const getBuildingsWithBonuses = (entry) => {
  if (!entry || typeof entry !== 'object') return [];
  const rawBuildings = entry.buildings;
  const buildings = Array.isArray(rawBuildings)
    ? rawBuildings
    : (rawBuildings && typeof rawBuildings === 'object' ? Object.values(rawBuildings) : []);
  if (buildings.length === 0) return [];

  return buildings.reduce((list, building) => {
    if (!building || typeof building !== 'object') return list;

    const state = String(building.state || '').toLowerCase();
    if (state !== 'active' && state !== 'building') return list;

    const name = building.name ? String(building.name).toLowerCase() : '';
    if (!name) return list;

    const baseBonus = BUILDING_BONUS_MAP[name];
    const staffOnlyBonus = STAFF_ONLY_BUILDING_BONUS_MAP[name];
    const bonus = Number.isFinite(baseBonus) ? baseBonus : (Number.isFinite(staffOnlyBonus) ? staffOnlyBonus : null);
    if (!Number.isFinite(bonus)) return list;

    if (state === 'active') {
      list.push({ bonus, readyAt: 0 });
      return list;
    }

    const readyAt = Number(building.readyAt);
    if (!Number.isFinite(readyAt) || readyAt <= 0) return list;

    list.push({ bonus, readyAt });
    return list;
  }, []);
};

const getNeighborIdsForSector = (mapKey, sectorId) => {
  if (!sectorId) return [];
  const data = MAP_DATA[mapKey] || {};
  const fallbackNeighbors = MAP_NEIGHBORS[mapKey] || {};
  const config = data[sectorId];

  const neighborList = Array.isArray(config?.neighbors)
    ? config.neighbors
    : Array.isArray(fallbackNeighbors[sectorId])
    ? fallbackNeighbors[sectorId]
    : [];

  return neighborList.filter((neighborId) => neighborId && data[neighborId]);
};

const getNeighborIdsForSectors = (mapKey, sectorIds) => {
  if (!Array.isArray(sectorIds) || sectorIds.length === 0) return [];
  const data = MAP_DATA[mapKey] || {};
  const ownSet = new Set(sectorIds);
  const neighbors = new Set();

  sectorIds.forEach((sectorId) => {
    const list = getNeighborIdsForSector(mapKey, sectorId);
    list.forEach((neighborId) => {
      if (!neighborId || !data[neighborId] || ownSet.has(neighborId)) return;
      neighbors.add(neighborId);
    });
  });

  return Array.from(neighbors);
};

const calculateSectorBonus = ({ mapKey, sectorId, sectors }) => {
  if (!mapKey || !sectorId || !sectors) return { value: 100, readyAt: null };

  const neighborIds = getNeighborIdsForSector(mapKey, sectorId);
  if (neighborIds.length === 0) return { value: 100, readyAt: null };

  const bonuses = [];

  neighborIds.forEach((neighborId) => {
    const entry = sectors[neighborId];
    if (!entry || typeof entry !== 'object') return;

    if (!isOwnSector(entry)) return;

    bonuses.push(...getBuildingsWithBonuses(entry));
  });

  if (bonuses.length === 0) return { value: 100, readyAt: null };

  const totalPossible = bonuses.reduce((sum, item) => sum + item.bonus, 0);
  if (totalPossible <= 0) return { value: 100, readyAt: null };

  if (totalPossible <= 80) {
    const latestReadyAt = bonuses.reduce((max, item) => Math.max(max, item.readyAt), 0);
    return { value: 100 - totalPossible, readyAt: latestReadyAt > 0 ? latestReadyAt : null };
  }

  const sorted = [...bonuses].sort((a, b) => a.readyAt - b.readyAt);
  let running = 0;
  let targetReadyAt = 0;

  for (const item of sorted) {
    running += item.bonus;
    targetReadyAt = item.readyAt;
    if (running >= 80) break;
  }

  return { value: 20, readyAt: targetReadyAt > 0 ? targetReadyAt : null };
};

/**
 * ✅ Основна функція: оновлює кеш для віджета без відкриття додатку
 * @param {object} args
 * @param {string|null} args.guildId
 * @param {string} args.reason
 * @param {string} args.sectorId
 */
const resolveGuildId = async (guildId) => {
  if (guildId) return guildId;
  const stored = await AsyncStorage.getItem('guildId');
  if (stored) return stored;

  const bridge = NativeModules?.GbgWidgetBridge;
  if (bridge && typeof bridge.getGuildId === 'function') {
    try {
      const nativeId = await bridge.getGuildId();
      if (nativeId) return String(nativeId);
    } catch (_error) {}
  }

  return null;
};

export const refreshGbgWidgetCacheFromFirebase = async ({ guildId, reason = '', sectorId = '' } = {}) => {
  // 1) Визначаємо guildId
  const gid = await resolveGuildId(guildId);
  if (!gid) return;

  // 2) Швидкий серверний snapshot: один read замість повного обходу ПБГ.
  // Старі версії backend автоматично підуть у fallback нижче.
  try {
    const snapshot = await database()
      .ref(`guilds/${gid}/GBG/widgetSnapshot`)
      .once('value');
    if (snapshot.exists()) {
      const value = snapshot.val() || {};
      const snapshotGuildId = String(value.guildId || gid);
      if (snapshotGuildId === String(gid)) {
        await writeNext5ToCache(
          Array.isArray(value.next5)
            ? value.next5
            : Object.values(value.next5 || {}),
          { guildId: gid }
        );
        await writeFullMapToCache({
          mapKey: normalizeWidgetMapKey(value.mapKey),
          sectorColors:
            value.sectorColors && typeof value.sectorColors === 'object'
              ? value.sectorColors
              : {},
          sectorStaff:
            value.sectorStaff && typeof value.sectorStaff === 'object'
              ? value.sectorStaff
              : {},
          guildId: gid,
        });
        return;
      }
    }
  } catch (_error) {
    // Fallback нижче зберігає сумісність, якщо snapshot ще не створено.
  }

  // 3) mapKey
  let mapKey = DEFAULT_MAP_KEY;
  try {
    const snap = await database().ref(`guilds/${gid}/GBG/map`).once('value');
    if (snap.exists()) {
      mapKey = normalizeWidgetMapKey(snap.val());
    }
  } catch (_error) {}

  const mapDimensions = MAP_DIMENSIONS[mapKey] || MAP_DIMENSIONS[DEFAULT_MAP_KEY];
  const mapData = MAP_DATA[mapKey] || {};

  // 4) Тягнемо sectors + opponents
  const [sectorsSnap, opponentsSnap] = await Promise.all([
    database().ref(`guilds/${gid}/GBG/sectors`).once('value'),
    database().ref(`guilds/${gid}/GBG/opponents`).once('value'),
  ]);

  const sectors = sectorsSnap.exists() ? (sectorsSnap.val() || {}) : {};
  const opponentsRaw = opponentsSnap.exists() ? (opponentsSnap.val() || {}) : {};

  // 4) Будуємо opponentMapById + opponentStaffSectors
  const opponentMapById = {};
  const opponentStaffSectors = {};

  Object.entries(opponentsRaw).forEach(([key, value]) => {
    if (!value || typeof value !== 'object') return;
    const normalizedId = value.id != null ? String(value.id) : String(key);
    const sectorColor = value.sectorColor ? String(value.sectorColor) : '#FFFFFF';
    opponentMapById[normalizedId] = { id: normalizedId, sectorColor };

    const staffSectors = parseStaffSectors(value.staff);
    staffSectors.forEach((sid) => { if (sid) opponentStaffSectors[sid] = true; });
  });

  // 5) Рахуємо sectorColors + sectorStaff
  const sectorIds = Object.keys(mapData);
  const sectorColors = {};
  const sectorStaff = {};

  sectorIds.forEach((sid) => {
    const entry = sectors[sid];

    let color = '#FFFFFF';
    let staff = false;

    if (entry && typeof entry === 'object') {
      if (typeof entry.color === 'string') color = entry.color;

      const ownerValue = entry.owner ?? entry.ownerId;
      if (ownerValue != null) {
        const ownerKey = String(ownerValue);
        if (ownerKey === '0') {
          color = '#FFFFFF';
        } else {
          const op = opponentMapById[ownerKey];
          color = op?.sectorColor ? String(op.sectorColor) : (typeof entry.color === 'string' ? entry.color : '#FFFFFF');
        }
      }

      staff = !!entry.staff;
    } else if (typeof entry === 'string') {
      color = entry;
    }

    sectorColors[sid] = color || '#FFFFFF';
    sectorStaff[sid] = staff;
  });

  // opponent staff перекриває
  Object.keys(opponentStaffSectors).forEach((sid) => {
    if (opponentStaffSectors[sid] && mapData[sid]) sectorStaff[sid] = true;
  });

  // 6) Рахуємо next5 (логіка як у GBGscreen)
  const ownSectors = sectorIds.filter((sid) => isOwnSector(sectors?.[sid]));
  const neighborIds = getNeighborIdsForSectors(mapKey, ownSectors);

  const schedule = neighborIds
    .map((sid) => {
      const entry = sectors[sid];
      if (!entry || typeof entry !== 'object') return null;

      const openTime = Number(entry.openTime);
      if (!Number.isFinite(openTime) || openTime <= 0) return null;

      const armyRaw = String(entry.army || '').trim().toLowerCase();
      const army = (armyRaw === 'attack' || armyRaw === 'defense') ? armyRaw : '';

      const bonusInfo = calculateSectorBonus({ mapKey, sectorId: sid, sectors });

      return {
        sectorId: sid,
        openTime,
        army,
        bonusValue: bonusInfo.value,
        bonusReadyAt: bonusInfo.readyAt ? Number(bonusInfo.readyAt) : 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.openTime - b.openTime);

  const next5 = schedule.slice(0, 5);

  // 7) Пишемо кеш: next5 + повна мапа (xml/state)
  await writeNext5ToCache(next5, { guildId: gid });

  await writeFullMapToCache({
    mapKey,
    mapDimensions,
    mapData,
    sectorColors,
    sectorStaff,
    guildId: gid,
  });

  // Можеш залишити для локального дебагу, але не треба у проді:
  // console.log(`[GBG Widget Refresh] ok: guild=${gid} reason=${reason} sector=${sectorId}`);
};
