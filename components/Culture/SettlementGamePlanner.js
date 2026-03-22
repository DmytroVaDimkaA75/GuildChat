import { useEffect, useMemo, useState } from 'react';
import { useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import { ActivityIndicator, Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
  const movePoints = [step?.from, step?.to];

  return Array.from(
    new Set(
      [...footprints, ...tiles, ...targetFootprints, ...movePoints]
        .map(normalizeFootprint)
        .filter(Boolean)
    )
  );
};

const getBuildingDisplayName = (pack, buildingId) => {
  if (!buildingId) return 'Будівля';
  if (buildingId === 'town_hall') return pack?.coreBuildings?.townHall?.name || 'Ратуша';
  const groups = pack?.buildings ? Object.values(pack.buildings) : [];
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    const found = group.find((item) => item?.id === buildingId);
    if (found?.name) return found.name;
  }
  return buildingId;
};

const formatTaskText = (step, pack) => {
  if (!step) return 'Стартовий план завершено.';
  const buildingName = getBuildingDisplayName(pack, step.buildingId);

  if (step.actionType === 'move') {
    return `Перемістити ${buildingName} з ${step.from} на ${step.to}`;
  }
  if (step.actionType === 'build') {
    const targets = getStepTargetFootprints(step);
    return `Побудувати ${buildingName}${targets.length ? ` (${targets.join(', ')})` : ''}`;
  }
  if (step.actionType === 'delete') {
    const targets = getStepTargetFootprints(step);
    return `Видалити ${buildingName}${targets.length ? ` (${targets.join(', ')})` : ''}`;
  }
  if (step.actionType === 'start_production') {
    return `Запустити виробництво: ${buildingName}`;
  }
  return step.description || step.id;
};

const SettlementGamePlanner = () => {
  const route = useRoute();
  const settlementName = route.params?.settlementName;
  const { width: screenWidth } = Dimensions.get('window');
  const [openedSectorsFromDb, setOpenedSectorsFromDb] = useState([]);
  const [obstacleRectsFromDb, setObstacleRectsFromDb] = useState([]);
  const [buildingRectsFromDb, setBuildingRectsFromDb] = useState([]);
  const [placedBuildingsFromDb, setPlacedBuildingsFromDb] = useState([]);
  const [planStepIndex, setPlanStepIndex] = useState(0);
  const [identity, setIdentity] = useState({ userId: null, guildId: null });
  const [isCompletingStep, setIsCompletingStep] = useState(false);
  const [actionError, setActionError] = useState('');
  const [movePreviewRect, setMovePreviewRect] = useState(null);
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
            setPlanStepIndex(0);
            setIsLoading(false);
          }
          return;
        }

        if (isMounted) {
          setIdentity({ userId, guildId });
        }

        settlementRef = database().ref(`/users/${userId}/${guildId}/settlement`);
        onValueHandler = (snapshot) => {
          const settlementData = snapshot.exists() ? snapshot.val() : {};

          const openedRaw = settlementData?.openedSectors || [];
          const obstaclesRaw = settlementData?.sectorObstaclesStatic || {};
          const buildingsRaw = settlementData?.placedBuildings || [];
          const dbStepIndex = Number(settlementData?.starterPlanProgress?.currentStepIndex);

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
            setPlanStepIndex(Number.isFinite(dbStepIndex) && dbStepIndex >= 0 ? dbStepIndex : 0);
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
          setPlanStepIndex(0);
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
    const safeIndex = Math.max(0, Math.min(planStepIndex, steps.length));
    const currentStep = safeIndex < steps.length ? steps[safeIndex] : null;
    const completedCount = safeIndex;
    const isCompleted = safeIndex >= steps.length;

    const currentStepTargetRects = currentStep
      ? getStepTargetFootprints(currentStep).map(parseGridRange).filter(Boolean)
      : [];

    return {
      currentStep,
      completedCount,
      totalSteps: steps.length,
      isCompleted,
      currentStepTargetRects,
    };
  }, [starterPlan, planStepIndex]);

  useEffect(() => {
    const step = starterPlanProgress?.currentStep;
    if (!step || step.actionType !== 'move') {
      setMovePreviewRect(null);
      return;
    }

    const fromRect = parseGridRange(step.from);
    const toRect = parseGridRange(step.to);
    if (!fromRect || !toRect) {
      setMovePreviewRect(null);
      return;
    }

    let animationFrameId = null;
    const cycleMs = 2000;
    const moveMs = 1000;
    const cycleStart = Date.now();

    const tick = () => {
      const elapsed = (Date.now() - cycleStart) % cycleMs;

      if (elapsed <= moveMs) {
        const t = elapsed / moveMs;
        setMovePreviewRect({
          x: fromRect.x + (toRect.x - fromRect.x) * t,
          y: fromRect.y + (toRect.y - fromRect.y) * t,
          width: fromRect.width + (toRect.width - fromRect.width) * t,
          height: fromRect.height + (toRect.height - fromRect.height) * t,
        });
      } else {
        setMovePreviewRect({
          x: fromRect.x,
          y: fromRect.y,
          width: fromRect.width,
          height: fromRect.height,
        });
      }

      animationFrameId = requestAnimationFrame(tick);
    };

    tick();
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      setMovePreviewRect(null);
    };
  }, [starterPlanProgress?.currentStep?.id]);

  const handleCompleteCurrentTask = async () => {
    if (!starterPlan || !starterPlanProgress?.currentStep || isCompletingStep) return;
    if (!identity.userId || !identity.guildId) return;

    const step = starterPlanProgress.currentStep;
    const settlementPath = `/users/${identity.userId}/${identity.guildId}/settlement`;

    try {
      setActionError('');
      setIsCompletingStep(true);

      let nextPlacedBuildings = Array.isArray(placedBuildingsFromDb) ? [...placedBuildingsFromDb] : [];

      if (step.actionType === 'move') {
        const fromFootprint = normalizeFootprint(step.from);
        const toFootprint = normalizeFootprint(step.to);

        if (!toFootprint) {
          throw new Error('Не вдалося визначити кінцеву позицію для переміщення.');
        }

        let moved = false;
        nextPlacedBuildings = nextPlacedBuildings.map((building) => {
          if (moved) return building;
          if (building?.buildingId !== step.buildingId) return building;

          const buildingFootprint = normalizeFootprint(building?.footprint);
          if (!fromFootprint || buildingFootprint === fromFootprint) {
            moved = true;
            return { ...building, footprint: toFootprint };
          }
          return building;
        });

        if (!moved) {
          const fallbackIdx = nextPlacedBuildings.findIndex((building) => building?.buildingId === step.buildingId);
          if (fallbackIdx >= 0) {
            nextPlacedBuildings[fallbackIdx] = {
              ...nextPlacedBuildings[fallbackIdx],
              footprint: toFootprint,
            };
          }
        }

        setMovePreviewRect(parseGridRange(toFootprint));
      }

      const nextStepIndex = Math.min(
        starterPlanProgress.completedCount + 1,
        starterPlanProgress.totalSteps
      );

      await database().ref(settlementPath).update({
        placedBuildings: nextPlacedBuildings,
        starterPlanProgress: {
          planId: starterPlan.id,
          currentStepIndex: nextStepIndex,
          updatedAt: Date.now(),
        },
      });

      const nextBuildingRects = nextPlacedBuildings
        .map((building) => ({
          rect: parseGridRange(building?.footprint),
          buildingId: building?.buildingId || '',
          instanceId: building?.instanceId || '',
        }))
        .filter((item) => item.rect);

      setPlacedBuildingsFromDb(nextPlacedBuildings);
      setBuildingRectsFromDb(nextBuildingRects);
      setPlanStepIndex(nextStepIndex);
    } catch (error) {
      console.error('Не вдалося завершити поточний крок:', error);
      setActionError('Не вдалося зберегти виконання кроку. Спробуйте ще раз.');
    } finally {
      setIsCompletingStep(false);
    }
  };

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

          {movePreviewRect ? (
            <Rect
              x={movePreviewRect.x}
              y={movePreviewRect.y}
              width={movePreviewRect.width}
              height={movePreviewRect.height}
              fill="rgba(255, 193, 7, 0.35)"
              stroke="#FFC107"
              strokeWidth={1.5}
            />
          ) : null}
        </G>
      </Svg>

      <View style={styles.taskRow}>
        <Text style={styles.taskText}>
          {!starterPlan
            ? 'Для цього поселення стартовий план не задано.'
            : starterPlanProgress?.isCompleted
            ? 'Стартовий план завершено.'
            : formatTaskText(starterPlanProgress?.currentStep, pack)}
        </Text>
        <TouchableOpacity
          style={[
            styles.doneButton,
            (isCompletingStep || starterPlanProgress?.isCompleted || !starterPlanProgress?.currentStep) && styles.doneButtonDisabled,
          ]}
          disabled={isCompletingStep || starterPlanProgress?.isCompleted || !starterPlanProgress?.currentStep}
          onPress={handleCompleteCurrentTask}
        >
          <Text style={styles.doneButtonText}>{isCompletingStep ? 'Збереження...' : 'Виконано'}</Text>
        </TouchableOpacity>
      </View>
      {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
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
  taskRow: {
    width: '96%',
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  taskText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
  },
  doneButton: {
    backgroundColor: '#1976D2',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  doneButtonDisabled: {
    opacity: 0.55,
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  errorText: {
    width: '96%',
    marginTop: 8,
    color: '#FF8A80',
    fontSize: 13,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
});

export default SettlementGamePlanner;
