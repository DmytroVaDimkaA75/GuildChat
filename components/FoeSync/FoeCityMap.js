// components/FoeSync/FoeCityMap.js
//
// Проста мапа міста з city_map: сітка розблокованих ділянок + позначки
// будівель за типом. Розміри окремих будівель поки не враховуються
// (кожна — маленький квадрат у своїй клітинці); дороги в FoE 1x1, тож
// дорожня сітка виходить точною.

import React, { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

const TYPE_COLOR = {
  street: '#4b5563',
  greatbuilding: '#e0b64e',
  generic_building: '#4ea1ff',
  military: '#ff5b5b',
  main_building: '#54d18c',
  friends_tavern: '#b06fd0',
  outpost_ship: '#8aa0b4',
  off_grid: '#2b3a4a',
};

export default function FoeCityMap({ cityMap, tile = 7 }) {
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
      maxX = Math.max(maxX, a.x + (a.width || a.length || 1));
      maxY = Math.max(maxY, a.y + (a.length || a.width || 1));
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
    <ScrollView horizontal>
      <ScrollView>
        <View>
          <Svg width={W} height={H}>
            {model.areas.map((a, i) => (
              <Rect
                key={`a${i}`}
                x={(a.x - model.minX) * tile}
                y={(a.y - model.minY) * tile}
                width={(a.width || 1) * tile}
                height={(a.length || 1) * tile}
                fill="#152330"
                stroke="#2b3a4a"
                strokeWidth={0.5}
              />
            ))}
            {model.ents.map((e, i) => (
              <Rect
                key={i}
                x={(e.x - model.minX) * tile + 0.5}
                y={(e.y - model.minY) * tile + 0.5}
                width={tile - 1}
                height={tile - 1}
                rx={1}
                fill={TYPE_COLOR[e.type] || '#7a8899'}
                opacity={e.conn === 0 ? 0.4 : 1}
              />
            ))}
          </Svg>
        </View>
      </ScrollView>
    </ScrollView>
  );
}
