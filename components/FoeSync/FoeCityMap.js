// Мапа міста з city_map. Список інстансів приходить із StartupService,
// а локалізовані назви, footprint і бонуси потрібної епохи — з каталогу
// building_entity. Уся мапа повернута на 90° за годинниковою, як у грі.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { ClipPath, Defs, G, Line, Rect } from 'react-native-svg';

import { DarkThemeColors } from '../../constants/theme';

const VIEW_COLS = 24;
const VIEW_ROWS = 20;
const SECTOR = 4;
const FRAME_FILL = '#131722';

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

const ERA_LABELS = {
  NoAge: 'поза епохою',
  StoneAge: 'Кам’яна доба',
  BronzeAge: 'Бронзова доба',
  IronAge: 'Залізна доба',
  EarlyMiddleAge: 'Раннє Середньовіччя',
  HighMiddleAge: 'Високе Середньовіччя',
  LateMiddleAge: 'Пізнє Середньовіччя',
  ColonialAge: 'Колоніальна доба',
  IndustrialAge: 'Індустріальна доба',
  ProgressiveEra: 'Епоха прогресу',
  ModernEra: 'Епоха модерну',
  PostModernEra: 'Постмодерн',
  ContemporaryEra: 'Новітня епоха',
  TomorrowEra: 'Епоха майбутнього',
  FutureEra: 'Майбутнє',
  ArcticFuture: 'Арктичне майбутнє',
  OceanicFuture: 'Океанічне майбутнє',
  VirtualFuture: 'Віртуальне майбутнє',
  SpaceAgeMars: 'Космічна ера: Марс',
  SpaceAgeAsteroidBelt: 'Космічна ера: Пояс астероїдів',
  SpaceAgeVenus: 'Космічна ера: Венера',
  SpaceAgeJupiterMoon: 'Космічна ера: Супутник Юпітера',
  SpaceAgeTitan: 'Космічна ера: Титан',
  SpaceAgeSpaceHub: 'Космічна ера: Космічний вузол',
  StellarAgeDiscovery: 'Зоряна ера: Відкриття',
  AllAge: 'усі епохи',
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
  forge_points_production: 'виробництво очок Форджа',
  military_boost: 'атака й захист атакуючої армії',
  fierce_resistance: 'атака й захист оборонної армії',
  advanced_tactics: 'атака й захист усіх армій',
};

const FEATURE_LABELS = {
  all: null,
  battleground: 'ПБГ',
  guild_battleground: 'ПБГ',
  guild_expedition: 'Експедиція',
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
const eraLabel = (era) => ERA_LABELS[era] || era;
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

export default function FoeCityMap({ cityMap, defs, buildings, collect }) {
  const { width: screenWidth } = useWindowDimensions();
  const [selectedId, setSelectedId] = useState(null);
  const horizontalScrollRef = useRef(null);
  const verticalScrollRef = useRef(null);

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

  const tile = Math.max(2, Math.floor((screenWidth - 20) / VIEW_COLS));
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

  useEffect(() => {
    setSelectedId(null);
    if (!canScroll) return undefined;
    const timer = setTimeout(() => {
      horizontalScrollRef.current?.scrollTo?.({ x: cityOffsetX, animated: false });
      verticalScrollRef.current?.scrollTo?.({ y: cityOffsetY, animated: false });
    }, 60);
    return () => clearTimeout(timer);
  }, [canScroll, cityMap, cityOffsetX, cityOffsetY]);

  const selectedEntity = selectedId
    ? model?.entities.find((entity) => entity.mapId === selectedId) || null
    : null;

  if (!model) {
    return <Text style={styles.hint}>Мапа міста ще не містить відкритих секторів.</Text>;
  }

  const findAt = (tileX, tileY) => {
    let best = null;
    for (const entity of model.entities) {
      if (
        tileX >= entity.rx &&
        tileX < entity.rx + entity.rw &&
        tileY >= entity.ry &&
        tileY < entity.ry + entity.rl
      ) {
        const entityType = entity.definition?.type || entity.type;
        const bestType = best?.definition?.type || best?.type;
        if (!best || (entityType !== 'street' && bestType === 'street')) best = entity;
      }
    }
    return best;
  };

  const onTouch = (event) => {
    const { locationX, locationY } = event.nativeEvent;
    const tileX = model.minX + Math.floor(locationX / tile);
    const tileY = model.minY + Math.floor(locationY / tile);
    setSelectedId(findAt(tileX, tileY)?.mapId || null);
  };

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

  return (
    <View>
      <ScrollView
        ref={horizontalScrollRef}
        horizontal
        style={{ width: viewportWidth, height: viewportHeight, alignSelf: 'center' }}
        showsHorizontalScrollIndicator
        contentOffset={{ x: cityOffsetX, y: 0 }}
      >
        <ScrollView
          ref={verticalScrollRef}
          style={{ height: viewportHeight }}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          contentOffset={{ x: 0, y: cityOffsetY }}
        >
          <View style={{ width: contentWidth, height: contentHeight }}>
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
                  return (
                    <Rect
                      key={entity.mapId}
                      x={entity.rx + 0.04}
                      y={entity.ry + 0.04}
                      width={Math.max(entity.rw - 0.08, 0.1)}
                      height={Math.max(entity.rl - 0.08, 0.1)}
                      fill={colorFor(type)}
                      opacity={entity.conn === 0 ? 0.4 : 1}
                      stroke={selected ? DarkThemeColors.danger : 'rgba(0,0,0,0.35)'}
                      strokeWidth={selected ? 0.2 : 0.03}
                    />
                  );
                })}
              </G>
            </Svg>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Мапа будівель міста"
              style={StyleSheet.absoluteFill}
              onPress={onTouch}
            />
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

      {selectedEntity ? (
        <View style={styles.detail}>
          <Text style={styles.detailName}>
            {selectedEntity.name || selectedDefinition?.name || selectedEntity.cid}
          </Text>
          <Text style={styles.detailMeta}>
            {TYPE_LABELS[selectedType] || selectedType} ·{' '}
            {selectedEntity.sourceWidth || selectedEntity.footprint?.width || '?'}×
            {selectedEntity.sourceLength || selectedEntity.footprint?.length || '?'}
            {selectedEra ? ` · ${eraLabel(selectedEra)}` : ''} · поз. {selectedEntity.x},
            {selectedEntity.y}
            {selectedEntity.lvl != null ? ` · рів. ${selectedEntity.lvl}` : ''}
            {selectedEntity.conn === 0 ? ' · БЕЗ ДОРОГИ' : ''}
          </Text>
          {shownBonuses.length ? (
            <View style={styles.bonusList}>
              <Text style={styles.bonusTitle}>
                Бонуси{selectedEra ? ` · ${eraLabel(selectedEra)}` : ''}
              </Text>
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
          {selectedDefinition?.description ? (
            <Text style={styles.detailDescription}>{selectedDefinition.description}</Text>
          ) : null}
          {selectedCollect ? (
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
          {!selectedDefinition?.resolved ? (
            <Text style={styles.pendingText}>Метадані цієї будівлі ще завантажуються.</Text>
          ) : null}
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
  legendBox: { borderWidth: 1, borderColor: DarkThemeColors.border },
  legendText: { color: DarkThemeColors.textSecondary, fontSize: 10 },
  catalogStatus: { color: DarkThemeColors.textSecondary, fontSize: 10, marginTop: 2 },
  hint: { color: DarkThemeColors.textSecondary, fontSize: 11, marginTop: 6, fontStyle: 'italic' },
  detail: {
    marginTop: 7,
    padding: 10,
    backgroundColor: DarkThemeColors.background,
    borderWidth: 1,
    borderColor: DarkThemeColors.border,
    borderRadius: 10,
  },
  detailName: { color: DarkThemeColors.text, fontWeight: '700', fontSize: 14 },
  detailMeta: { color: DarkThemeColors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 },
  detailDescription: { color: DarkThemeColors.text, fontSize: 12, lineHeight: 17, marginTop: 6 },
  bonusList: { marginTop: 7, paddingTop: 7, borderTopWidth: 1, borderTopColor: DarkThemeColors.surfaceElevated },
  bonusTitle: { color: DarkThemeColors.primarySoft, fontSize: 11, fontWeight: '700', marginBottom: 3 },
  bonusText: { color: DarkThemeColors.text, fontSize: 11, lineHeight: 16 },
  moreBonuses: { color: DarkThemeColors.textSecondary, fontSize: 10, marginTop: 2 },
  collectBox: {
    marginTop: 7,
    paddingTop: 7,
    borderTopWidth: 1,
    borderTopColor: DarkThemeColors.surfaceElevated,
  },
  collectStatus: { color: DarkThemeColors.text, fontSize: 11, lineHeight: 16 },
  collectTitle: {
    color: DarkThemeColors.primarySoft,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
    marginBottom: 2,
  },
  collectRow: { color: DarkThemeColors.text, fontSize: 11, lineHeight: 16 },
  pendingText: { color: DarkThemeColors.warning, fontSize: 11, marginTop: 6 },
});
