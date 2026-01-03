import { VOLCANIC_ARCHIPELAGO_DATA } from "./volcanicData";
import { WATERFALL_ARCHIPELAGO_DATA } from "./waterfallData";

const DEFAULT_MAP_KEY = "volcanic_archipelago";

const MAP_CONFIG = {
  [DEFAULT_MAP_KEY]: {
    width: 248.83203,
    height: 248.83203,
    data: VOLCANIC_ARCHIPELAGO_DATA,
  },
  waterfall_archipelago: {
    width: 138.53601,
    height: 164.52901,
    data: WATERFALL_ARCHIPELAGO_DATA,
  },
};

const toKebab = (value) =>
  value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

const styleToString = (style) =>
  Object.entries(style)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([key, value]) => `${toKebab(key)}:${String(value)}`)
    .join(";");

const escapeAttr = (value) => String(value).replace(/"/g, "&quot;");

export const normalizeMapKey = (mapKey) => {
  if (mapKey && MAP_CONFIG[mapKey]) {
    return mapKey;
  }
  return DEFAULT_MAP_KEY;
};

const getMapConfig = (mapKey) => MAP_CONFIG[normalizeMapKey(mapKey)];

export const getDefaultMapKey = () => DEFAULT_MAP_KEY;

export const getNeighborIdsForSectors = (mapKey, sectorIds) => {
  if (!Array.isArray(sectorIds) || sectorIds.length === 0) {
    return [];
  }

  const { data } = getMapConfig(mapKey);
  const neighbors = new Set();
  const own = new Set(sectorIds);

  sectorIds.forEach((sectorId) => {
    const entry = data?.[sectorId];
    const neighborList = Array.isArray(entry?.neighbors) ? entry.neighbors : [];
    neighborList.forEach((neighborId) => {
      if (!neighborId || own.has(neighborId) || !data[neighborId]) return;
      neighbors.add(neighborId);
    });
  });

  return Array.from(neighbors);
};

export const buildGbgMapSvgStringFromState = ({
  mapKey,
  sectorColors = {},
  sectorStaff = {},
}) => {
  const { width, height, data } = getMapConfig(mapKey);
  const sectorEntries = Object.entries(data || {});

  const paths = sectorEntries
    .map(([sectorId, config]) => {
      const fill = config.fill;
      if (!fill?.d) return null;

      const style = { ...(fill.style || {}) };
      const overrideColor = sectorColors[sectorId];
      if (typeof overrideColor === "string" && overrideColor) {
        style.fill = overrideColor;
      }
      if (sectorStaff[sectorId] && style.opacity === undefined) {
        style.opacity = 0.6;
      }
      const styleStr = styleToString(style);
      const attrs = [`d="${escapeAttr(fill.d)}"`];
      if (styleStr) attrs.push(`style="${escapeAttr(styleStr)}"`);
      const id = fill.props?.id || `fill_${sectorId}`;
      attrs.push(`id="${escapeAttr(id)}"`);
      return `<path ${attrs.join(" ")} />`;
    })
    .filter(Boolean)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n${paths}\n</svg>`;
};

export const getMapDataByKey = (mapKey) => getMapConfig(mapKey).data || {};
export const getMapDimensionsByKey = (mapKey) => {
  const { width, height } = getMapConfig(mapKey);
  return { width, height };
};
