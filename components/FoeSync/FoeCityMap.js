// components/FoeSync/FoeCityMap.js
//
// Мапа міста з city_map: сітка розблокованих ділянок + будівлі.
// Якщо передано `defs` — малюємо справжні прямокутники width×length,
// інакше кожна будівля 1×1. Тап по будівлі -> деталі знизу.

import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

// колір за типом (з визначення) або за grubою категорією з city_map
const TYPE_COLOR = {
  street: '#2f3947',
  greatbuilding: '#f0c14b',
  military: '#ef5350',
  main_building: '#66bb6a',
  residential: '#42a5f5',
  production: '#26a69a',
  goods: '#26a69a',
  culture: '#ab47bc',
  decoration: '#8d6e63',
  tower: '#ec407a',
  outpost_ship: '#78909c',
  friends_tavern: '#ab47bc',
  generic_building: '#5c6bc0',
  bonus_building: '#ffa726',
};
const colorFor = (t) => TYPE_COLOR[t] || '#90a4ae';

const LEGEND = [
  ['residential', 'житлові'],
  ['production', 'виробничі'],
  ['goods', 'товари'],
  ['culture', 'культура'],
  ['military', 'військові'],
  ['greatbuilding', 'ВС'],
  ['decoration', 'декор'],
  ['street', 'дороги'],
];

export default function FoeCityMap({ cityMap, defs }) {
  const [sel, setSel] = useState(null);

  const model = useMemo(() => {
    const areas = cityMap?.unlocked_areas || [];
    const ents = (cityMap?.entities || []).filter((e) => e.x != null && e.y != null);
    if (!ents.length) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const bump = (x, y, w, h) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    };
    for (const a of areas) bump(a.x, a.y, a.width || 1, a.length || 1);
    for (const e of ents) {
      const d = defs && defs[e.cid];
      bump(e.x, e.y, d?.width || 1, d?.length || 1);
    }
    return { areas, ents, minX, minY, w: maxX - minX, h: maxY - minY };
  }, [cityMap, defs]);

  if (!model) return null;

  // масштаб під розумний розмір: не менше 8 px/клітинку, вписати ширину ~340
  const tile = Math.max(6, Math.min(16, Math.floor(340 / Math.max(model.w, 1))));
  const W = model.w * tile;
  const H = model.h * tile;

  return (
    <View>
      <ScrollView horizontal>
        <ScrollView style={{ maxHeight: 420 }}>
          <Svg width={W} height={H}>
            {model.areas.map((a, i) => (
              <Rect
                key={`a${i}`}
                x={(a.x - model.minX) * tile}
                y={(a.y - model.minY) * tile}
                width={(a.width || 1) * tile}
                height={(a.length || 1) * tile}
                fill="#0c141c"
                stroke="#243140"
                strokeWidth={0.5}
              />
            ))}
            {model.ents.map((e, i) => {
              const d = defs && defs[e.cid];
              const w = (d?.width || 1) * tile;
              const h = (d?.length || 1) * tile;
              return (
                <Rect
                  key={i}
                  x={(e.x - model.minX) * tile + 0.5}
                  y={(e.y - model.minY) * tile + 0.5}
                  width={Math.max(w - 1, 1)}
                  height={Math.max(h - 1, 1)}
                  rx={1.5}
                  fill={colorFor(d?.type || e.type)}
                  opacity={e.conn === 0 ? 0.35 : 1}
                  onPress={() => setSel({ e, d })}
                />
              );
            })}
          </Svg>
        </ScrollView>
      </ScrollView>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
        {LEGEND.map(([t, label]) => (
          <View key={t} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 10, marginBottom: 3 }}>
            <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: colorFor(t), marginRight: 3 }} />
            <Text style={{ color: '#9aa3b2', fontSize: 10 }}>{label}</Text>
          </View>
        ))}
      </View>

      {sel ? (
        <View style={{ marginTop: 6, padding: 8, backgroundColor: '#0c141c', borderRadius: 6 }}>
          <Text style={{ color: '#f4f7fb', fontWeight: '700' }}>{sel.d?.name || sel.e.cid}</Text>
          <Text style={{ color: '#9aa3b2', fontSize: 12 }}>
            {(sel.d?.type || sel.e.type)} · {(sel.d?.width || '?')}×{(sel.d?.length || '?')}
            {sel.d?.era ? ` · ${sel.d.era}` : ''} · поз. {sel.e.x},{sel.e.y}
            {sel.e.lvl != null ? ` · рів. ${sel.e.lvl}` : ''}
            {sel.e.conn === 0 ? ' · БЕЗ ДОРОГИ' : ''}
          </Text>
          {sel.d?.description ? (
            <Text style={{ color: '#c8d0dc', fontSize: 12, marginTop: 4 }}>{sel.d.description}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
