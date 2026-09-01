// src/services/foeBuildings.js
//
// Довантажує визначення будівель FoE (назва, розмір, опис) з CDN гри.
//
// 1. building_entity_lookup — масив { identifier, url } на ~2837 будівель.
//    URL цього файлу застосунок дізнається з вікна гри (foeInterceptor,
//    kind: "buildingLookup") і кешує.
// 2. За потрібними cityentity_id тягнемо окремі визначення й кешуємо кожне.
//
// Усе публічне на innogamescdn.com — звичайний fetch, без сесії гри.

import AsyncStorage from '@react-native-async-storage/async-storage';

const LOOKUP_KEY = 'foeBuildingLookupV2'; // { url, map: {id: perBuildingUrl} } — лише потрібні id
const DEFS_KEY = 'foeBuildingDefsV2'; //   { id: {name,width,length,type,era,description,...} }

let lookupMem = null;
let defsMem = null;

async function readDefs() {
  if (defsMem) return defsMem;
  try {
    const raw = await AsyncStorage.getItem(DEFS_KEY);
    defsMem = raw ? JSON.parse(raw) : {};
  } catch (_e) {
    defsMem = {};
  }
  return defsMem;
}

async function writeDefs() {
  try {
    await AsyncStorage.setItem(DEFS_KEY, JSON.stringify(defsMem || {}));
  } catch (_e) {
    /* не критично */
  }
}

async function loadLookupCache() {
  if (lookupMem) return lookupMem;
  try {
    const raw = await AsyncStorage.getItem(LOOKUP_KEY);
    lookupMem = raw ? JSON.parse(raw) : { url: null, map: {} };
  } catch (_e) {
    lookupMem = { url: null, map: {} };
  }
  return lookupMem;
}

// Повертає perBuildingUrl для потрібних id. Якщо чогось бракує і lookupUrl
// свіжий — тягне повний lookup, але зберігає в кеш лише потрібні записи.
async function resolveUrls(neededIds, lookupUrl) {
  const cache = await loadLookupCache();
  const missing = neededIds.filter((id) => !cache.map[id]);
  const sameVersion = lookupUrl && cache.url === lookupUrl;

  if (missing.length && lookupUrl && !sameVersion) {
    // нова версія гри — старі URL могли протухнути, чистимо
    cache.map = {};
  }
  const stillMissing = neededIds.filter((id) => !cache.map[id]);

  if (stillMissing.length && lookupUrl) {
    const res = await fetch(lookupUrl);
    const arr = await res.json();
    const want = new Set(stillMissing);
    for (const e of arr || []) {
      const id = String(e.identifier || '').replace(/^building_entity_/, '');
      if (want.has(id) && e.url) cache.map[id] = e.url;
    }
    cache.url = lookupUrl;
    try {
      await AsyncStorage.setItem(LOOKUP_KEY, JSON.stringify(cache));
    } catch (_e) {
      /* ignore */
    }
  }
  return cache.map;
}

function slimDef(d) {
  if (!d) return null;
  const req = d.requirements || {};
  return {
    id: d.id,
    name: d.name || d.id,
    type: d.type,
    width: d.width || 1,
    length: d.length || 1,
    era: req.min_era || d.era || null,
    techId: req.tech_id || null,
    description: d.description || null,
    happiness: d.provided_happiness || 0,
    points: d.points || null,
    cost: req.cost && req.cost.resources,
  };
}

// Головна функція: повертає { id: slimDef } для переданих cityentity_id.
// Тягне лише відсутні, кешує результат. onProgress(done, total) — не обовʼязково.
export async function getBuildingDefs(cityentityIds, lookupUrl, onProgress, directUrlMap) {
  const defs = await readDefs();
  const want = Array.from(new Set(cityentityIds.filter(Boolean)));
  const missing = want.filter((id) => !defs[id]);
  if (!missing.length) {
    return Object.fromEntries(want.map((id) => [id, defs[id]]));
  }

  // URL-и, зловлені напряму з ресурсів гри (найнадійніше — не треба lookup)
  let map = {};
  if (directUrlMap && typeof directUrlMap === 'object') {
    const cache = await loadLookupCache();
    for (const id of missing) {
      if (directUrlMap[id]) {
        map[id] = directUrlMap[id];
        cache.map[id] = directUrlMap[id];
      }
    }
    try {
      await AsyncStorage.setItem(LOOKUP_KEY, JSON.stringify(cache));
    } catch (_e) {
      /* ignore */
    }
  }
  const stillMissing = missing.filter((id) => !map[id]);
  if (stillMissing.length) {
    const resolved = await resolveUrls(stillMissing, lookupUrl);
    map = { ...map, ...(resolved || {}) };
  }
  let done = 0;
  const CHUNK = 12;
  for (let i = 0; i < missing.length; i += CHUNK) {
    const batch = missing.slice(i, i + CHUNK);
    await Promise.all(
      batch.map(async (id) => {
        const url = map[id];
        if (!url) {
          defs[id] = { id, name: id, width: 1, length: 1, type: 'unknown' };
          return;
        }
        try {
          const r = await fetch(url);
          const j = await r.json();
          defs[id] = slimDef(j);
        } catch (_e) {
          defs[id] = { id, name: id, width: 1, length: 1, type: 'unknown' };
        }
      })
    );
    done += batch.length;
    if (onProgress) onProgress(done, missing.length);
  }
  await writeDefs();
  return Object.fromEntries(want.map((id) => [id, defs[id]]));
}
