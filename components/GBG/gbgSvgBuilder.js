import { VOLCANIC_ARCHIPELAGO_DATA } from "./volcanicData";
import { WATERFALL_ARCHIPELAGO_DATA } from "./waterfallData";

const VOLCANIC_SVG_WIDTH = 248.83203;
const VOLCANIC_SVG_HEIGHT = 248.83203;
const WATERFALL_SVG_WIDTH = 138.53601;
const WATERFALL_SVG_HEIGHT = 164.52901;

const DEFAULT_MAP_KEY = "volcanic_archipelago";

const MAP_DIMENSIONS = {
  [DEFAULT_MAP_KEY]: { width: VOLCANIC_SVG_WIDTH, height: VOLCANIC_SVG_HEIGHT },
  waterfall_archipelago: { width: WATERFALL_SVG_WIDTH, height: WATERFALL_SVG_HEIGHT },
};

const MAP_DATA = {
  [DEFAULT_MAP_KEY]: VOLCANIC_ARCHIPELAGO_DATA,
  waterfall_archipelago: WATERFALL_ARCHIPELAGO_DATA,
};

const escapeXmlAttr = (value) => {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
};

const camelToKebab = (str) => str.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

const styleObjToSvgStyle = (styleObj) => {
  if (!styleObj || typeof styleObj !== "object") return "";
  const parts = [];

  Object.entries(styleObj).forEach(([key, val]) => {
    if (val === undefined || val === null) return;
    if (key === "InkscapeFontSpecification") return; // ігноруємо специфічний ключ
    const cssKey = camelToKebab(key);
    const cssVal = typeof val === "number" ? String(val) : String(val);
    parts.push(`${cssKey}:${cssVal}`);
  });

  return parts.join(";");
};

const propsToAttrs = (props) => {
  if (!props || typeof props !== "object") return "";
  const allowed = ["id"];
  return allowed
    .filter((k) => props[k] !== undefined && props[k] !== null)
    .map((k) => `${k}="${escapeXmlAttr(props[k])}"`)
    .join(" ");
};

export const getDefaultMapKey = () => DEFAULT_MAP_KEY;

export const getMapDimensions = (mapKey) => {
  const key = MAP_DIMENSIONS[mapKey] ? mapKey : DEFAULT_MAP_KEY;
  return MAP_DIMENSIONS[key];
};

export const getMapData = (mapKey) => {
  const key = MAP_DATA[mapKey] ? mapKey : DEFAULT_MAP_KEY;
  return MAP_DATA[key] || {};
};

/**
 * Будує SVG XML рядок з тими ж стилями, що й у додатку (без кліків).
 * @param {object} args
 * @param {string} args.mapKey
 * @param {object} args.sectorColors
 * @param {object} args.sectorStaff
 * @returns {string}
 */
export const buildGbgMapSvgStringFromState = ({ mapKey, sectorColors, sectorStaff }) => {
  const effectiveKey = MAP_DATA[mapKey] ? mapKey : DEFAULT_MAP_KEY;
  const mapData = getMapData(effectiveKey);
  const mapDimensions = getMapDimensions(effectiveKey);

  const w = Number(mapDimensions?.width || 0);
  const h = Number(mapDimensions?.height || 0);
  const viewBox = `0 0 ${w} ${h}`;
  const strokeWidth = effectiveKey === "volcanic_archipelago" ? 0.7 : 1.5;

  const body = Object.entries(mapData)
    .map(([sectorId, config]) => {
      if (!config || typeof config !== "object") return "";

      const { fill, text, icon } = config;

      const fillStyle = { ...(fill?.style || {}) };
      const color = sectorColors?.[sectorId];
      if (color) fillStyle.fill = color;

      fillStyle.stroke = "#121212";
      fillStyle.strokeWidth = strokeWidth;
      fillStyle.strokeOpacity = 1;

      const textStyle = {
        ...(text?.style || {}),
        display: sectorStaff?.[sectorId] ? "none" : (text?.style?.display ?? "inline"),
      };

      const iconStyle = {
        ...(icon?.style || {}),
        display: sectorStaff?.[sectorId] ? "inline" : "none",
        fill: "#FFFFFF",
      };
      if (typeof iconStyle.stroke === "string" && iconStyle.stroke.toLowerCase() !== "none") {
        iconStyle.stroke = "#FFFFFF";
      }

      const parts = [];

      if (fill?.d) {
        parts.push(
          `<path ${propsToAttrs(fill?.props)} d="${escapeXmlAttr(fill.d)}" style="${escapeXmlAttr(styleObjToSvgStyle(fillStyle))}" />`
        );
      }

      if (text?.d) {
        parts.push(
          `<path ${propsToAttrs(text?.props)} d="${escapeXmlAttr(text.d)}" style="${escapeXmlAttr(styleObjToSvgStyle(textStyle))}" />`
        );
      }

      if (icon?.d) {
        parts.push(
          `<path ${propsToAttrs(icon?.props)} d="${escapeXmlAttr(icon.d)}" style="${escapeXmlAttr(styleObjToSvgStyle(iconStyle))}" />`
        );
      }

      return `<g id="${escapeXmlAttr(sectorId)}">\n${parts.join("\n")}\n</g>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${viewBox}">
${body}
</svg>`;
};
