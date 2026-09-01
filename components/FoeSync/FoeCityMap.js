// components/FoeSync/FoeCityMap.js
//
// Мапа міста (city_map). Принцип — як у мапі культурних поселень
// (components/Culture/ObstaclesMap.js): один <Svg viewBox>, обрізка по
// розблокованих ділянках через <ClipPath>, сітка <Line>, будівлі <Rect>.
//
// У видиме вікно вміщується 24×20 клітинок; решту міста видно прокруткою
// (пальцем у будь-який бік).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { ClipPath, Defs, G, Line, Rect } from 'react-native-svg';

const VIEW_COLS = 24;
const VIEW_ROWS = 20;

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
  ['culture', 'культура'],
  ['military', 'військові'],
  ['greatbuilding', 'ВС'],
  ['street', 'дороги'],
];

export default function FoeCityMap({ cityMap, defs }) {
  const { width: screenW } = useWindowDimensions();
  const [sel, setSel] = useState(null);
  const hScrollRef = useRef(null);
  const vScrollRef = useRef(null);
  const didInitScroll = useRef(false);

  const model = useMemo(() => {
    const areas = cityMap?.unlocked_areas || [];
    const blockedRaw = cityMap?.blocked_areas || [];
    const allEnts = (cityMap?.entities || []).filter((e) => e.x != null && e.y != null);
    if (!areas.length) return null;

    // Заблоковані сектори — 4×4 клітинки, координата може бути відсутня (=0).
    const blocked = blockedRaw.map((b) => ({
      x: b.x || 0,
      y: b.y || 0,
      width: b.width || 4,
      length: b.length || 4,
    }));

    // Межі мапи = розблоковані + заблоковані сектори. off_grid не враховуємо.
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
    for (const b of blocked) bump(b.x, b.y, b.width, b.length);

    // Кут розблокованої зони — щоб одразу прокрутити вікно на місто.
    let cityX = Infinity;
    let cityY = Infinity;
    for (const a of areas) {
      cityX = Math.min(cityX, a.x);
      cityY = Math.min(cityY, a.y);
    }

    // Обʼєкти лише в межах міста (off_grid / поселення відкидаємо).
    const ents = allEnts.filter(
      (e) => e.x >= minX && e.x < maxX && e.y >= minY && e.y < maxY
    );
    return {
      areas,
      blocked,
      ents,
      minX,
      minY,
      gw: maxX - minX,
      gh: maxY - minY,
      cityX,
      cityY,
    };
  }, [cityMap]);

  if (!model) return null;

  // px на клітинку — щоб рівно 24 клітинки влізло по ширині
  const tile = Math.floor((screenW - 20) / VIEW_COLS);
  const viewW = tile * VIEW_COLS;
  const viewH = tile * VIEW_ROWS;
  const contentW = model.gw * tile;
  const contentH = model.gh * tile;

  const findAt = (tx, ty) => {
    let best = null;
    for (const e of model.ents) {
      const d = defs && defs[e.cid];
      const w = d?.width || 1;
      const l = d?.length || 1;
      if (tx >= e.x && tx < e.x + w && ty >= e.y && ty < e.y + l) {
        if (!best || (e.type !== 'street' && best.e.type === 'street')) best = { e, d };
      }
    }
    return best;
  };

  const onTouch = (ev) => {
    const { locationX, locationY } = ev.nativeEvent;
    const tx = model.minX + Math.floor(locationX / tile);
    const ty = model.minY + Math.floor(locationY / tile);
    setSel(findAt(tx, ty));
  };

  // Одразу прокрутити вікно на розблоковане місто (а не на кут із локнутими секторами).
  const cityOffX = Math.max(0, (model.cityX - model.minX - 1) * tile);
  const cityOffY = Math.max(0, (model.cityY - model.minY - 1) * tile);
  useEffect(() => {
    if (didInitScroll.current) return;
    const t = setTimeout(() => {
      hScrollRef.current?.scrollTo?.({ x: cityOffX, animated: false });
      vScrollRef.current?.scrollTo?.({ y: cityOffY, animated: false });
      didInitScroll.current = true;
    }, 60);
    return () => clearTimeout(t);
  }, [cityOffX, cityOffY]);

  return (
    <View>
      <ScrollView
        ref={hScrollRef}
        horizontal
        style={{ width: viewW, height: viewH, alignSelf: 'center' }}
        showsHorizontalScrollIndicator
        contentOffset={{ x: cityOffX, y: 0 }}
      >
        <ScrollView
          ref={vScrollRef}
          style={{ height: viewH }}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          contentOffset={{ x: 0, y: cityOffY }}
        >
          <View style={{ width: contentW, height: contentH }}>
            <Svg
              width={contentW}
              height={contentH}
              viewBox={`${model.minX} ${model.minY} ${model.gw} ${model.gh}`}
            >
              <Defs>
                <ClipPath id="cityClip">
                  {model.areas.map((a, i) => (
                    <Rect key={i} x={a.x} y={a.y} width={a.width || 1} height={a.length || 1} />
                  ))}
                </ClipPath>
              </Defs>

              {model.blocked.map((b, i) => (
                <Rect
                  key={`b${i}`}
                  x={b.x}
                  y={b.y}
                  width={b.width}
                  height={b.length}
                  fill="#141821"
                  stroke="#0b0e14"
                  strokeWidth={0.12}
                />
              ))}

              {model.areas.map((a, i) => (
                <Rect
                  key={`a${i}`}
                  x={a.x}
                  y={a.y}
                  width={a.width || 1}
                  height={a.length || 1}
                  fill="#0c141c"
                  stroke="#2b3a4d"
                  strokeWidth={0.1}
                />
              ))}

              <G clipPath="url(#cityClip)">
                {Array.from({ length: model.gw + 1 }).map((_, i) => (
                  <Line
                    key={`v${i}`}
                    x1={model.minX + i}
                    y1={model.minY}
                    x2={model.minX + i}
                    y2={model.minY + model.gh}
                    stroke="#1a2430"
                    strokeWidth={0.04}
                  />
                ))}
                {Array.from({ length: model.gh + 1 }).map((_, i) => (
                  <Line
                    key={`h${i}`}
                    x1={model.minX}
                    y1={model.minY + i}
                    x2={model.minX + model.gw}
                    y2={model.minY + i}
                    stroke="#1a2430"
                    strokeWidth={0.04}
                  />
                ))}

                {model.ents.map((e, i) => {
                  const d = defs && defs[e.cid];
                  const isSel = sel && sel.e === e;
                  return (
                    <Rect
                      key={i}
                      x={e.x + 0.06}
                      y={e.y + 0.06}
                      width={Math.max((d?.width || 1) - 0.12, 0.1)}
                      height={Math.max((d?.length || 1) - 0.12, 0.1)}
                      rx={0.15}
                      fill={colorFor(d?.type || e.type)}
                      opacity={e.conn === 0 ? 0.35 : 1}
                      stroke={isSel ? '#ffffff' : 'none'}
                      strokeWidth={isSel ? 0.18 : 0}
                    />
                  );
                })}
              </G>
            </Svg>

            <Pressable style={StyleSheet.absoluteFill} onPress={onTouch} />
          </View>
        </ScrollView>
      </ScrollView>

      <View style={styles.legend}>
        {LEGEND.map(([t, label]) => (
          <View key={t} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colorFor(t) }]} />
            <Text style={styles.legendText}>{label}</Text>
          </View>
        ))}
      </View>

      {sel ? (
        <View style={styles.detail}>
          <Text style={styles.detailName}>{sel.d?.name || sel.e.cid}</Text>
          <Text style={styles.detailMeta}>
            {(sel.d?.type || sel.e.type)} · {(sel.d?.width || '?')}×{(sel.d?.length || '?')}
            {sel.d?.era ? ` · ${sel.d.era}` : ''} · поз. {sel.e.x},{sel.e.y}
            {sel.e.lvl != null ? ` · рів. ${sel.e.lvl}` : ''}
            {sel.e.conn === 0 ? ' · БЕЗ ДОРОГИ' : ''}
          </Text>
          {sel.d?.description ? <Text style={styles.detailDesc}>{sel.d.description}</Text> : null}
        </View>
      ) : (
        <Text style={styles.hint}>Мапу можна рухати пальцем. Торкніться будівлі — деталі.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: 10, marginBottom: 3 },
  legendDot: { width: 9, height: 9, borderRadius: 2, marginRight: 3 },
  legendText: { color: '#9aa3b2', fontSize: 10 },
  hint: { color: '#9aa3b2', fontSize: 11, marginTop: 6, fontStyle: 'italic' },
  detail: { marginTop: 6, padding: 8, backgroundColor: '#0c141c', borderRadius: 6 },
  detailName: { color: '#f4f7fb', fontWeight: '700' },
  detailMeta: { color: '#9aa3b2', fontSize: 12, marginTop: 2 },
  detailDesc: { color: '#c8d0dc', fontSize: 12, marginTop: 4 },
});
