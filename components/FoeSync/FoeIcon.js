// components/FoeSync/FoeIcon.js
//
// Показує справжню іконку ресурсу з ігрового спрайт-листа.
//   • icons_0-*  — валюти/нагороди (money, supplies, medals, premium, ВП…)
//   • *goods_large_0-*  — товари по епохах (мармур, тканина…)
// Адреси картинок і json-карти координат застосунок дізнається сам із вікна
// гри (foeInterceptor.js, kind "iconSheet" / "goodsSheet") і кешує локально.

import React from 'react';
import { Image, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ICON_CACHE_KEY = 'foeIconSheetV2'; // v2 — кадри тепер зберігають прапорець rotated
const GOODS_CACHE_KEY = 'foeGoodsSheetV2';

// Компактний формат кадрів: [name, x, y, w, h, offX?, offY?, origW?, origH?, rotated?]
// rotated=true — кадр упакований у лист повернутим на 90° (за годинниковою),
// тож для показу його треба повернути назад (проти годинникової).
export function parseAtlas(json) {
  const frames = {};
  for (const f of json?.frames || []) {
    const [name, x, y, w, h] = f;
    if (typeof name === 'string' && typeof x === 'number') {
      frames[name] = { x, y, w, h, rotated: !!f[9] };
    }
  }
  return { frames, sheetW: json?.size?.w || 0, sheetH: json?.size?.h || 0 };
}

async function loadCached(key) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_e) {
    return null;
  }
}

async function fetchSheet(pngUrl, jsonUrl, key) {
  const res = await fetch(jsonUrl);
  const json = await res.json();
  const { frames, sheetW, sheetH } = parseAtlas(json);
  const data = { pngUrl, frames, sheetW, sheetH, savedAt: Date.now() };
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));
  } catch (_e) {
    /* не критично */
  }
  return data;
}

export const loadCachedIconSheet = () => loadCached(ICON_CACHE_KEY);
export const fetchIconSheet = (png, json) => fetchSheet(png, json, ICON_CACHE_KEY);
export const loadCachedGoodsSheet = () => loadCached(GOODS_CACHE_KEY);
export const fetchGoodsSheet = (png, json) => fetchSheet(png, json, GOODS_CACHE_KEY);

// Кілька варіантів імені кадру (у різних листах трохи різні назви)
function frameFor(sheet, name) {
  const f = sheet?.frames;
  if (!f || !name) return null;
  const variants = [
    name,
    `good_${name}`,
    `goods_${name}`,
    name.replace(/^good_/, ''),
    name.charAt(0).toUpperCase() + name.slice(1),
  ];
  for (const v of variants) if (f[v]) return f[v];
  return null;
}

// <FoeIcon sheet={iconSheet} name="medals" size={20} />
// sheet може бути одним листом або масивом (пробуються по черзі).
export default function FoeIcon({ sheet, name, size = 20, style }) {
  const sheets = (Array.isArray(sheet) ? sheet : [sheet]).filter(Boolean);
  let picked = null;
  let frame = null;
  for (const s of sheets) {
    const fr = frameFor(s, name);
    if (fr && s.pngUrl && s.sheetW && s.sheetH) {
      picked = s;
      frame = fr;
      break;
    }
  }
  if (!picked || !frame) return null;

  // frame.w × frame.h — розмір ділянки в листі. Якщо кадр повернутий, реальні
  // (показувані) сторони міняються місцями.
  const dispW = frame.rotated ? frame.h : frame.w;
  const dispH = frame.rotated ? frame.w : frame.h;
  const scale = size / Math.max(dispW, dispH);

  const crop = (
    <View
      style={{
        width: frame.w * scale,
        height: frame.h * scale,
        overflow: 'hidden',
      }}
    >
      <Image
        source={{ uri: picked.pngUrl }}
        style={{
          width: picked.sheetW * scale,
          height: picked.sheetH * scale,
          marginLeft: -frame.x * scale,
          marginTop: -frame.y * scale,
        }}
        resizeMode="stretch"
      />
    </View>
  );

  if (!frame.rotated) {
    return <View style={style}>{crop}</View>;
  }

  return (
    <View
      style={[
        { width: dispW * scale, height: dispH * scale, alignItems: 'center', justifyContent: 'center' },
        style,
      ]}
    >
      <View style={{ transform: [{ rotate: '-90deg' }] }}>{crop}</View>
    </View>
  );
}
