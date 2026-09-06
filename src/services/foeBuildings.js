// Завантажує локалізовані визначення лише тих будівель, які є в місті.
// Сучасні metadata FoE зберігають розмір у components.*.placement.size,
// а бонуси — у компонентах конкретної епохи. Старий плоский формат теж
// підтримується. Тимчасова помилка або відсутній URL не кешуються як 1x1.

import AsyncStorage from '@react-native-async-storage/async-storage';

const {
  normalizeBuildingDefinition,
  normalizeEra,
  normalizeLocale,
} = require('./foeBuildingMetadata');

const LOOKUP_KEY = 'foeBuildingLookupV3';
const DEFS_KEY = 'foeBuildingDefsV3';

let lookupMem = null;
let defsMem = null;
// Покоління запиту тримаємо ОКРЕМО за scope ('city', 'settlement', …), щоб
// паралельне довантаження мапи міста й мапи поселення не скасовувало одне одного
// (спільний глобальний лічильник давав AbortError тому, хто стартував першим).
const requestGenerations = new Map();
let lookupWriteChain = Promise.resolve();
let defsWriteChain = Promise.resolve();

const emptyLookup = () => ({ url: null, directSignature: null, map: {} });
const emptyDefs = () => ({ entries: {} });

function abortError() {
  const error = new Error('Building metadata request aborted');
  error.name = 'AbortError';
  return error;
}

function ensureCurrentRequest(scope, generation, signal) {
  if (signal?.aborted || generation !== requestGenerations.get(scope)) throw abortError();
}

async function readDefs() {
  if (defsMem) return defsMem;
  try {
    const raw = await AsyncStorage.getItem(DEFS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    defsMem = parsed && parsed.entries && typeof parsed.entries === 'object'
      ? parsed
      : emptyDefs();
  } catch (_error) {
    defsMem = emptyDefs();
  }
  return defsMem;
}

async function writeDefs(cache) {
  defsWriteChain = defsWriteChain
    .then(() => AsyncStorage.setItem(DEFS_KEY, JSON.stringify(cache || emptyDefs())))
    .catch(() => {});
  await defsWriteChain;
}

async function loadLookupCache() {
  if (lookupMem) return lookupMem;
  try {
    const raw = await AsyncStorage.getItem(LOOKUP_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    lookupMem = parsed && parsed.map && typeof parsed.map === 'object'
      ? { ...emptyLookup(), ...parsed }
      : emptyLookup();
  } catch (_error) {
    lookupMem = emptyLookup();
  }
  return lookupMem;
}

async function writeLookup(cache) {
  lookupWriteChain = lookupWriteChain
    .then(() => AsyncStorage.setItem(LOOKUP_KEY, JSON.stringify(cache)))
    .catch(() => {});
  await lookupWriteChain;
}

function absoluteUrl(value, baseUrl) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    return new URL(raw, baseUrl || undefined).toString();
  } catch (_error) {
    return raw;
  }
}

function directUrlSignature(neededIds, directUrlMap) {
  return neededIds
    .map((id) => [id, absoluteUrl(directUrlMap?.[id])])
    .filter(([, url]) => !!url)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, url]) => `${id}=${url}`)
    .join('|');
}

function lookupEntries(payload, depth = 0) {
  if (!payload || depth > 4) return [];
  if (Array.isArray(payload)) return payload;
  if (typeof payload !== 'object') return [];
  if (payload.identifier && payload.url) return [payload];

  for (const key of ['entries', 'assets', 'data', 'metadata', 'lookup']) {
    const nested = lookupEntries(payload[key], depth + 1);
    if (nested.length) return nested;
  }

  return Object.entries(payload)
    .filter(([, url]) => typeof url === 'string')
    .map(([identifier, url]) => ({ identifier, url }));
}

async function resolveUrls(neededIds, lookupUrl, directUrlMap, signal, scope, generation) {
  const storedCache = await loadLookupCache();
  ensureCurrentRequest(scope, generation, signal);
  const cache = { ...storedCache, map: { ...(storedCache.map || {}) } };
  let dirty = false;
  let lookupFailed = false;
  const currentLookupUrl = absoluteUrl(lookupUrl);

  if (currentLookupUrl && cache.url !== currentLookupUrl) {
    cache.url = currentLookupUrl;
    cache.map = {};
    cache.directSignature = null;
    dirty = true;
  }

  const directSignature = directUrlSignature(neededIds, directUrlMap);
  if (!currentLookupUrl && directSignature && cache.directSignature !== directSignature) {
    cache.map = {};
    cache.directSignature = directSignature;
    dirty = true;
  }

  for (const id of neededIds) {
    const direct = absoluteUrl(directUrlMap?.[id]);
    if (direct && cache.map[id] !== direct) {
      cache.map[id] = direct;
      dirty = true;
    }
  }

  const missing = neededIds.filter((id) => !cache.map[id]);
  if (missing.length && currentLookupUrl) {
    try {
      const response = await fetch(currentLookupUrl, { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      ensureCurrentRequest(scope, generation, signal);
      const wanted = new Set(missing);
      for (const entry of lookupEntries(payload)) {
        const id = String(entry?.identifier || '').replace(/^building_entity_/, '');
        if (!wanted.has(id) || !entry?.url) continue;
        cache.map[id] = absoluteUrl(entry.url, currentLookupUrl);
        dirty = true;
      }
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      lookupFailed = true;
    }
  }

  ensureCurrentRequest(scope, generation, signal);
  if (dirty) {
    lookupMem = cache;
    await writeLookup(cache);
    ensureCurrentRequest(scope, generation, signal);
  }
  return { map: cache.map, lookupFailed };
}

function definitionCacheKey(entityId, playerEra, locale) {
  return `${entityId}@${normalizeEra(playerEra) || 'unknown'}#${normalizeLocale(locale) || 'game'}`;
}

function unresolvedDefinition(entityId, playerEra, reason) {
  return {
    id: entityId,
    variantKey: `${entityId}@${normalizeEra(playerEra) || 'unknown'}`,
    name: entityId,
    nameLocale: null,
    type: 'unknown',
    width: null,
    length: null,
    era: normalizeEra(playerEra),
    componentEra: null,
    description: null,
    bonuses: [],
    resolved: false,
    error: reason,
  };
}

function normalizeDefinitionRequests(items, fallbackEra) {
  const requests = new Map();
  for (const item of items || []) {
    const isDescriptor = item && typeof item === 'object';
    const entityId = String(
      isDescriptor ? item.entityId || item.id || item.cid || '' : item || ''
    ).trim();
    if (!entityId) continue;
    const requestedEra = normalizeEra(isDescriptor ? item.era : null) || normalizeEra(fallbackEra);
    const key = `${entityId}@${requestedEra || 'unknown'}`;
    requests.set(key, { key, entityId, requestedEra });
  }
  return Array.from(requests.values());
}

// Повертає { "cityentity_id@requestedEra": normalizedDefinition }.
// Один metadata-файл завантажується лише раз, навіть якщо місто має кілька
// вікових варіантів тієї самої MultiAge-будівлі.
// options: { playerEra, locale, signal, scope }. onProgress(done, total) — необов'язково.
// scope ('city' | 'settlement' | …) — щоб паралельні виклики для різних мап
// не скасовували одне одного; типово 'city'.
export async function getBuildingDefs(
  buildingRequests,
  lookupUrl,
  onProgress,
  directUrlMap,
  options = {}
) {
  const requests = normalizeDefinitionRequests(buildingRequests, options.playerEra);
  if (!requests.length) return {};
  const scope = String(options.scope || 'city');
  const generation = (requestGenerations.get(scope) || 0) + 1;
  requestGenerations.set(scope, generation);
  const wantedIds = Array.from(new Set(requests.map((request) => request.entityId)));

  const storedCache = await readDefs();
  ensureCurrentRequest(scope, generation, options.signal);
  const cache = { ...storedCache, entries: { ...(storedCache.entries || {}) } };
  const { map, lookupFailed } = await resolveUrls(
    wantedIds,
    lookupUrl,
    directUrlMap,
    options.signal,
    scope,
    generation
  );
  const result = {};
  const pendingById = new Map();

  for (const request of requests) {
    const { entityId, key, requestedEra } = request;
    const url = absoluteUrl(map[entityId]);
    const cacheKey = definitionCacheKey(entityId, requestedEra, options.locale);
    const cached = cache.entries[cacheKey];
    if (cached?.resolved && (!url || cached._sourceUrl === url)) {
      result[key] = cached;
      continue;
    }
    if (!url) {
      result[key] = unresolvedDefinition(
        entityId,
        requestedEra,
        lookupFailed ? 'lookup_failed' : 'missing_url'
      );
      continue;
    }
    const pending = pendingById.get(entityId) || { entityId, url, requests: [] };
    pending.requests.push({ ...request, cacheKey });
    pendingById.set(entityId, pending);
  }

  const pending = Array.from(pendingById.values());
  const pendingCount = pending.reduce((total, item) => total + item.requests.length, 0);
  let done = requests.length - pendingCount;
  onProgress?.(done, requests.length);
  let cacheChanged = false;
  const batchSize = 12;

  for (let index = 0; index < pending.length; index += batchSize) {
    const batch = pending.slice(index, index + batchSize);
    await Promise.all(
      batch.map(async ({ entityId, url, requests: entityRequests }) => {
        try {
          const response = await fetch(url, { signal: options.signal });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const payload = await response.json();
          ensureCurrentRequest(scope, generation, options.signal);
          for (const request of entityRequests) {
            const normalized = normalizeBuildingDefinition(payload, {
              entityId,
              playerEra: request.requestedEra,
              locale: options.locale,
              sourceUrl: url,
            });
            if (!normalized) throw new Error('invalid_definition');
            const stored = { ...normalized, _cachedAt: Date.now() };
            cache.entries[request.cacheKey] = stored;
            result[request.key] = stored;
            cacheChanged = true;
          }
        } catch (error) {
          if (error?.name === 'AbortError') throw error;
          for (const request of entityRequests) {
            result[request.key] = unresolvedDefinition(
              entityId,
              request.requestedEra,
              'fetch_failed'
            );
          }
        }
      })
    );
    done += batch.reduce((total, item) => total + item.requests.length, 0);
    onProgress?.(done, requests.length);
  }

  ensureCurrentRequest(scope, generation, options.signal);
  if (cacheChanged) {
    defsMem = cache;
    await writeDefs(cache);
    ensureCurrentRequest(scope, generation, options.signal);
  }
  return Object.fromEntries(requests.map((request) => [request.key, result[request.key]]));
}
