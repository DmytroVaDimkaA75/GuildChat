import { useEffect, useMemo, useState } from 'react';
import { useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import { ActivityIndicator, Dimensions, StyleSheet, Text, View } from 'react-native';
import Svg, { ClipPath, Defs, G, Line, Rect } from 'react-native-svg';

import MapSvg from './map.svg';
import RULE_PACKS from './RulePack';

const COLORS = {
  background: '#121212',
  textPrimary: '#FFFFFF',
  borderStrong: '#111111',
  sectorGrid: '#303030',
};

const MAP_VIEWBOX = { width: 279.99976, height: 280 };
const TILE_SIZE = 10;
const TILE_RE = /^([A-Z]+)(\d+)$/;
const RANGE_RE = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/;

const lettersToIndex = (letters) => {
  let idx = 0;
  for (let i = 0; i < letters.length; i += 1) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx;
};

const parseSectorRange = (range) => {
  if (!range) return null;
  const match = String(range).toUpperCase().match(RANGE_RE);
  if (!match) return null;

  const startCol = lettersToIndex(match[1]);
  const startRow = Number(match[2]);
  const endCol = lettersToIndex(match[3]);
  const endRow = Number(match[4]);

  return {
    x: (startCol - 1) * TILE_SIZE,
    y: (startRow - 1) * TILE_SIZE,
    width: (endCol - startCol + 1) * TILE_SIZE,
    height: (endRow - startRow + 1) * TILE_SIZE,
  };
};

const getRectsBounds = (rects) => {
  if (!rects.length) return { x: 0, y: 0, width: MAP_VIEWBOX.width, height: MAP_VIEWBOX.height };
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

const normalizeFootprint = (value) => {
  if (!value) return null;
  const normalized = String(value).trim().toUpperCase();
  if (RANGE_RE.test(normalized)) return normalized;
  const tileMatch = normalized.match(TILE_RE);
  if (!tileMatch) return null;
  return `${normalized}:${normalized}`;
};

const parseGridRange = (value) => {
  const normalized = normalizeFootprint(value);
  if (!normalized) return null;
  return parseSectorRange(normalized);
};

const getStepTargetFootprints = (step) => {
  const footprints = Array.isArray(step?.footprints) ? step.footprints : [];
  const tiles = Array.isArray(step?.tiles) ? step.tiles : [];
  const targetFootprints = Array.isArray(step?.targetFootprints) ? step.targetFootprints : [];

  return Array.from(
    new Set(
      [...footprints, ...tiles, ...targetFootprints]
        .map(normalizeFootprint)
        .filter(Boolean)
    )
  );
};

const normalizePlacedBuildings = (buildings) => {
  const source = Array.isArray(buildings) ? buildings : [];
  return source
    .map((building) => {
      const buildingId = building?.buildingId || '';
      const footprint = normalizeFootprint(building?.footprint);
      if (!buildingId || !footprint) return null;
      return {
        buildingId,
        footprint,
        hasActiveJob: Boolean(building?.job),
      };
    })
    .filter(Boolean);
};

const evaluateStarterStep = (step, normalizedBuildings) => {
  if (!step?.actionType || !step?.buildingId) return false;

  const buildingMatches = normalizedBuildings.filter((item) => item.buildingId === step.buildingId);
  const targets = getStepTargetFootprints(step);
  const hasBuildingAt = (footprint) => buildingMatches.some((item) => item.footprint === footprint);
  const hasActiveJobAt = (footprint) =>
    buildingMatches.some((item) => item.footprint === footprint && item.hasActiveJob);

  if (step.actionType === 'move') {
    const toFootprint = normalizeFootprint(step.to);
    return Boolean(toFootprint && hasBuildingAt(toFootprint));
  }

  if (step.actionType === 'build') {
    if (targets.length > 0) return targets.every(hasBuildingAt);
    if (Number.isFinite(step.expectedCount)) return buildingMatches.length >= Number(step.expectedCount);
    return false;
  }

  if (step.actionType === 'delete') {
    if (targets.length > 0) return targets.every((target) => !hasBuildingAt(target));
    return buildingMatches.length === 0;
  }

  if (step.actionType === 'start_production') {
    if (targets.length > 0) return targets.every(hasActiveJobAt);
    if (Number.isFinite(step.expectedCount)) {
      return buildingMatches.filter((item) => item.hasActiveJob).length >= Number(step.expectedCount);
    }
    return buildingMatches.some((item) => item.hasActiveJob);
  }

  return false;
};

const isReminderTriggerSatisfied = (trigger, completedStepIds) => {
  if (!trigger?.type || !trigger?.stepId) return false;
  if (trigger.type === 'step_completed' || trigger.type === 'build_completed') {
    return completedStepIds.has(trigger.stepId);
  }
  return false;
};

const SettlementGamePlanner = () => {
  const route = useRoute();
  const settlementName = route.params?.settlementName;
  const { width: screenWidth } = Dimensions.get('window');
  const [openedSectorsFromDb, setOpenedSectorsFromDb] = useState([]);
  const [obstacleRectsFromDb, setObstacleRectsFromDb] = useState([]);
  const [buildingRectsFromDb, setBuildingRectsFromDb] = useState([]);
  const [placedBuildingsFromDb, setPlacedBuildingsFromDb] = useState([]);
  const [collectedGoodsFromDb, setCollectedGoodsFromDb] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    let settlementRef = null;
    let onValueHandler = null;

    (async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        const guildId = await AsyncStorage.getItem('guildId');
        if (!userId || !guildId) {
          if (isMounted) {
            setOpenedSectorsFromDb([]);
            setObstacleRectsFromDb([]);
            setBuildingRectsFromDb([]);
            setPlacedBuildingsFromDb([]);
            setCollectedGoodsFromDb({});
            setIsLoading(false);
          }
          return;
        }

        settlementRef = database().ref(`/users/${userId}/${guildId}/settlement`);
        onValueHandler = (snapshot) => {
          const settlementData = snapshot.exists() ? snapshot.val() : {};

          const openedRaw = settlementData?.openedSectors || [];
          const obstaclesRaw = settlementData?.sectorObstaclesStatic || {};
          const buildingsRaw = settlementData?.placedBuildings || [];
          const collectedGoodsRaw = settlementData?.stats?.collected?.goods || {};

          const openedArr = Array.isArray(openedRaw) ? openedRaw : Object.values(openedRaw || {});
          const buildingsArr = Array.isArray(buildingsRaw) ? buildingsRaw : Object.values(buildingsRaw || {});

          const nextObstacleRects = [];
          Object.entries(obstaclesRaw || {}).forEach(([sector, obstacles]) => {
            const sectorRect = parseSectorRange(sector);
            if (!sectorRect || !Array.isArray(obstacles)) return;

            obstacles.forEach((obstacle) => {
              const x = Number(obstacle?.x);
              const y = Number(obstacle?.y);
              const w = Number(obstacle?.w);
              const h = Number(obstacle?.h);
              if (![x, y, w, h].every((value) => Number.isFinite(value))) return;

              nextObstacleRects.push({
                x: sectorRect.x + x * TILE_SIZE,
                y: sectorRect.y + y * TILE_SIZE,
                width: w * TILE_SIZE,
                height: h * TILE_SIZE,
              });
            });
          });

          const nextBuildingRects = buildingsArr
            .map((building) => ({
              rect: parseGridRange(building?.footprint),
              buildingId: building?.buildingId || '',
              instanceId: building?.instanceId || '',
            }))
            .filter((item) => item.rect);

          if (isMounted) {
            setOpenedSectorsFromDb(openedArr.filter(Boolean));
            setObstacleRectsFromDb(nextObstacleRects);
            setBuildingRectsFromDb(nextBuildingRects);
            setPlacedBuildingsFromDb(buildingsArr);
            setCollectedGoodsFromDb(collectedGoodsRaw || {});
            setIsLoading(false);
          }
        };

        settlementRef.on('value', onValueHandler);
      } catch (error) {
        console.error('Не вдалося завантажити дані settlement:', error);
        if (isMounted) {
          setOpenedSectorsFromDb([]);
          setObstacleRectsFromDb([]);
          setBuildingRectsFromDb([]);
          setPlacedBuildingsFromDb([]);
          setCollectedGoodsFromDb({});
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
      if (settlementRef && onValueHandler) {
        settlementRef.off('value', onValueHandler);
      }
    };
  }, []);

  const pack = useMemo(
    () =>
      RULE_PACKS[settlementName] ||
      Object.values(RULE_PACKS).find((item) => item?.settlementType === settlementName),
    [settlementName]
  );

  const starterPlan = useMemo(() => {
    const starterPlans = pack?.starterPlans;
    const plans = Array.isArray(starterPlans?.plans) ? starterPlans.plans : [];
    if (!plans.length) return null;

    const preferred = plans.find((plan) => plan.id === starterPlans?.defaultPlanId);
    return preferred || plans[0];
  }, [pack]);

  const { allRects, openedRects } = useMemo(() => {
    const allSectors = pack?.map?.allSectors || [];
    return {
      allRects: allSectors.map(parseSectorRange).filter(Boolean),
      openedRects: openedSectorsFromDb.map(parseSectorRange).filter(Boolean),
    };
  }, [openedSectorsFromDb, pack]);

  const starterPlanProgress = useMemo(() => {
    if (!starterPlan) return null;

    const steps = Array.isArray(starterPlan.steps) ? starterPlan.steps : [];
    const normalizedBuildings = normalizePlacedBuildings(placedBuildingsFromDb);
    const completedStepIds = new Set();

    steps.forEach((step) => {
      if (evaluateStarterStep(step, normalizedBuildings)) {
        completedStepIds.add(step.id);
      }
    });

    const currentStep =
      steps.find((step) => {
        if (completedStepIds.has(step.id)) return false;
        const deps = Array.isArray(step.dependsOn) ? step.dependsOn : [];
        return deps.every((depStepId) => completedStepIds.has(depStepId));
      }) || null;

    const completedCount = steps.filter((step) => completedStepIds.has(step.id)).length;
    const totalCollectedGoods = Object.values(collectedGoodsFromDb || {}).reduce(
      (sum, value) => sum + (Number(value) || 0),
      0
    );

    const completionType = starterPlan?.completion?.type;
    const minCollectEvents = Number(starterPlan?.completion?.minCollectEvents) || 1;
    const collectedEnoughGoods =
      completionType === 'first_goods_collect' ? totalCollectedGoods >= minCollectEvents : true;
    const allStepsDone = steps.length > 0 && completedCount === steps.length;
    const isCompleted = allStepsDone && collectedEnoughGoods;

    const reminderRules = Array.isArray(starterPlan.reminderRules) ? starterPlan.reminderRules : [];
    const activeReminders = reminderRules.filter((rule) =>
      isReminderTriggerSatisfied(rule?.trigger, completedStepIds)
    );

    const currentStepTargetRects = currentStep
      ? getStepTargetFootprints(currentStep).map(parseGridRange).filter(Boolean)
      : [];

    return {
      currentStep,
      completedCount,
      totalSteps: steps.length,
      totalCollectedGoods,
      isCompleted,
      activeReminders: isCompleted ? [] : activeReminders,
      currentStepTargetRects,
    };
  }, [starterPlan, placedBuildingsFromDb, collectedGoodsFromDb]);

  const bounds = useMemo(() => getRectsBounds(allRects), [allRects]);
  const mapHeight = screenWidth * (bounds.height / bounds.width);

  if (isLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Планувальник: {settlementName || '—'}</Text>
      {starterPlan ? (
        <View style={styles.planCard}>
          <Text style={styles.planName}>{starterPlan.name}</Text>
          <Text style={styles.planMeta}>
            Виконано кроків: {starterPlanProgress?.completedCount || 0}/{starterPlanProgress?.totalSteps || 0}
          </Text>
          <Text style={styles.planMeta}>
            Зібрано товарів: {starterPlanProgress?.totalCollectedGoods || 0}
          </Text>

          {starterPlanProgress?.isCompleted ? (
            <Text style={styles.planDone}>Стартовий план завершено.</Text>
          ) : starterPlanProgress?.currentStep ? (
            <Text style={styles.planCurrentStep}>
              Поточний крок {starterPlanProgress.currentStep.order}:{' '}
              {starterPlanProgress.currentStep.description || starterPlanProgress.currentStep.id}
            </Text>
          ) : (
            <Text style={styles.planCurrentStep}>Очікування наступного кроку.</Text>
          )}

          {starterPlanProgress?.activeReminders?.length ? (
            <View style={styles.remindersBlock}>
              <Text style={styles.remindersTitle}>Нагадування</Text>
              {starterPlanProgress.activeReminders.map((reminder) => (
                <Text key={reminder.id} style={styles.reminderText}>
                  • {reminder.title}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
      <Svg
        width={screenWidth}
        height={mapHeight}
        viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
      >
        <Defs>
          <ClipPath id="gameAllowedClip">
            {allRects.map((rect, idx) => (
              <Rect key={`g-clip-${idx}`} x={rect.x} y={rect.y} width={rect.width} height={rect.height} />
            ))}
          </ClipPath>
        </Defs>

        <G clipPath="url(#gameAllowedClip)">
          <MapSvg width={MAP_VIEWBOX.width} height={MAP_VIEWBOX.height} />
          {openedRects.map((rect, idx) => (
            <G key={`g-open-${idx}`}>
              <Rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill="#FFFFFF" />
              <Rect
                x={rect.x}
                y={rect.y}
                width={rect.width}
                height={rect.height}
                fill="none"
                stroke={COLORS.borderStrong}
                strokeWidth={1.8}
              />
              {[1, 2, 3].map((i) => (
                <Line
                  key={`g-v-${idx}-${i}`}
                  x1={rect.x + i * TILE_SIZE}
                  y1={rect.y}
                  x2={rect.x + i * TILE_SIZE}
                  y2={rect.y + rect.height}
                  stroke={COLORS.sectorGrid}
                  strokeWidth={0.7}
                />
              ))}
              {[1, 2, 3].map((i) => (
                <Line
                  key={`g-h-${idx}-${i}`}
                  x1={rect.x}
                  y1={rect.y + i * TILE_SIZE}
                  x2={rect.x + rect.width}
                  y2={rect.y + i * TILE_SIZE}
                  stroke={COLORS.sectorGrid}
                  strokeWidth={0.7}
                />
              ))}
            </G>
          ))}

          {obstacleRectsFromDb.map((rect, idx) => (
            <Rect
              key={`g-obstacle-${idx}`}
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              fill="#4A4A4A"
            />
          ))}

          {buildingRectsFromDb.map((building, idx) => (
            <Rect
              key={`g-building-${building.instanceId || idx}`}
              x={building.rect.x}
              y={building.rect.y}
              width={building.rect.width}
              height={building.rect.height}
              fill={building.buildingId === 'town_hall' ? '#E3F2FD' : '#81D4FA'}
              stroke="#0D47A1"
              strokeWidth={1}
            />
          ))}

          {(starterPlanProgress?.currentStepTargetRects || []).map((rect, idx) => (
            <Rect
              key={`g-target-${idx}`}
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              fill="rgba(255, 235, 59, 0.2)"
              stroke="#FFEB3B"
              strokeWidth={1.5}
            />
          ))}
        </G>
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    paddingTop: 16,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 18,
    marginBottom: 16,
  },
  planCard: {
    width: '96%',
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#2D2D2D',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  planName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  planMeta: {
    color: '#CFCFCF',
    fontSize: 13,
    marginBottom: 2,
  },
  planCurrentStep: {
    color: '#FFFFFF',
    fontSize: 14,
    marginTop: 8,
  },
  planDone: {
    color: '#81C784',
    fontSize: 14,
    marginTop: 8,
    fontWeight: '600',
  },
  remindersBlock: {
    marginTop: 10,
  },
  remindersTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  reminderText: {
    color: '#E0E0E0',
    fontSize: 13,
    marginBottom: 2,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
});

export default SettlementGamePlanner;
