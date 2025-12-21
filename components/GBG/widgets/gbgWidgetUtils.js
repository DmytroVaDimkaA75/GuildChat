import { VOLCANIC_ARCHIPELAGO_DATA } from "../volcanicData";
import { WATERFALL_ARCHIPELAGO_DATA } from "../waterfallData";

const VOLCANIC_SVG_WIDTH = 248.83203;
const VOLCANIC_SVG_HEIGHT = 248.83203;
const WATERFALL_SVG_WIDTH = 138.53601;
const WATERFALL_SVG_HEIGHT = 164.52901;

const DEFAULT_MAP_KEY = 'volcanic_archipelago';
const MAP_DIMENSIONS = {
    [DEFAULT_MAP_KEY]: { width: VOLCANIC_SVG_WIDTH, height: VOLCANIC_SVG_HEIGHT },
    waterfall_archipelago: { width: WATERFALL_SVG_WIDTH, height: WATERFALL_SVG_HEIGHT },
};
const MAP_DATA = {
    [DEFAULT_MAP_KEY]: VOLCANIC_ARCHIPELAGO_DATA,
    waterfall_archipelago: WATERFALL_ARCHIPELAGO_DATA,
};
const MAP_TITLE_TRANSLATIONS = {
    [DEFAULT_MAP_KEY]: 'Вулканічний архіпелаг',
    waterfall_archipelago: 'Водоспадний архіпелаг',
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

const parseStaffSectors = (rawValue) => {
    const sectors = new Set();
    const register = (value) => {
        if (value === undefined || value === null) return;
        const normalized = String(value).trim().toUpperCase();
        if (normalized) sectors.add(normalized);
    };
    if (Array.isArray(rawValue)) {
        rawValue.forEach(item => {
            if (typeof item === 'string') {
                item.split(STAFF_SECTOR_SPLIT_REGEX).map(part => part.trim()).filter(Boolean).forEach(register);
            } else {
                register(item);
            }
        });
    } else if (typeof rawValue === 'string') {
        rawValue.split(STAFF_SECTOR_SPLIT_REGEX).map(part => part.trim()).filter(Boolean).forEach(register);
    } else {
        register(rawValue);
    }
    return Array.from(sectors);
};

const getSectorOwnerId = (entry) => {
    if (!entry || typeof entry !== 'object') return null;
    const ownerValue = entry.owner ?? entry.ownerId;
    if (ownerValue === undefined || ownerValue === null) return null;
    return String(ownerValue);
};

const getBuildingsWithBonuses = (entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const buildings = Array.isArray(entry.buildings) ? entry.buildings : [];
    if (buildings.length === 0) return [];
    return buildings.reduce((list, building) => {
        if (!building || typeof building !== 'object') return list;
        const state = String(building.state || '').toLowerCase();
        if (state !== 'active' && state !== 'building') return list;
        const name = building.name ? String(building.name) : '';
        if (!name) return list;
        const bonus = BUILDING_BONUS_MAP[name];
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
    const config = data[sectorId];
    const neighborList = Array.isArray(config?.neighbors) ? config.neighbors : [];
    return neighborList.filter(neighborId => neighborId && data[neighborId]);
};

const getNeighborIdsForSectors = (mapKey, sectorIds) => {
    if (!Array.isArray(sectorIds) || sectorIds.length === 0) return [];
    const data = MAP_DATA[mapKey] || {};
    const ownSet = new Set(sectorIds);
    const neighbors = new Set();
    sectorIds.forEach(sectorId => {
        const config = data[sectorId];
        const neighborList = Array.isArray(config?.neighbors) ? config.neighbors : [];
        neighborList.forEach(neighborId => {
            if (!neighborId || !data[neighborId] || ownSet.has(neighborId)) return;
            neighbors.add(neighborId);
        });
    });
    return Array.from(neighbors);
};

const calculateSectorBonus = ({ mapKey, sectorId, sectors, shortGuildId }) => {
    if (!mapKey || !sectorId || !sectors || !shortGuildId) return { value: 100, readyAt: null };
    const neighborIds = getNeighborIdsForSector(mapKey, sectorId);
    if (neighborIds.length === 0) return { value: 100, readyAt: null };
    const shortId = String(shortGuildId);
    const bonuses = [];
    neighborIds.forEach(neighborId => {
        const entry = sectors[neighborId];
        if (!entry || typeof entry !== 'object') return;
        const ownerId = getSectorOwnerId(entry);
        if (!ownerId || ownerId !== shortId) return;
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

const formatRemaining = seconds => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.max(seconds % 60, 0);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const getArmyColor = (army) => {
    if (!army) return '#6c757d';
    const normalized = String(army).trim().toLowerCase();
    if (normalized === 'attack') return '#e74c3c';
    if (normalized === 'defense') return '#3498db';
    return '#6c757d';
};

const getMapDimensions = (mapKey) => MAP_DIMENSIONS[mapKey] || MAP_DIMENSIONS[DEFAULT_MAP_KEY];
const getMapTitle = (mapKey) => MAP_TITLE_TRANSLATIONS[mapKey] || MAP_TITLE_TRANSLATIONS[DEFAULT_MAP_KEY];

export {
    calculateSectorBonus,
    DEFAULT_MAP_KEY,
    formatRemaining,
    getArmyColor,
    getMapDimensions,
    getMapTitle,
    getNeighborIdsForSectors,
    MAP_DATA,
    parseStaffSectors,
};
