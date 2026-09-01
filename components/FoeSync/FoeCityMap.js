// components/FoeSync/FoeCityMap.js
//
// Мапа міста (city_map). Принцип — як у мапі культурних поселень
// (components/Culture/ObstaclesMap.js): один <Svg viewBox>, сектори по 4×4
// клітинки, сітка <Line>, будівлі <Rect>.
//
// Сектори:
//   • білі  — розблоковані (твоє місто);
//   • жовті — можна купити за ресурси / відкрити технологією;
//   • темні — рамка недоступного краю мапи (просто тло).
//
// Уся мапа повернута на 90° за годинниковою — щоб орієнтація збігалася з
// містом у грі. Будівлі повертаються разом із нею.
//
// У видиме вікно вміщується 24×20 клітинок; решту видно прокруткою.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { ClipPath, Defs, G, Line, Rect } from 'react-native-svg';

const VIEW_COLS = 24;
const VIEW_ROWS = 20;
const SECTOR = 4; // сторона сектора у клітинках
const FRAME_FILL = '#131722';

const TYPE_COLOR = {
  street: '#3a4656',
  greatbuilding: '#ff6f00', // помаранчевий — не плутати з жовтими секторами
  military: '#e53935',
  main_building: '#43a047',
  residential: '#1e88e5',
  production: '#00897b',
  goods: '#00897b',
  culture: '#8e24aa',
  decoration: '#8d6e63',
  tower: '#d81b60',
  outpost_ship: '#607d8b',
  friends_tavern: '#8e24aa',
  generic_building: '#3949ab',
  bonus_building: '#fb8c00',
};
const colorFor = (t) => TYPE_COLOR[t] || '#78909c';

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

    // --- сектори у сітці секторів ---
    const key = (sc, sr) => `${sc},${sr}`;
    const unlockedSet = new Set();
    for (const a of areas) {
      const w = a.width || SECTOR;
      const l = a.length || SECTOR;
      for (let x = a.x; x < a.x + w; x += SECTOR)
        for (let y = a.y; y < a.y + l; y += SECTOR) unlockedSet.add(key(x / SECTOR, y / SECTOR));
    }
    const blockedSet = new Set();
    for (const b of blockedRaw) blockedSet.add(key((b.x || 0) / SECTOR, (b.y || 0) / SECTOR));

    let scMin = Infinity;
    let scMax = -Infinity;
    let srMin = Infinity;
    let srMax = -Infinity;
    for (const s of [...unlockedSet, ...blockedSet]) {
      const [sc, sr] = s.split(',').map(Number);
      scMin = Math.min(scMin, sc);
      scMax = Math.max(scMax, sc);
      srMin = Math.min(srMin, sr);
      srMax = Math.max(srMax, sr);
    }

    const buyable = [];
    const frame = [];
    for (let sc = scMin; sc <= scMax; sc += 1) {
      for (let sr = srMin; sr <= srMax; sr += 1) {
        const k = key(sc, sr);
        if (unlockedSet.has(k)) continue;
        if (blockedSet.has(k)) frame.push({ x: sc * SECTOR, y: sr * SECTOR });
        else buyable.push({ x: sc * SECTOR, y: sr * SECTOR });
      }
    }

    // --- поворот на 90° за годинниковою: (x,y,w,l) -> (H - y - l, x, l, w) ---
    const H = (srMax + 1) * SECTOR;
    const rc = (x, y, w, l) => ({ x: H - y - l, y: x, width: l, length: w });
    const rArea = (a) => rc(a.x, a.y, a.width || SECTOR, a.length || SECTOR);
    const rCell = (c) => rc(c.x, c.y, SECTOR, SECTOR);

    const rAreas = areas.map(rArea);
    const rBuyable = buyable.map(rCell);
    const rFrame = frame.map(rCell);
    const rEnts = allEnts.map((e) => {
      const d = defs && defs[e.cid];
      const w = d?.width || 1;
      const l = d?.length || 1;
      const r = rc(e.x, e.y, w, l);
      return { ...e, rx: r.x, ry: r.y, rw: r.width, rl: r.length };
    });

    // межі малювання = розблоковані + "можна купити"
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
    for (const a of rAreas) bump(a.x, a.y, a.width, a.length);
    for (const b of rBuyable) bump(b.x, b.y, b.width, b.length);

    const ents = rEnts.filter((e) => e.rx >= minX && e.rx < maxX && e.ry >= minY && e.ry < maxY);

    let cityX = Infinity;
    let cityY = Infinity;
    for (const a of rAreas) {
      cityX = Math.min(cityX, a.x);
      cityY = Math.min(cityY, a.y);
    }

    return {
      areas: rAreas,
      buyable: rBuyable,
      frame: rFrame,
      ents,
      minX,
      minY,
      gw: maxX - minX,
      gh: maxY - minY,
      cityX,
      cityY,
      counts: { unlocked: unlockedSet.size, buyable: buyable.length },
    };
  }, [cityMap, defs]);

  if (!model) return null;

  const tile = Math.floor((screenW - 20) / VIEW_COLS);
  const viewW = tile * VIEW_COLS;
  const viewH = tile * VIEW_ROWS;
  const contentW = model.gw * tile;
  const contentH = model.gh * tile;

  const findAt = (tx, ty) => {
    let best = null;
    for (const e of model.ents) {
      if (tx >= e.rx && tx < e.rx + e.rw && ty >= e.ry && ty < e.ry + e.rl) {
        if (!best || (e.type !== 'street' && best.type === 'street')) best = e;
      }
    }
    return best;
  };

  const onTouch = (ev) => {
    const { locationX, locationY } = ev.nativeEvent;
    const tx = model.minX + Math.floor(locationX / tile);
    const ty = model.minY + Math.floor(locationY / tile);
    const e = findAt(tx, ty);
    setSel(e ? { e, d: defs && defs[e.cid] } : null);
  };

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
                    <Rect key={i} x={a.x} y={a.y} width={a.width} height={a.length} />
                  ))}
                </ClipPath>
              </Defs>

              {/* тло рамки */}
              <Rect
                x={model.minX}
                y={model.minY}
                width={model.gw}
                height={model.gh}
                fill={FRAME_FILL}
              />

              {/* сектори "можна купити" — суцільний жовтий */}
              {model.buyable.map((b, i) => (
                <Rect
                  key={`buy${i}`}
                  x={b.x}
                  y={b.y}
                  width={b.width}
                  height={b.length}
                  fill="#ffe100"
                />
              ))}

              {/* розблоковані сектори — суцільний білий */}
              {model.areas.map((a, i) => (
                <Rect
                  key={`a${i}`}
                  x={a.x}
                  y={a.y}
                  width={a.width}
                  height={a.length}
                  fill="#ffffff"
                />
              ))}

              {/* сітка клітинок — по всій мапі */}
              {Array.from({ length: model.gw + 1 }).map((_, i) => (
                <Line
                  key={`v${i}`}
                  x1={model.minX + i}
                  y1={model.minY}
                  x2={model.minX + i}
                  y2={model.minY + model.gh}
                  stroke="#7a7a7a"
                  strokeWidth={0.05}
                />
              ))}
              {Array.from({ length: model.gh + 1 }).map((_, i) => (
                <Line
                  key={`h${i}`}
                  x1={model.minX}
                  y1={model.minY + i}
                  x2={model.minX + model.gw}
                  y2={model.minY + i}
                  stroke="#7a7a7a"
                  strokeWidth={0.05}
                />
              ))}

              {/* рамка поверх сітки — ховає сітку поза мапою */}
              {model.frame.map((f, i) => (
                <Rect
                  key={`f${i}`}
                  x={f.x}
                  y={f.y}
                  width={f.width}
                  height={f.length}
                  fill={FRAME_FILL}
                />
              ))}

              {/* жирна межа розблокованого міста */}
              {model.areas.map((a, i) => (
                <Rect
                  key={`ab${i}`}
                  x={a.x}
                  y={a.y}
                  width={a.width}
                  height={a.length}
                  fill="none"
                  stroke="#111111"
                  strokeWidth={0.16}
                />
              ))}

              {/* будівлі — суцільні кольорові прямокутники поверх білого */}
              <G clipPath="url(#cityClip)">
                {model.ents.map((e, i) => {
                  const d = defs && defs[e.cid];
                  const isSel = sel && sel.e === e;
                  return (
                    <Rect
                      key={i}
                      x={e.rx + 0.04}
                      y={e.ry + 0.04}
                      width={Math.max(e.rw - 0.08, 0.1)}
                      height={Math.max(e.rl - 0.08, 0.1)}
                      fill={colorFor(d?.type || e.type)}
                      opacity={e.conn === 0 ? 0.4 : 1}
                      stroke={isSel ? '#ff1744' : 'rgba(0,0,0,0.35)'}
                      strokeWidth={isSel ? 0.2 : 0.03}
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
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.legendBox, { backgroundColor: '#ffffff' }]} />
          <Text style={styles.legendText}>розблоковано ({model.counts.unlocked})</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.legendBox, { backgroundColor: '#ffe100' }]} />
          <Text style={styles.legendText}>можна купити ({model.counts.buyable})</Text>
        </View>
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
  legendBox: { borderWidth: 1, borderColor: '#555' },
  legendText: { color: '#9aa3b2', fontSize: 10 },
  hint: { color: '#9aa3b2', fontSize: 11, marginTop: 6, fontStyle: 'italic' },
  detail: { marginTop: 6, padding: 8, backgroundColor: '#0c141c', borderRadius: 6 },
  detailName: { color: '#f4f7fb', fontWeight: '700' },
  detailMeta: { color: '#9aa3b2', fontSize: 12, marginTop: 2 },
  detailDesc: { color: '#c8d0dc', fontSize: 12, marginTop: 4 },
});
