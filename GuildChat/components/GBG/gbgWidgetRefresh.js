import AsyncStorage from "@react-native-async-storage/async-storage";
import database from "@react-native-firebase/database";
import {
  getDefaultMapKey,
  getMapDataByKey,
  getNeighborIdsForSectors,
} from "./gbgSvgBuilder";
import { writeFullMapToCache, writeNext5ToCache } from "./widgetCache";

const STAFF_SECTOR_SPLIT_REGEX = /[,\s;|/\\]+/;

const parseStaffSectors = (raw) => {
  const sectors = new Set();
  const register = (value) => {
    if (value === undefined || value === null) return;
    const normalized = String(value).trim().toUpperCase();
    if (normalized) sectors.add(normalized);
  };

  if (Array.isArray(raw)) {
    raw.forEach((item) => {
      if (typeof item === "string") {
        item
          .split(STAFF_SECTOR_SPLIT_REGEX)
          .map((part) => part.trim())
          .filter(Boolean)
          .forEach(register);
      } else {
        register(item);
      }
    });
  } else if (typeof raw === "string") {
    raw
      .split(STAFF_SECTOR_SPLIT_REGEX)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach(register);
  } else {
    register(raw);
  }

  return Array.from(sectors);
};

const getShortGuildId = (guildId) => {
  if (!guildId) return null;
  const parts = String(guildId).split("_");
  return parts.length > 1 ? parts[parts.length - 1] : parts[0];
};

const resolveGuildId = async (guildId) => {
  if (guildId) return String(guildId);
  const stored = await AsyncStorage.getItem("guildId");
  return stored ? String(stored) : null;
};

const buildOpponentMaps = (rawOpponents) => {
  const opponentMap = {};
  const staffSectors = {};
  Object.entries(rawOpponents || {}).forEach(([key, value]) => {
    if (value && typeof value === "object") {
      const normalizedId = value.id != null ? String(value.id) : String(key);
      const sectorColor = value.sectorColor ? String(value.sectorColor) : "#FFFFFF";
      const staff = parseStaffSectors(value.staff);
      opponentMap[normalizedId] = {
        id: normalizedId,
        sectorColor,
      };
      staff.forEach((sectorId) => {
        if (sectorId) {
          staffSectors[sectorId] = true;
        }
      });
    }
  });
  return { opponentMap, staffSectors };
};

const buildSectorColorsAndStaff = (mapKey, sectorData, opponentMap, opponentStaff) => {
  const mapData = getMapDataByKey(mapKey);
  const sectorIds = Object.keys(mapData);
  const colors = {};
  const staffFlags = {};

  sectorIds.forEach((sectorId) => {
    const entry = sectorData?.[sectorId];
    let color = "#FFFFFF";
    let staff = false;
    let ownerValue = null;

    if (entry && typeof entry === "object") {
      if (typeof entry.color === "string") {
        color = entry.color;
      }
      if (entry.owner !== undefined && entry.owner !== null) {
        ownerValue = entry.owner;
      } else if (entry.ownerId !== undefined && entry.ownerId !== null) {
        ownerValue = entry.ownerId;
      }
      staff = !!entry.staff;
    } else if (typeof entry === "string") {
      color = entry;
    }

    if (ownerValue !== null && ownerValue !== undefined) {
      const ownerKey = String(ownerValue);
      if (ownerKey === "0") {
        color = "#FFFFFF";
      } else if (opponentMap[ownerKey]?.sectorColor) {
        color = opponentMap[ownerKey].sectorColor;
      }
    }

    if (opponentStaff[sectorId]) {
      staff = true;
    }

    colors[sectorId] = color || "#FFFFFF";
    staffFlags[sectorId] = !!staff;
  });

  return { colors, staffFlags };
};

const buildNext5Schedule = (mapKey, sectorData, guildId) => {
  const mapData = getMapDataByKey(mapKey);
  const sectorIds = Object.keys(mapData);
  if (sectorIds.length === 0) return [];

  const shortId = getShortGuildId(guildId);
  if (!shortId) return [];

  const ownSectors = sectorIds.filter((sectorId) => {
    const entry = sectorData?.[sectorId];
    if (!entry || typeof entry !== "object") return false;
    let ownerValue = null;
    if (entry.owner !== undefined && entry.owner !== null) {
      ownerValue = entry.owner;
    } else if (entry.ownerId !== undefined && entry.ownerId !== null) {
      ownerValue = entry.ownerId;
    }
    if (ownerValue === null || ownerValue === undefined) return false;
    return String(ownerValue) === shortId;
  });

  if (ownSectors.length === 0) return [];

  const neighborIds = getNeighborIdsForSectors(mapKey, ownSectors);
  if (neighborIds.length === 0) return [];

  const now = Math.floor(Date.now() / 1000);

  return neighborIds
    .map((sectorId) => {
      const entry = sectorData?.[sectorId];
      if (!entry || typeof entry !== "object") return null;
      const openTime = Number(entry.openTime);
      if (!Number.isFinite(openTime) || openTime <= 0) return null;

      const armyRaw = entry.army != null ? String(entry.army).trim().toLowerCase() : "";
      const bonusValue = Number(entry.bonusValue ?? entry.bonus ?? 100);
      return {
        sectorId,
        openTime,
        army: armyRaw,
        bonusValue: Number.isFinite(bonusValue) ? bonusValue : 100,
        etaSeconds: Math.max(openTime - now, 0),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.openTime - b.openTime)
    .slice(0, 5)
    .map(({ etaSeconds, ...rest }) => rest);
};

export const refreshGbgWidgetCacheFromFirebase = async ({ guildId, reason = "", sectorId = "" } = {}) => {
  try {
    const effectiveGuildId = await resolveGuildId(guildId);
    if (!effectiveGuildId) return;

    const db = database();
    const basePath = `guilds/${effectiveGuildId}/GBG`;

    const [mapSnap, sectorsSnap, opponentsSnap] = await Promise.all([
      db.ref(`${basePath}/map`).once("value"),
      db.ref(`${basePath}/sectors`).once("value"),
      db.ref(`${basePath}/opponents`).once("value"),
    ]);

    const mapKeyRaw = mapSnap?.val();
    const mapKey = mapKeyRaw && getMapDataByKey(mapKeyRaw) ? String(mapKeyRaw) : getDefaultMapKey();
    const sectorData = (sectorsSnap?.val() && typeof sectorsSnap.val() === "object")
      ? sectorsSnap.val()
      : {};
    const opponentsRaw = (opponentsSnap?.val() && typeof opponentsSnap.val() === "object")
      ? opponentsSnap.val()
      : {};

    const { opponentMap, staffSectors } = buildOpponentMaps(opponentsRaw);
    const { colors, staffFlags } = buildSectorColorsAndStaff(mapKey, sectorData, opponentMap, staffSectors);
    const next5 = buildNext5Schedule(mapKey, sectorData, effectiveGuildId);

    await Promise.all([
      writeFullMapToCache({ mapKey, sectorColors: colors, sectorStaff: staffFlags }),
      writeNext5ToCache(next5),
    ]);
  } catch (error) {
    // У бекграунді просто замовчуємо, щоб не зривати життєвий цикл.
  }
};
