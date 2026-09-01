// components/FoeSync/FoeIcon.js
//
// Показує справжню іконку ресурсу з ігрового спрайт-листа
// (https://foeru.innogamescdn.com/assets/shared/icons/icons_0-*.png).
// Адресу картинки й json-карту координат застосунок дізнається сам
// із вікна гри (foeInterceptor.js, kind: "iconSheet") і кешує локально,
// щоб не чекати на це щоразу.

import React from 'react';
import { Image, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = 'foeIconSheetV1';

// Розбирає компактний формат кадрів: [name, x, y, w, h, offX?, offY?, origW?, origH?, rotated?]
export function parseAtlas(json) {
  const frames = {};
  for (const f of json?.frames || []) {
    const [name, x, y, w, h] = f;
    if (typeof name === 'string' && typeof x === 'number') {
      frames[name] = { x, y, w, h };
    }
  }
  return { frames, sheetW: json?.size?.w || 0, sheetH: json?.size?.h || 0 };
}

export async function loadCachedIconSheet() {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_e) {
    return null;
  }
}

// Завантажує json-карту й повертає { pngUrl, frames, sheetW, sheetH } — і кешує результат.
export async function fetchIconSheet(pngUrl, jsonUrl) {
  const res = await fetch(jsonUrl);
  const json = await res.json();
  const { frames, sheetW, sheetH } = parseAtlas(json);
  const data = { pngUrl, frames, sheetW, sheetH, savedAt: Date.now() };
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (_e) {
    // не критично, просто не закешується
  }
  return data;
}

// <FoeIcon sheet={iconSheet} name="medals" size={20} />
export default function FoeIcon({ sheet, name, size = 20, style }) {
  const frame = sheet?.frames?.[name];
  if (!sheet?.pngUrl || !frame || !sheet.sheetW || !sheet.sheetH) return null;

  const scale = size / Math.max(frame.w, frame.h);
  const dispSheetW = sheet.sheetW * scale;
  const dispSheetH = sheet.sheetH * scale;

  return (
    <View
      style={[
        { width: frame.w * scale, height: frame.h * scale, overflow: 'hidden' },
        style,
      ]}
    >
      <Image
        source={{ uri: sheet.pngUrl }}
        style={{
          width: dispSheetW,
          height: dispSheetH,
          marginLeft: -frame.x * scale,
          marginTop: -frame.y * scale,
        }}
        resizeMode="stretch"
      />
    </View>
  );
}
