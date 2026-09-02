const ERA_ORDER = [
  'NoAge',
  'StoneAge',
  'BronzeAge',
  'IronAge',
  'EarlyMiddleAge',
  'HighMiddleAge',
  'LateMiddleAge',
  'ColonialAge',
  'IndustrialAge',
  'ProgressiveEra',
  'ModernEra',
  'PostModernEra',
  'ContemporaryEra',
  'TomorrowEra',
  'FutureEra',
  'ArcticFuture',
  'OceanicFuture',
  'VirtualFuture',
  'SpaceAgeMars',
  'SpaceAgeAsteroidBelt',
  'SpaceAgeVenus',
  'SpaceAgeJupiterMoon',
  'SpaceAgeTitan',
  'SpaceAgeSpaceHub',
  'StellarAgeDiscovery',
];

const ERA_INDEX = new Map(ERA_ORDER.map((era, index) => [era, index]));

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

const positiveNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

function normalizeEra(value) {
  if (typeof value === 'string') return value.trim() || null;
  if (!isObject(value)) return null;
  return normalizeEra(value.era || value.id || value.value || value.name);
}

function normalizeLocale(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  return raw.split(/[-_]/)[0] || null;
}

function localeFromUrl(value) {
  try {
    const host = new URL(String(value || '')).hostname.toLowerCase();
    const match = host.match(/^foe([a-z]{2})\./);
    if (!match || match[1] === 'zz') return null;
    return match[1];
  } catch (_error) {
    return null;
  }
}

function pickLocalized(value, requestedLocale, fallback) {
  if (typeof value === 'string' && value.trim()) {
    return { text: value.trim(), locale: null };
  }
  if (!isObject(value)) return { text: fallback, locale: null };

  const locale = normalizeLocale(requestedLocale);
  const aliases = {
    be: ['be', 'by'],
    uk: ['uk', 'ua'],
  };
  const wanted = [requestedLocale, locale, ...(aliases[locale] || []), 'uk', 'en', 'ru']
    .filter(Boolean)
    .map((item) => String(item).toLowerCase());
  const keys = Object.keys(value);

  for (const candidate of wanted) {
    const key = keys.find((item) => item.toLowerCase() === candidate);
    if (key && typeof value[key] === 'string' && value[key].trim()) {
      return { text: value[key].trim(), locale: normalizeLocale(key) };
    }
  }

  const first = keys.find((key) => typeof value[key] === 'string' && value[key].trim());
  return first
    ? { text: value[first].trim(), locale: normalizeLocale(first) }
    : { text: fallback, locale: null };
}

function unwrapBuildingDefinition(payload, expectedId, depth = 0) {
  if (!payload || depth > 4) return null;
  if (Array.isArray(payload)) {
    return (
      payload.find((item) => isObject(item) && String(item.id || '') === String(expectedId || '')) ||
      payload.find((item) => isObject(item) && (item.id || item.components || item.width)) ||
      null
    );
  }
  if (!isObject(payload)) return null;
  if (payload.id || payload.components || payload.width || payload.length) return payload;

  const direct = payload[expectedId] || payload[`building_entity_${expectedId}`];
  if (direct) return unwrapBuildingDefinition(direct, expectedId, depth + 1);

  for (const key of ['data', 'metadata', 'entity', 'definition', 'value']) {
    const nested = unwrapBuildingDefinition(payload[key], expectedId, depth + 1);
    if (nested) return nested;
  }

  const values = Object.values(payload);
  if (values.length === 1) return unwrapBuildingDefinition(values[0], expectedId, depth + 1);
  return null;
}

function inferEraFromId(entityId) {
  const id = String(entityId || '');
  if (/(^|_)MultiAge(_|$)/i.test(id)) return 'MultiAge';
  if (/(^|_)AllAge(_|$)/i.test(id)) return 'AllAge';
  return [...ERA_ORDER]
    .sort((left, right) => right.length - left.length)
    .find((era) => new RegExp(`(^|_)${era}(_|$)`, 'i').test(id)) || null;
}

function resolveRequestedBuildingEra(entityId, entityEra, playerEra) {
  const idEra = inferEraFromId(entityId);
  const instanceEra = normalizeEra(entityEra);
  const currentEra = normalizeEra(playerEra);
  if (idEra === 'AllAge') return 'AllAge';
  if (idEra === 'MultiAge') {
    return instanceEra && instanceEra !== 'AllAge' && instanceEra !== 'MultiAge'
      ? instanceEra
      : currentEra;
  }
  return idEra || instanceEra || currentEra;
}

function closestAvailableEra(requestedEra, availableEras) {
  if (!availableEras.length) return null;
  if (requestedEra && availableEras.includes(requestedEra)) return requestedEra;

  const requestedIndex = ERA_INDEX.get(requestedEra);
  const known = availableEras
    .filter((era) => ERA_INDEX.has(era))
    .sort((left, right) => ERA_INDEX.get(left) - ERA_INDEX.get(right));
  if (!known.length) return availableEras[availableEras.length - 1];
  if (requestedIndex == null) return known[known.length - 1];

  const notNewer = known.filter((era) => ERA_INDEX.get(era) <= requestedIndex);
  return notNewer[notNewer.length - 1] || known[0];
}

function resolveEffectiveEra(definition, entityId, playerEra) {
  const components = isObject(definition.components) ? definition.components : {};
  const componentEras = Object.keys(components).filter((key) => key !== 'AllAge');
  const idEra = inferEraFromId(entityId);
  const currentEra = normalizeEra(playerEra);

  if (idEra === 'MultiAge') {
    return closestAvailableEra(currentEra, componentEras) || currentEra || 'AllAge';
  }
  if (idEra === 'AllAge') return 'AllAge';

  const declaredEra =
    normalizeEra(definition.era) ||
    normalizeEra(definition.requirements?.min_era) ||
    (idEra && idEra !== 'MultiAge' ? idEra : null);
  if (declaredEra) return declaredEra;
  if (currentEra && components[currentEra]) return currentEra;
  return closestAvailableEra(currentEra, componentEras) || 'AllAge';
}

function findBuildingType(node, depth = 0) {
  if (!node || depth > 5) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findBuildingType(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isObject(node)) return null;
  if (typeof node.buildingType === 'string' && node.buildingType) return node.buildingType;
  for (const value of Object.values(node)) {
    const found = findBuildingType(value, depth + 1);
    if (found) return found;
  }
  return null;
}

function typeFromClass(className) {
  const value = String(className || '');
  const known = [
    ['GreatBuilding', 'greatbuilding'],
    ['MainBuilding', 'main_building'],
    ['Residential', 'residential'],
    ['Production', 'production'],
    ['Goods', 'goods'],
    ['Military', 'military'],
    ['Culture', 'culture'],
    ['Decoration', 'decoration'],
    ['Street', 'street'],
  ];
  return known.find(([needle]) => value.includes(needle))?.[1] || null;
}

function readFootprint(definition, allAgeComponents, eraComponents) {
  const placements = [
    eraComponents?.placement,
    allAgeComponents?.placement,
    definition.placement,
  ].filter(Boolean);

  for (const placement of placements) {
    const size = placement.size || placement;
    const width = positiveNumber(size.x ?? size.width);
    const length = positiveNumber(size.y ?? size.length);
    if (width && length) return { width, length };
  }

  return {
    width: positiveNumber(definition.width),
    length: positiveNumber(definition.length),
  };
}

function collectBoosts(node, output, path = '', depth = 0) {
  if (!node || depth > 8) return;
  if (Array.isArray(node)) {
    node.forEach((item) => collectBoosts(item, output, path, depth + 1));
    return;
  }
  if (!isObject(node)) return;

  const className = String(node.__class__ || '');
  const boostContext = /boost/i.test(path) || /BoostHint/i.test(className);
  const value = Number(node.value);
  if (
    boostContext &&
    node.value != null &&
    typeof node.type === 'string' &&
    Number.isFinite(value)
  ) {
    output.push({
      type: node.type,
      value,
      targetedFeature: node.targetedFeature || node.feature || 'all',
      onlyWhenMotivated: node.onlyWhenMotivated === true,
      condition:
        typeof node.condition === 'string'
          ? node.condition
          : node.condition?.type || node.condition?.id || null,
    });
  }

  for (const [key, valueNode] of Object.entries(node)) {
    collectBoosts(valueNode, output, `${path}.${key}`, depth + 1);
  }
}

function uniqueBoosts(boosts) {
  const seen = new Set();
  return boosts.filter((boost) => {
    const key = [
      boost.type,
      boost.value,
      boost.targetedFeature,
      boost.onlyWhenMotivated,
      boost.condition,
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeBuildingDefinition(payload, options = {}) {
  const requestedId = String(options.entityId || '').trim();
  const definition = unwrapBuildingDefinition(payload, requestedId);
  if (!definition) return null;

  const entityId = String(definition.id || requestedId).trim();
  if (!entityId) return null;
  const era = resolveEffectiveEra(definition, entityId, options.playerEra);
  const components = isObject(definition.components) ? definition.components : {};
  const allAgeComponents = isObject(components.AllAge) ? components.AllAge : null;
  const componentEras = Object.keys(components).filter((key) => key !== 'AllAge');
  const componentEra = era === 'AllAge' ? null : closestAvailableEra(era, componentEras);
  const eraComponents = componentEra && isObject(components[componentEra])
    ? components[componentEra]
    : null;
  const footprint = readFootprint(definition, allAgeComponents, eraComponents);

  const sourceLocale = localeFromUrl(options.sourceUrl);
  const requestedLocale = options.locale || sourceLocale;
  const localizedName = pickLocalized(
    definition.name || definition.names || definition.localizedName,
    requestedLocale,
    entityId
  );
  const localizedDescription = pickLocalized(
    definition.description || definition.descriptions,
    requestedLocale,
    null
  );

  const rawType = String(definition.type || '');
  const type =
    (rawType && !/^(unknown|generic_building)$/i.test(rawType) ? rawType : null) ||
    findBuildingType(eraComponents) ||
    findBuildingType(allAgeComponents) ||
    typeFromClass(definition.__class__) ||
    'unknown';

  const bonuses = [];
  collectBoosts(allAgeComponents, bonuses, 'components.AllAge');
  if (eraComponents) collectBoosts(eraComponents, bonuses, `components.${componentEra}`);
  collectBoosts(definition.bonus, bonuses, 'bonus');
  collectBoosts(definition.bonuses, bonuses, 'bonuses');

  const eraHappiness = eraComponents?.happiness;
  const allAgeHappiness = allAgeComponents?.happiness;
  const providedHappiness = Number(
    eraHappiness?.provided ?? allAgeHappiness?.provided ?? definition.provided_happiness
  );

  return {
    id: entityId,
    variantKey: `${entityId}@${era}`,
    name: localizedName.text || entityId,
    nameLocale: localizedName.locale || sourceLocale || normalizeLocale(requestedLocale),
    type,
    width: footprint.width,
    length: footprint.length,
    era,
    componentEra,
    description: localizedDescription.text,
    bonuses: uniqueBoosts(bonuses),
    happiness: Number.isFinite(providedHappiness) ? providedHappiness : 0,
    points: definition.points ?? null,
    techId: definition.requirements?.tech_id || null,
    resolved: true,
    sourceLocale,
    _sourceUrl: options.sourceUrl || null,
  };
}

module.exports = {
  ERA_ORDER,
  localeFromUrl,
  normalizeBuildingDefinition,
  normalizeEra,
  normalizeLocale,
  resolveRequestedBuildingEra,
  resolveEffectiveEra,
  unwrapBuildingDefinition,
};
