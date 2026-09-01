// components/FoeSync/FoeCityMap.js
//
// Мапа міста з city_map: сітка розблокованих ділянок + будівлі.
// Якщо передано `defs` (визначення будівель з розмірами) — малюємо
// справжні прямокутники; інакше кожна будівля — маленький квадрат.

import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

const TYPE_COLOR = {
  street: '#3b4654',
  greatbuilding: '#e0b64e',
  military: '#ff5b5b',
  main_building: '#54d18c',
  residential: '#4ea1ff',
  production: '#48b984',
  goods: '#48b984',
  culture: '#b06fd0',
  decoration: '#7a6f5a',
  friends_tavern: '#b06fd0',
  outpost_ship: '#8aa0b4',
  generic_building: '#4ea1ff',
  off_grid: '#2b3a4a',
};
const colorFor = (t) => TYPE_COLOR[t] || '#7a8899';

export default function FoeCityMap({ cityMap, defs, tile = 7 }) {
  const [sel, setSel] = useState(null);

  const model = useMemo(() => {
    const areas = cityMap?.unlocked_areas || [];
    const ents = cityMap?.entities || [];
    if (!areas.length) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const a of areas) {
      minX = Math.min(minX, a.x);
      minY = Math.min(minY, a.y);
      maxX = Math.max(maxX, a.x + (a.width || 1));
      maxY = Math.max(maxY, a.y + (a.length || 1));
    }
    return {
      areas,
      ents: ents.filter((e) => e.x != null && e.y != null),
      minX,
      minY,
      w: maxX - minX,
      h: maxY - minY,
    };
  }, [cityMap]);

  if (!model) return null;

  const W = model.w * tile;
  const H = model.h * tile;

  return (
    <View>
      <ScrollView horizontal>
        <ScrollView>
          <Svg width={W} height={H}>
            {model.areas.map((a, i) => (
              <Rect
                key={`a${i}`}
                x={(a.x - model.minX) * tile}
                y={(a.y - model.minY) * tile}
                width={(a.width || 1) * tile}
                height={(a.length || 1) * tile}
                fill="#101a24"
                stroke="#2b3a4a"
                strokeWidth={0.5}
              />
            ))}
            {model.ents.map((e, i) => {
              const d = defs && defs[e.cid];
              const w = (d?.width || 1) * tile;
              const h = (d?.length || 1) * tile;
              const t = d?.type || e.type;
              return (
                <Rect
                  key={i}
                  x={(e.x - model.minX) * tile + 0.4}
                  y={(e.y - model.minY) * tile + 0.4}
                  width={Math.max(w - 0.8, 1)}
                  height={Math.max(h - 0.8, 1)}
                  rx={1}
                  fill={colorFor(t)}
                  opacity={e.conn === 0 ? 0.4 : 1}
                  onPress={() => setSel({ e, d })}
                />
              );
            })}
          </Svg>
        </ScrollView>
      </ScrollView>

      {sel ? (
        <View
          style={{
            marginTop: 6,
            padding: 8,
            backgroundColor: '#101a24',
            borderRadius: 6,
          }}
        >
          <Text style={{ color: '#f4f7fb', fontWeight: '700' }}>
            {sel.d?.name || sel.e.cid}
          </Text>
          <Text style={{ color: '#9aa3b2', fontSize: 12 }}>
            {(sel.d?.type || sel.e.type)} · {(sel.d?.width || '?')}×{(sel.d?.length || '?')}
            {sel.d?.era ? ` · ${sel.d.era}` : ''} · поз. {sel.e.x},{sel.e.y}
            {sel.e.lvl != null ? ` · рів. ${sel.e.lvl}` : ''}
          </Text>
          {sel.d?.description ? (
            <Text style={{ color: '#c8d0dc', fontSize: 12, marginTop: 4 }}>
              {sel.d.description}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
