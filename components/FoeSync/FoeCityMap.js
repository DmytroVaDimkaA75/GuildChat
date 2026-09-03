// Мапа міста з city_map. Список інстансів приходить із StartupService,
// а локалізовані назви, footprint і бонуси потрібної епохи — з каталогу
// building_entity. Уся мапа повернута на 90° за годинниковою, як у грі.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { ClipPath, Defs, G, Line, Rect } from 'react-native-svg';

import { DarkThemeColors } from '../../constants/theme';
import { eraLabel } from './foeGoods';

const VIEW_COLS = 24;
const VIEW_ROWS = 20;
const SECTOR = 4;
const FRAME_FILL = '#131722';
const RULER_W = 26; // ширина лівої координатної лінійки
const RULER_H = 16; // висота верхньої координатної лінійки
const MIN_TILE = 6;
const MIN_TILE_WITH_LEGEND = 4;
const SCREEN_HEIGHT_RESERVE = 286;
const SCREEN_HEIGHT_RESERVE_WITH_LEGEND = 354;

const TYPE_COLOR = {
  street: '#3a4656',
  greatbuilding: '#ff6f00',
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

const TYPE_LABELS = {
  street: 'дорога',
  greatbuilding: 'Велична споруда',
  military: 'військова',
  main_building: 'ратуша',
  residential: 'житлова',
  production: 'виробнича',
  goods: 'товарна',
  culture: 'культурна',
  decoration: 'декорація',
  tower: 'вежа',
  generic_building: 'будівля',
  bonus_building: 'бонусна',
  unknown: 'тип уточнюється',
};

const BONUS_LABELS = {
  att_boost_attacker: 'атака атакуючої армії',
  def_boost_attacker: 'захист атакуючої армії',
  att_boost_defender: 'атака оборонної армії',
  def_boost_defender: 'захист оборонної армії',
  att_def_boost_attacker: 'атака й захист атакуючої армії',
  att_def_boost_defender: 'атака й захист оборонної армії',
  att_def_boost_attacker_defender: 'атака й захист усіх армій',
  coin_production: 'виробництво монет',
  supply_production: 'виробництво припасів',
  goods_production: 'виробництво товарів',
  forge_points_production: 'виробництво стратегічних очок',
  military_boost: 'атака й захист атакуючої армії',
  fierce_resistance: 'атака й захист оборонної армії',
  advanced_tactics: 'атака й захист усіх армій',
};

const FEATURE_LABELS = {
  all: null,
  battleground: 'Поле битви гільдій',
  guild_battleground: 'Поле битви гільдій',
  guild_expedition: 'Експедиція гільдії',
  quantum_incursions: 'Квантові вторгнення',
  guild_raids: 'Квантові вторгнення',
};

const LEGEND = [
  ['residential', 'житлові'],
  ['production', 'виробничі'],
  ['culture', 'культура'],
  ['military', 'військові'],
  ['greatbuilding', 'ВС'],
  ['street', 'дороги'],
];

const colorFor = (type) => TYPE_COLOR[type] || '#78909c';
const positive = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};
const bonusLabel = (type) => BONUS_LABELS[type] || String(type || '').replace(/_/g, ' ');

function formatBonus(bonus) {
  const value = Number(bonus?.value);
  if (!Number.isFinite(value)) return null;
  const type = String(bonus?.type || '');
  const unit = /(^att_|^def_|_boost|_production$)/.test(type) ? '%' : '';
  const featureKey = String(bonus?.targetedFeature || 'all');
  const feature = featureKey === 'all'
    ? null
    : FEATURE_LABELS[featureKey] || featureKey.replace(/_/g, ' ');
  const motivated = bonus?.onlyWhenMotivated ? ' · за мотивації' : '';
  return `${value > 0 ? '+' : ''}${value}${unit} ${bonusLabel(type)}${
    feature ? ` · ${feature}` : ''
  }${motivated}`;
}

export default function FoeCityMap({
  cityMap,
  defs,
  buildings,
  collect,
  highlightIds,
  focusId,
  horizontalInset = 46,
}) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [selectedId, setSelectedId] = useState(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);

  const highlightSet = useMemo(
    () => new Set((Array.isArray(highlightIds) ? highlightIds : []).map(String)),
    [highlightIds]
  );

  const model = useMemo(() => {
    const areas = Array.isArray(cityMap?.unlocked_areas)
      ? cityMap.unlocked_areas
      : Object.values(cityMap?.unlocked_areas || {});
    const blockedRaw = Array.isArray(cityMap?.blocked_areas)
      ? cityMap.blocked_areas
      : Object.values(cityMap?.blocked_areas || {});
    const sourceEntities = Array.isArray(buildings) && buildings.length
      ? buildings
      : cityMap?.entities || [];
    const allEntities = sourceEntities.filter(
      (entity) => Number.isFinite(Number(entity?.x)) && Number.isFinite(Number(entity?.y))
    );
    if (!areas.length) return null;

    const sectorKey = (column, row) => `${column},${row}`;
    const unlockedSet = new Set();
    for (const area of areas) {
      const x = Number(area?.x);
      const y = Number(area?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const width = positive(area.width) || SECTOR;
      const length = positive(area.length) || SECTOR;
      for (let tileX = x; tileX < x + width; tileX += SECTOR) {
        for (let tileY = y; tileY < y + length; tileY += SECTOR) {
          unlockedSet.add(sectorKey(tileX / SECTOR, tileY / SECTOR));
        }
      }
    }

    const blockedSet = new Set();
    for (const blocked of blockedRaw) {
      const x = Number(blocked?.x);
      const y = Number(blocked?.y);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        blockedSet.add(sectorKey(x / SECTOR, y / SECTOR));
      }
    }
    if (!unlockedSet.size) return null;

    let sectorColumnMin = Infinity;
    let sectorColumnMax = -Infinity;
    let sectorRowMin = Infinity;
    let sectorRowMax = -Infinity;
    for (const sector of [...unlockedSet, ...blockedSet]) {
      const [column, row] = sector.split(',').map(Number);
      sectorColumnMin = Math.min(sectorColumnMin, column);
      sectorColumnMax = Math.max(sectorColumnMax, column);
      sectorRowMin = Math.min(sectorRowMin, row);
      sectorRowMax = Math.max(sectorRowMax, row);
    }

    const buyable = [];
    const frame = [];
    for (let column = sectorColumnMin; column <= sectorColumnMax; column += 1) {
      for (let row = sectorRowMin; row <= sectorRowMax; row += 1) {
        const key = sectorKey(column, row);
        if (unlockedSet.has(key)) continue;
        const cell = { x: column * SECTOR, y: row * SECTOR };
        if (blockedSet.has(key)) frame.push(cell);
        else buyable.push(cell);
      }
    }

    // 90° CW: (x,y,w,l) -> (H-y-l,x,l,w)
    const sourceHeight = (sectorRowMax + 1) * SECTOR;
    const rotate = (x, y, width, length) => ({
      x: sourceHeight - y - length,
      y: x,
      width: length,
      length: width,
    });
    const rotatedAreas = areas
      .map((area) => rotate(
        Number(area?.x),
        Number(area?.y),
        positive(area?.width) || SECTOR,
        positive(area?.length) || SECTOR
      ))
      .filter((area) => Number.isFinite(area.x) && Number.isFinite(area.y));
    const rotatedBuyable = buyable.map((cell) => rotate(cell.x, cell.y, SECTOR, SECTOR));
    const rotatedFrame = frame.map((cell) => rotate(cell.x, cell.y, SECTOR, SECTOR));
    const rotatedEntities = allEntities.map((entity, index) => {
      const definition =
        entity?.definition || defs?.[entity?.definitionKey] || defs?.[entity?.cid];
      const sourceWidth = positive(entity?.footprint?.width) || positive(definition?.width);
      const sourceLength = positive(entity?.footprint?.length) || positive(definition?.length);
      const width = sourceWidth || 1;
      const length = sourceLength || 1;
      const rotated = rotate(Number(entity.x), Number(entity.y), width, length);
      return {
        ...entity,
        mapId: String(
          entity?.instanceId ??
          entity?.id ??
          `${entity?.cid || 'unknown'}:${entity?.x}:${entity?.y}:${index}`
        ),
        definition,
        sourceWidth,
        sourceLength,
        rx: rotated.x,
        ry: rotated.y,
        rw: rotated.width,
        rl: rotated.length,
      };
    });

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const includeBounds = (x, y, width, height) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + width);
      maxY = Math.max(maxY, y + height);
    };
    rotatedAreas.forEach((area) => includeBounds(area.x, area.y, area.width, area.length));
    rotatedBuyable.forEach((area) => includeBounds(area.x, area.y, area.width, area.length));
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;

    const visibleEntities = rotatedEntities.filter(
      (entity) =>
        entity.rx + entity.rw > minX &&
        entity.rx < maxX &&
        entity.ry + entity.rl > minY &&
        entity.ry < maxY
    );
    let cityX = Infinity;
    let cityY = Infinity;
    rotatedAreas.forEach((area) => {
      cityX = Math.min(cityX, area.x);
      cityY = Math.min(cityY, area.y);
    });

    return {
      areas: rotatedAreas,
      buyable: rotatedBuyable,
      frame: rotatedFrame,
      entities: visibleEntities,
      minX,
      minY,
      width: maxX - minX,
      height: maxY - minY,
      cityX,
      cityY,
      counts: {
        unlocked: unlockedSet.size,
        buyable: buyable.length,
        buildings: visibleEntities.length,
        resolvedSizes: visibleEntities.filter(
          (entity) => entity.sourceWidth && entity.sourceLength
        ).length,
      },
    };
  }, [buildings, cityMap, defs]);

  const widthTile = Math.floor(
    Math.max(VIEW_COLS * 2, screenWidth - horizontalInset - RULER_W) / VIEW_COLS
  );
  // Лишаємо місце заголовку навігації, chrome мапи та нижній панелі даних.
  const heightTile = Math.floor(
    Math.max(
      VIEW_ROWS * (legendOpen ? MIN_TILE_WITH_LEGEND : MIN_TILE),
      screenHeight - (legendOpen ? SCREEN_HEIGHT_RESERVE_WITH_LEGEND : SCREEN_HEIGHT_RESERVE)
    ) / VIEW_ROWS
  );
  const tile = Math.max(2, Math.min(widthTile, heightTile));
  const viewportWidth = tile * VIEW_COLS;
  const viewportHeight = tile * VIEW_ROWS;
  const contentWidth = (model?.width || 0) * tile;
  const contentHeight = (model?.height || 0) * tile;
  const cityOffsetX = model
    ? Math.max(0, (model.cityX - model.minX - 1) * tile)
    : 0;
  const cityOffsetY = model
    ? Math.max(0, (model.cityY - model.minY - 1) * tile)
    : 0;
  const canScroll = !!model;

  // Межі вільного перетягування мапи (translate у [minT, 0]).
  const minTx = Math.min(0, viewportWidth - contentWidth);
  const minTy = Math.min(0, viewportHeight - contentHeight);

  const panTo = useCallback(
    (targetX, targetY, animated = true) => {
      const nx = Math.min(Math.max(-targetX, minTx), 0);
      const ny = Math.min(Math.max(-targetY, minTy), 0);
      tx.value = animated ? withTiming(nx, { duration: 300 }) : nx;
      ty.value = animated ? withTiming(ny, { duration: 300 }) : ny;
    },
    [minTx, minTy, tx, ty]
  );

  const contentAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
  }));
  const topRulerAnimStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));
  const leftRulerAnimStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));

  // Зміна фільтра (набору підсвічених споруд) знімає окреме підсвічування
  // будівлі, обраної тапом по рядку/мапі.
  const highlightSig = Array.isArray(highlightIds) ? highlightIds.join(',') : '';
  useEffect(() => {
    setSelectedId(null);
    setPopupOpen(false);
  }, [highlightSig]);

  useEffect(() => {
    setSelectedId(null);
    setPopupOpen(false);
    if (!canScroll) return undefined;
    const timer = setTimeout(() => panTo(cityOffsetX, cityOffsetY, false), 60);
    return () => clearTimeout(timer);
  }, [canScroll, cityMap, cityOffsetX, cityOffsetY, panTo]);

  // Якщо жодна з відфільтрованих споруд не в полі зору — центрувати мапу
  // на першій зі списку (порядок = порядок рядків таблиці).
  useEffect(() => {
    if (!model || !Array.isArray(highlightIds) || highlightIds.length === 0) return undefined;
    const order = new Map(highlightIds.map((id, i) => [String(id), i]));
    const idxOf = (e) =>
      Math.min(
        order.has(String(e.id)) ? order.get(String(e.id)) : Infinity,
        order.has(String(e.instanceId)) ? order.get(String(e.instanceId)) : Infinity,
        order.has(String(e.entityId)) ? order.get(String(e.entityId)) : Infinity
      );
    const matches = model.entities
      .filter((e) => Number.isFinite(idxOf(e)))
      .sort((a, b) => idxOf(a) - idxOf(b));
    if (!matches.length) return undefined;

    const vx0 = model.minX + -tx.value / tile;
    const vy0 = model.minY + -ty.value / tile;
    const vx1 = vx0 + VIEW_COLS;
    const vy1 = vy0 + VIEW_ROWS;
    const anyVisible = matches.some(
      (e) => e.rx + e.rw > vx0 && e.rx < vx1 && e.ry + e.rl > vy0 && e.ry < vy1
    );
    if (anyVisible) return undefined;

    const first = matches[0];
    const timer = setTimeout(
      () =>
        panTo(
          (first.rx + first.rw / 2 - model.minX) * tile - viewportWidth / 2,
          (first.ry + first.rl / 2 - model.minY) * tile - viewportHeight / 2
        ),
      40
    );
    return () => clearTimeout(timer);
  }, [highlightIds, model, tile, viewportWidth, viewportHeight, panTo, tx, ty]);

  // Тап по рядку у відфільтрованому списку — підсвітити цю споруду й
  // прокрутити мапу до неї (попап не відкриваємо).
  useEffect(() => {
    const raw = focusId && typeof focusId === 'object' ? focusId.id : focusId;
    if (!model || !raw) return;
    const fid = String(raw);
    const ent = model.entities.find(
      (e) =>
        String(e.id) === fid || String(e.instanceId) === fid || String(e.entityId) === fid
    );
    if (!ent) return;
    setSelectedId(ent.mapId);
    setPopupOpen(false);
    const timer = setTimeout(
      () =>
        panTo(
          (ent.rx + ent.rw / 2 - model.minX) * tile - viewportWidth / 2,
          (ent.ry + ent.rl / 2 - model.minY) * tile - viewportHeight / 2
        ),
      40
    );
    return () => clearTimeout(timer);
  }, [focusId, model, tile, viewportWidth, viewportHeight, panTo]);

  const selectedEntity = selectedId
    ? model?.entities.find((entity) => entity.mapId === selectedId) || null
    : null;

  // viewportX/Y — координати дотику всередині вікна мапи (без урахування панорами)
  const handleTapAt = useCallback(
    (viewportX, viewportY) => {
      if (!model) return;
      const contentX = viewportX - tx.value;
      const contentY = viewportY - ty.value;
      const tileX = model.minX + Math.floor(contentX / tile);
      const tileY = model.minY + Math.floor(contentY / tile);
      let hit = null;
      for (const entity of model.entities) {
        if (
          tileX >= entity.rx &&
          tileX < entity.rx + entity.rw &&
          tileY >= entity.ry &&
          tileY < entity.ry + entity.rl
        ) {
          const eType = entity.definition?.type || entity.type;
          const hType = hit?.definition?.type || hit?.type;
          if (!hit || (eType !== 'street' && hType === 'street')) hit = entity;
        }
      }
      if (hit) {
        setSelectedId(hit.mapId);
        setPopupOpen(true);
      } else {
        setSelectedId(null);
        setPopupOpen(false);
      }
    },
    [model, tile, tx, ty]
  );

  const mapGesture = useMemo(() => {
    const pan = Gesture.Pan()
      .minDistance(4)
      .onStart(() => {
        panStartX.value = tx.value;
        panStartY.value = ty.value;
      })
      .onUpdate((e) => {
        tx.value = Math.min(Math.max(panStartX.value + e.translationX, minTx), 0);
        ty.value = Math.min(Math.max(panStartY.value + e.translationY, minTy), 0);
      });
    const tap = Gesture.Tap()
      .maxDistance(10)
      .onEnd((e) => {
        runOnJS(handleTapAt)(e.x, e.y);
      });
    return Gesture.Race(pan, tap);
  }, [minTx, minTy, tx, ty, panStartX, panStartY, handleTapAt]);

  if (!model) {
    return <Text style={styles.hint}>Мапа міста ще не містить відкритих секторів.</Text>;
  }

  const selectedDefinition =
    selectedEntity?.definition ||
    defs?.[selectedEntity?.definitionKey] ||
    defs?.[selectedEntity?.cid];
  const selectedBonuses = Array.isArray(selectedEntity?.bonuses)
    ? selectedEntity.bonuses
    : selectedDefinition?.bonuses || [];
  const shownBonuses = selectedBonuses.map(formatBonus).filter(Boolean).slice(0, 6);
  const selectedEra = selectedEntity?.era || selectedDefinition?.era;
  const selectedType = selectedDefinition?.type || selectedEntity?.type || 'unknown';
  const selectedCollect = selectedEntity
    ? collect?.[String(selectedEntity.id)] ||
      collect?.[selectedEntity.instanceId] ||
      collect?.[selectedEntity.entityId] ||
      collect?.[selectedEntity.cid] ||
      null
    : null;
  const collectRows = (selectedCollect?.rows || []).filter((row) => !row.header && row.value);

  const sectorsX = Math.ceil(model.width / SECTOR);
  const sectorsY = Math.ceil(model.height / SECTOR);
  const isGB = /greatbuilding/i.test(selectedType);
  const hasFilter = highlightSet.size > 0;

  return (
    <View style={styles.mapRoot}>
      {/* верхня координатна лінійка */}
      <View style={{ flexDirection: 'row', alignSelf: 'center' }}>
        <View style={{ width: RULER_W, height: RULER_H }} />
        <View style={{ width: viewportWidth, height: RULER_H, overflow: 'hidden' }}>
          <Animated.View
            style={[{ width: contentWidth, height: RULER_H }, topRulerAnimStyle]}
          >
            {Array.from({ length: sectorsX }).map((_, s) =>
              s === 0 ? null : (
                <Text
                  key={`rx-${s}`}
                  numberOfLines={1}
                  style={[styles.rulerText, styles.rulerTop, { width: s * SECTOR * tile }]}
                >
                  {model.minX + s * SECTOR}
                </Text>
              )
            )}
          </Animated.View>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignSelf: 'center' }}>
        {/* ліва координатна лінійка */}
        <View style={{ width: RULER_W, height: viewportHeight, overflow: 'hidden' }}>
          <Animated.View
            style={[{ width: RULER_W, height: contentHeight }, leftRulerAnimStyle]}
          >
            {Array.from({ length: sectorsY }).map((_, s) =>
              s === 0 ? null : (
                <View key={`ry-${s}`} style={[styles.rulerLeft, { height: s * SECTOR * tile }]}>
                  <Text style={styles.rulerText} numberOfLines={1}>
                    {model.minY + s * SECTOR}
                  </Text>
                </View>
              )
            )}
          </Animated.View>
        </View>

        <GestureDetector gesture={mapGesture}>
          <View style={{ width: viewportWidth, height: viewportHeight, overflow: 'hidden' }}>
          <Animated.View
            style={[{ width: contentWidth, height: contentHeight }, contentAnimStyle]}
          >
            <Svg
              width={contentWidth}
              height={contentHeight}
              viewBox={`${model.minX} ${model.minY} ${model.width} ${model.height}`}
            >
              <Defs>
                <ClipPath id="cityClip">
                  {model.areas.map((area, index) => (
                    <Rect
                      key={`clip-${index}`}
                      x={area.x}
                      y={area.y}
                      width={area.width}
                      height={area.length}
                    />
                  ))}
                </ClipPath>
              </Defs>

              <Rect
                x={model.minX}
                y={model.minY}
                width={model.width}
                height={model.height}
                fill={FRAME_FILL}
              />

              {model.buyable.map((area, index) => (
                <Rect
                  key={`buyable-${index}`}
                  x={area.x}
                  y={area.y}
                  width={area.width}
                  height={area.length}
                  fill="#ffe100"
                />
              ))}

              {model.areas.map((area, index) => (
                <Rect
                  key={`area-${index}`}
                  x={area.x}
                  y={area.y}
                  width={area.width}
                  height={area.length}
                  fill="#ffffff"
                />
              ))}

              {Array.from({ length: Math.ceil(model.width) + 1 }).map((_, index) => (
                <Line
                  key={`vertical-${index}`}
                  x1={model.minX + index}
                  y1={model.minY}
                  x2={model.minX + index}
                  y2={model.minY + model.height}
                  stroke="#7a7a7a"
                  strokeWidth={0.05}
                />
              ))}
              {Array.from({ length: Math.ceil(model.height) + 1 }).map((_, index) => (
                <Line
                  key={`horizontal-${index}`}
                  x1={model.minX}
                  y1={model.minY + index}
                  x2={model.minX + model.width}
                  y2={model.minY + index}
                  stroke="#7a7a7a"
                  strokeWidth={0.05}
                />
              ))}

              {model.frame.map((area, index) => (
                <Rect
                  key={`frame-${index}`}
                  x={area.x}
                  y={area.y}
                  width={area.width}
                  height={area.length}
                  fill={FRAME_FILL}
                />
              ))}

              {Array.from({ length: Math.ceil(model.width / SECTOR) + 1 }).map((_, index) => (
                <Line
                  key={`sector-vertical-${index}`}
                  x1={model.minX + index * SECTOR}
                  y1={model.minY}
                  x2={model.minX + index * SECTOR}
                  y2={model.minY + model.height}
                  stroke="#1b1b1b"
                  strokeWidth={0.14}
                />
              ))}
              {Array.from({ length: Math.ceil(model.height / SECTOR) + 1 }).map((_, index) => (
                <Line
                  key={`sector-horizontal-${index}`}
                  x1={model.minX}
                  y1={model.minY + index * SECTOR}
                  x2={model.minX + model.width}
                  y2={model.minY + index * SECTOR}
                  stroke="#1b1b1b"
                  strokeWidth={0.14}
                />
              ))}

              {model.areas.map((area, index) => (
                <Rect
                  key={`border-${index}`}
                  x={area.x}
                  y={area.y}
                  width={area.width}
                  height={area.length}
                  fill="none"
                  stroke="#111111"
                  strokeWidth={0.16}
                />
              ))}

              <G clipPath="url(#cityClip)">
                {model.entities.map((entity) => {
                  const type = entity.definition?.type || entity.type;
                  const selected = selectedId === entity.mapId;
                  const inFilter =
                    hasFilter &&
                    (highlightSet.has(String(entity.id)) ||
                      highlightSet.has(String(entity.instanceId)) ||
                      highlightSet.has(String(entity.entityId)));
                  const dimmed = hasFilter && !inFilter && !selected;
                  return (
                    <Rect
                      key={entity.mapId}
                      x={entity.rx + 0.04}
                      y={entity.ry + 0.04}
                      width={Math.max(entity.rw - 0.08, 0.1)}
                      height={Math.max(entity.rl - 0.08, 0.1)}
                      fill={colorFor(type)}
                      opacity={dimmed ? 0.28 : entity.conn === 0 ? 0.4 : 1}
                      stroke={inFilter ? '#00e5ff' : 'rgba(0,0,0,0.35)'}
                      strokeWidth={inFilter ? 0.16 : 0.03}
                    />
                  );
                })}

                {/* Обрана споруда — окрема яскрава рамка поверх усього */}
                {model.entities
                  .filter((entity) => selectedId === entity.mapId)
                  .map((entity) => (
                    <React.Fragment key={`sel-${entity.mapId}`}>
                      <Rect
                        x={entity.rx - 0.06}
                        y={entity.ry - 0.06}
                        width={entity.rw + 0.12}
                        height={entity.rl + 0.12}
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth={0.34}
                      />
                      <Rect
                        x={entity.rx - 0.06}
                        y={entity.ry - 0.06}
                        width={entity.rw + 0.12}
                        height={entity.rl + 0.12}
                        fill="none"
                        stroke="#ff2d55"
                        strokeWidth={0.16}
                      />
                    </React.Fragment>
                  ))}
              </G>
            </Svg>
          </Animated.View>
          </View>
        </GestureDetector>
      </View>

      <Text style={styles.hint}>Мапу можна рухати пальцем у будь-який бік. Торкніться будівлі — деталі.</Text>

      {/* згортаний блок легенди */}
      <TouchableOpacity
        style={[styles.legendHeader, legendOpen && styles.legendHeaderOpen]}
        onPress={() => setLegendOpen((open) => !open)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: legendOpen }}
      >
        <Text style={styles.legendHeaderText}>Легенда</Text>
        <MaterialIcons
          name={legendOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
          size={22}
          color={DarkThemeColors.textSecondary}
        />
      </TouchableOpacity>
      {legendOpen ? (
        <View style={styles.legendBody}>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.legendBox, { backgroundColor: '#ffffff' }]} />
              <Text style={styles.legendText}>розблоковано ({model.counts.unlocked})</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.legendBox, { backgroundColor: '#ffe100' }]} />
              <Text style={styles.legendText}>можна купити ({model.counts.buyable})</Text>
            </View>
            {LEGEND.map(([type, label]) => (
              <View key={type} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colorFor(type) }]} />
                <Text style={styles.legendText}>{label}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.catalogStatus}>
            Будівель: {model.counts.buildings} · точні розміри: {model.counts.resolvedSizes}/
            {model.counts.buildings}
          </Text>
        </View>
      ) : null}

      {/* попап деталей будівлі — закриття НЕ знімає підсвічування */}
      <Modal
        visible={popupOpen && !!selectedEntity}
        transparent
        animationType="fade"
        onRequestClose={() => setPopupOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setPopupOpen(false)}
          accessible={false}
        >
          <Pressable
            style={styles.popup}
            onPress={() => {}}
            accessible={false}
            accessibilityViewIsModal
          >
            {selectedEntity ? (
              <>
                <View style={styles.popupHeader}>
                  <Text style={styles.detailName} numberOfLines={2}>
                    {selectedEntity.name || selectedDefinition?.name || selectedEntity.cid}
                  </Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Закрити деталі будівлі"
                    style={styles.closeButton}
                    onPress={() => setPopupOpen(false)}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="close" size={24} color={DarkThemeColors.text} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.popupScroll}>
                  {isGB ? (
                    <Text style={styles.detailMeta}>
                      Велична споруда
                      {selectedEntity.lvl != null ? ` · рівень ${selectedEntity.lvl}` : ''}
                    </Text>
                  ) : selectedEra ? (
                    <Text style={styles.detailMeta}>{eraLabel(selectedEra)}</Text>
                  ) : null}

                  {shownBonuses.length ? (
                    <View style={styles.bonusList}>
                      <Text style={styles.bonusTitle}>Бонуси</Text>
                      {shownBonuses.map((bonus, index) => (
                        <Text key={`${bonus}-${index}`} style={styles.bonusText}>• {bonus}</Text>
                      ))}
                      {selectedBonuses.length > shownBonuses.length ? (
                        <Text style={styles.moreBonuses}>
                          Ще бонусів: {selectedBonuses.length - shownBonuses.length}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}

                  {!isGB && selectedDefinition?.description ? (
                    <Text style={styles.detailDescription}>{selectedDefinition.description}</Text>
                  ) : null}

                  {!isGB && selectedCollect ? (
                    <View style={styles.collectBox}>
                      <Text style={styles.collectStatus}>
                        Стан: {selectedCollect.status}
                        {selectedCollect.whenText ? ` · завершення ${selectedCollect.whenText}` : ''}
                      </Text>
                      {collectRows.length ? (
                        <>
                          <Text style={styles.collectTitle}>
                            Збір{selectedCollect.rnd ? ' (випадковий)' : ''}
                          </Text>
                          {collectRows.map((row) => (
                            <Text key={row.key} style={styles.collectRow}>
                              • {row.label}: {Number(row.value).toLocaleString('uk')}
                            </Text>
                          ))}
                        </>
                      ) : null}
                    </View>
                  ) : null}

                  {!isGB && !selectedDefinition?.resolved ? (
                    <Text style={styles.pendingText}>Метадані цієї будівлі ще завантажуються.</Text>
                  ) : null}
                </ScrollView>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  mapRoot: { alignItems: 'stretch' },
  rulerText: { color: DarkThemeColors.textSecondary, fontSize: 10 },
  rulerTop: { position: 'absolute', left: 0, top: 3, textAlign: 'right', paddingRight: 2 },
  rulerLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    paddingRight: 3,
    paddingBottom: 1,
  },
  legendHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
    marginTop: 10,
    paddingHorizontal: 12,
    backgroundColor: DarkThemeColors.surfaceElevated,
    borderWidth: 1,
    borderColor: DarkThemeColors.border,
    borderRadius: 12,
  },
  legendHeaderOpen: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  legendHeaderText: {
    color: DarkThemeColors.text,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  legendBody: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: DarkThemeColors.surfaceElevated,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: DarkThemeColors.border,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: DarkThemeColors.overlay,
    justifyContent: 'center',
    padding: 20,
  },
  popup: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '84%',
    backgroundColor: DarkThemeColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: DarkThemeColors.border,
    padding: 16,
  },
  popupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
    backgroundColor: DarkThemeColors.surfaceElevated,
    borderRadius: 12,
  },
  popupScroll: { flexShrink: 1, maxHeight: 360 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: 10, marginBottom: 3 },
  legendDot: { width: 9, height: 9, borderRadius: 2, marginRight: 3 },
  legendBox: { borderWidth: 1, borderColor: DarkThemeColors.border },
  legendText: { color: DarkThemeColors.textSecondary, fontSize: 11 },
  catalogStatus: { color: DarkThemeColors.textSecondary, fontSize: 11, marginTop: 4 },
  hint: {
    color: DarkThemeColors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    textAlign: 'center',
  },
  detailName: { flex: 1, color: DarkThemeColors.text, fontWeight: '700', fontSize: 20, lineHeight: 25 },
  detailMeta: { color: DarkThemeColors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 5 },
  detailDescription: { color: DarkThemeColors.text, fontSize: 13, lineHeight: 19, marginTop: 12 },
  bonusList: {
    marginTop: 12,
    padding: 12,
    backgroundColor: DarkThemeColors.surfaceElevated,
    borderWidth: 1,
    borderColor: DarkThemeColors.border,
    borderRadius: 12,
  },
  bonusTitle: { color: DarkThemeColors.primarySoft, fontSize: 13, fontWeight: '700', marginBottom: 5 },
  bonusText: { color: DarkThemeColors.text, fontSize: 12, lineHeight: 18 },
  moreBonuses: { color: DarkThemeColors.textSecondary, fontSize: 11, marginTop: 4 },
  collectBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: DarkThemeColors.surfaceElevated,
    borderWidth: 1,
    borderColor: DarkThemeColors.border,
    borderRadius: 12,
  },
  collectStatus: { color: DarkThemeColors.text, fontSize: 12, lineHeight: 18 },
  collectTitle: {
    color: DarkThemeColors.primarySoft,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 3,
  },
  collectRow: { color: DarkThemeColors.text, fontSize: 12, lineHeight: 18 },
  pendingText: {
    color: DarkThemeColors.warning,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
    padding: 10,
    backgroundColor: `${DarkThemeColors.warning}12`,
    borderRadius: 10,
  },
});
