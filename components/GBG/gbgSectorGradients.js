export const NEUTRAL_SECTOR_GRADIENT = [
  '#66717D',
  '#444E59',
  '#272E36',
];

export const NEUTRAL_SECTOR_COLORS = new Set([
  '#FFFFFF',
  '#CCCCCC',
  '#CDCDCD',
]);

export const EXACT_SECTOR_GRADIENTS = {
  '#18EFEF': ['#78FFFF', '#18EFEF', '#087F8F'],
};

export const normalizeHexColor = (color) => {
  if (typeof color !== 'string') return '#FFFFFF';
  const value = color.trim();
  const shortMatch = value.match(/^#([0-9a-f]{3})$/i);
  if (shortMatch) {
    return `#${shortMatch[1]
      .split('')
      .map((character) => `${character}${character}`)
      .join('')}`.toUpperCase();
  }
  const fullMatch = value.match(/^#([0-9a-f]{6})$/i);
  return fullMatch ? `#${fullMatch[1].toUpperCase()}` : '#FFFFFF';
};

export const hexToRgb = (color) => {
  const normalized = normalizeHexColor(color);
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
};

export const rgbToHex = ({ r, g, b }) => {
  const toHex = (value) => Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
};

export const mixColors = (firstColor, secondColor, amount) => {
  const first = hexToRgb(firstColor);
  const second = hexToRgb(secondColor);
  const ratio = Math.max(0, Math.min(1, Number(amount) || 0));
  return rgbToHex({
    r: first.r + (second.r - first.r) * ratio,
    g: first.g + (second.g - first.g) * ratio,
    b: first.b + (second.b - first.b) * ratio,
  });
};

export const getColorSaturation = (color) => {
  const { r, g, b } = hexToRgb(color);
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const lightness = (max + min) / 2;
  if (max === min) return 0;
  return (max - min) / (1 - Math.abs(2 * lightness - 1));
};

const saturateColor = (color) => {
  const { r, g, b } = hexToRgb(color);
  const normalized = [r / 255, g / 255, b / 255];
  const max = Math.max(...normalized);
  const min = Math.min(...normalized);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return normalizeHexColor(color);

  let hue;
  if (max === normalized[0]) {
    hue = ((normalized[1] - normalized[2]) / delta) % 6;
  } else if (max === normalized[1]) {
    hue = (normalized[2] - normalized[0]) / delta + 2;
  } else {
    hue = (normalized[0] - normalized[1]) / delta + 4;
  }
  hue = ((hue * 60) + 360) % 360;
  const saturation = Math.min(1, getColorSaturation(color) * 1.18 + 0.06);
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const section = hue / 60;
  const x = chroma * (1 - Math.abs((section % 2) - 1));
  const channels = section < 1 ? [chroma, x, 0]
    : section < 2 ? [x, chroma, 0]
      : section < 3 ? [0, chroma, x]
        : section < 4 ? [0, x, chroma]
          : section < 5 ? [x, 0, chroma]
            : [chroma, 0, x];
  const offset = lightness - chroma / 2;
  return rgbToHex({
    r: (channels[0] + offset) * 255,
    g: (channels[1] + offset) * 255,
    b: (channels[2] + offset) * 255,
  });
};

export const isNeutralColor = (color) => {
  const normalized = normalizeHexColor(color);
  const { r, g, b } = hexToRgb(normalized);
  return Math.max(r, g, b) - Math.min(r, g, b) <= 18;
};

export const createJewelGradient = (baseColor) => {
  const normalized = normalizeHexColor(baseColor);
  if (isNeutralColor(normalized)) {
    return [...NEUTRAL_SECTOR_GRADIENT];
  }

  const mainColor = saturateColor(normalized);
  return [
    mixColors(mainColor, '#FFFFFF', 0.24),
    mainColor,
    mixColors(mainColor, '#000000', 0.32),
  ];
};

export const getSectorGradient = (color) => {
  const normalizedColor = normalizeHexColor(color);
  const exactGradient = EXACT_SECTOR_GRADIENTS[normalizedColor];
  if (exactGradient) return [...exactGradient];
  if (
    NEUTRAL_SECTOR_COLORS.has(normalizedColor)
    || isNeutralColor(normalizedColor)
  ) {
    return [...NEUTRAL_SECTOR_GRADIENT];
  }
  return createJewelGradient(normalizedColor);
};

const sanitizeSvgIdPart = (value, fallback) => {
  const sanitized = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return sanitized || fallback;
};

export const createSectorGradientId = (mapKey, sectorId) => (
  `jewel-${sanitizeSvgIdPart(mapKey, 'map')}-${sanitizeSvgIdPart(sectorId, 'sector')}`
);
