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

const LOOKUP_KEY = 'foeBuildingLookupV1'; // { url, map: {id: perBuildingUrl} }
const DEFS_KEY = 'foeBuildingDefsV1'; //   { id: {name,width,length,type,description} }

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

// Отримати карту id -> perBuildingUrl. lookupUrl — свіжий URL із гри (може бути null).
async function getLookupMap(lookupUrl) {
  if (lookupMem && (!lookupUrl || lookupMem.url === lookupUrl)) return lookupMem.map;
  if (!lookupMem) {
    try {
      const raw = await AsyncStorage.getItem(LOOKUP_KEY);
      if (raw) lookupMem = JSON.parse(raw);
    } catch (_e) {
      /* ignore */
    }
  }
  if (lookupMem && (!lookupUrl || lookupMem.url === lookupUrl)) return lookupMem.map;
  if (!lookupUrl) return lookupMem ? lookupMem.map : null;

  const res = await fetch(lookupUrl);
  const arr = await res.json();
  const map = {};
  for (const e of arr || []) {
    const ident = String(e.identifier || '');
    const id = ident.replace(/^building_entity_/, '');
    if (id && e.url) map[id] = e.url;
  }
  lookupMem = { url: lookupUrl, map };
  try {
    await AsyncStorage.setItem(LOOKUP_KEY, JSON.stringify(lookupMem));
  } catch (_e) {
    /* ignore */
  }
  return map;
}

function slimDef(d) {
  if (!d) return null;
  return {
    id: d.id,
    name: d.name || d.id,
    type: d.type,
    width: d.width || 1,
    length: d.length || 1,
    description: d.description || null,
    happiness: d.provided_happiness || 0,
    points: d.points || null,
    cost: d.requirements && d.requirements.cost && d.requirements.cost.resources,
  };
}

// Головна функція: повертає { id: slimDef } для переданих cityentity_id.
// Тягне лише відсутні, кешує результат. onProgress(done, total) — не обовʼязково.
export async function getBuildingDefs(cityentityIds, lookupUrl, onProgress) {
  const defs = await readDefs();
  const want = Array.from(new Set(cityentityIds.filter(Boolean)));
  const missing = want.filter((id) => !defs[id]);
  if (!missing.length) {
    return Object.fromEntries(want.map((id) => [id, defs[id]]));
  }

  const map = await getLookupMap(lookupUrl);
  if (!map) {
    return Object.fromEntries(want.filter((id) => defs[id]).map((id) => [id, defs[id]]));
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
