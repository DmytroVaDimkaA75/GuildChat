import { requireNativeModule } from 'expo-modules-core';
import { VOLCANIC_ARCHIPELAGO_DATA } from './volcanicData';
import { WATERFALL_ARCHIPELAGO_DATA } from './waterfallData';

const Native = requireNativeModule('GbgWidgetBridge');

const VOLCANIC_SVG_WIDTH = 248.83203;
const VOLCANIC_SVG_HEIGHT = 248.83203;
const WATERFALL_SVG_WIDTH = 138.53601;
const WATERFALL_SVG_HEIGHT = 164.52901;

const DEFAULT_MAP_KEY = 'volcanic_archipelago';

const MAP_DIMENSIONS = {
  volcanic_archipelago: { width: VOLCANIC_SVG_WIDTH, height: VOLCANIC_SVG_HEIGHT },
  waterfall_archipelago: { width: WATERFALL_SVG_WIDTH, height: WATERFALL_SVG_HEIGHT },
};

const MAP_DATA = {
  volcanic_archipelago: VOLCANIC_ARCHIPELAGO_DATA,
  waterfall_archipelago: WATERFALL_ARCHIPELAGO_DATA,
};

const safeStr = (v) => (v === undefined || v === null ? '' : String(v));

const escapeXmlAttr = (value) => {
  return safeStr(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

const buildMapSvgXml = ({ mapKey, sectorColors, sectorStaff }) => {
  const mk = MAP_DIMENSIONS[mapKey] ? mapKey : DEFAULT_MAP_KEY;
  const dims = MAP_DIMENSIONS[mk] || MAP_DIMENSIONS[DEFAULT_MAP_KEY];
  const data = MAP_DATA[mk] || {};

  const strokeWidth = mk === 'volcanic_archipelago' ? 0.7 : 1.5;

  let svg =
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `viewBox="0 0 ${dims.width} ${dims.height}" ` +
    `width="${dims.width}" height="${dims.height}">`;

  Object.entries(data).forEach(([sectorId, cfg]) => {
    const fill = cfg?.fill;
    if (!fill || !fill.d) return;

    const color = sectorColors && sectorColors[sectorId] ? sectorColors[sectorId] : (fill?.style?.fill || '#FFFFFF');
    const isStaff = !!(sectorStaff && sectorStaff[sectorId]);

    // ✅ якщо сектор "staff" — робимо трішки яскравішу обводку
    const stroke = isStaff ? '#FFFFFF' : '#121212';

    svg +=
      `<path ` +
      `d="${escapeXmlAttr(fill.d)}" ` +
      `fill="${escapeXmlAttr(color)}" ` +
      `stroke="${escapeXmlAttr(stroke)}" ` +
      `stroke-width="${strokeWidth}" ` +
      `stroke-opacity="1" ` +
      `fill-opacity="1" />`;
  });

  svg += `</svg>`;
  return svg;
};

export async function writeNext5ToCache(next5) {
  const arr = Array.isArray(next5) ? next5 : [];
  const json = JSON.stringify(arr);
  // ✅ native сам оновить віджети після запису
  await Native.setCache(json, null, null);
}

export async function writeFullMapToCache({ mapKey, sectorColors, sectorStaff }) {
  const mk = MAP_DIMENSIONS[mapKey] ? mapKey : DEFAULT_MAP_KEY;

  const mapState = {
    mapKey: mk,
    sectorColors: sectorColors || {},
    sectorStaff: sectorStaff || {},
  };

  const mapXml = buildMapSvgXml(mapState);

  await Native.setCache(null, JSON.stringify(mapState), mapXml);
}

export async function readWidgetCacheDump() {
  // ✅ читаємо саме те, що читають віджети
  return await Native.getCacheDump();
}
