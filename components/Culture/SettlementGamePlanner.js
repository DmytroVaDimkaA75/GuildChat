import { useEffect, useMemo, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import { ActivityIndicator, Alert, Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { ClipPath, Defs, G, Line, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import MapSvg from './map.svg';
import RULE_PACKS from './RulePack';
import SettlementMapGridHeaders, { getBoundsWithGridHeaders } from './SettlementMapGridHeaders';

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
const BUILDING_COLOR = {
  town_hall: '#FF00FF',
  residential: '#00AA00',
  coin: '#6D9EEB',
  diplomacy: '#6D9EEB',
  goods: '#E60A18',
};
const TOTAL_MINUTES = 24 * 60;

const lettersToIndex = (letters) => {
  let idx = 0;
  for (let i = 0; i < letters.length; i += 1) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx;
};

const indexToLetters = (index) => {
  let n = Number(index);
  if (!Number.isFinite(n) || n <= 0) return null;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

const parseRangeMeta = (range) => {
  if (!range) return null;
  const match = String(range).toUpperCase().match(RANGE_RE);
  if (!match) return null;
  return {
    startCol: lettersToIndex(match[1]),
    startRow: Number(match[2]),
    endCol: lettersToIndex(match[3]),
    endRow: Number(match[4]),
  };
};

const parseSectorRange = (range) => {
  const meta = parseRangeMeta(range);
  if (!meta) return null;
  const { startCol, startRow, endCol, endRow } = meta;

  return {
    x: (startCol - 1) * TILE_SIZE,
    y: (startRow - 1) * TILE_SIZE,
    width: (endCol - startCol + 1) * TILE_SIZE,
    height: (endRow - startRow + 1) * TILE_SIZE,
  };
};

const absoluteRectToFootprint = (rect) => {
  const xTiles = Math.round(rect.x / TILE_SIZE);
  const yTiles = Math.round(rect.y / TILE_SIZE);
  const wTiles = Math.round(rect.width / TILE_SIZE);
  const hTiles = Math.round(rect.height / TILE_SIZE);
  const startCol = xTiles + 1;
  const startRow = yTiles + 1;
  const endCol = startCol + wTiles - 1;
  const endRow = startRow + hTiles - 1;
  const startLetters = indexToLetters(startCol);
  const endLetters = indexToLetters(endCol);
  if (!startLetters || !endLetters) return null;
  return `${startLetters}${startRow}:${endLetters}${endRow}`;
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

const hexToRgba = (hex, alpha = 1) => {
  const normalized = String(hex || '').replace('#', '');
  if (normalized.length !== 6) return `rgba(255,255,255,${alpha})`;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const getBuildingCategory = (pack, buildingId) => {
  if (!buildingId) return null;
  if (buildingId === 'town_hall') return 'town_hall';
  const buildingGroups = pack?.buildings ? Object.entries(pack.buildings) : [];
  for (const [groupKey, items] of buildingGroups) {
    if (!Array.isArray(items)) continue;
    const found = items.find((item) => item?.id === buildingId);
    if (found) return found.category || groupKey;
  }
  return null;
};

const getBuildingDefinition = (pack, buildingId) => {
  if (!buildingId) return null;
  if (buildingId === 'town_hall') return pack?.coreBuildings?.townHall || null;

  const groups = pack?.buildings ? Object.values(pack.buildings) : [];
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    const found = group.find((item) => item?.id === buildingId);
    if (found) return found;
  }

  return null;
};

const getBuildingColor = (pack, buildingId) => {
  const category = getBuildingCategory(pack, buildingId);
  return BUILDING_COLOR[category] || '#6D9EEB';
};

const getBuildingBuildTimeSec = (pack, buildingId) => {
  const building = getBuildingDefinition(pack, buildingId);
  const buildTimeSec = Number(building?.buildTimeSec);
  return Number.isFinite(buildTimeSec) && buildTimeSec > 0 ? buildTimeSec : 0;
};

const shouldNotifyBuildCompletion = (pack, buildingId) => {
  const category = getBuildingCategory(pack, buildingId);
  const buildTimeSec = getBuildingBuildTimeSec(pack, buildingId);
  if (category === 'goods') return buildTimeSec > 0;
  return category === 'residential' && buildTimeSec >= 3600;
};

const shouldTrackConstructionTimers = (pack, buildingId) => {
  const category = getBuildingCategory(pack, buildingId);
  const buildTimeSec = getBuildingBuildTimeSec(pack, buildingId);
  return ['residential', 'coin', 'goods'].includes(category) && buildTimeSec > 0;
};

const getBuildingCurrency = (pack, buildingId) => {
  const building = getBuildingDefinition(pack, buildingId);
  return building?.coinOutput?.currency || null;
};

const getBuildingOutputLabel = (pack, buildingId) => {
  const building = getBuildingDefinition(pack, buildingId);
  return building?.coinOutput?.currency || building?.produces || null;
};

const getFirstCoinRecipeDurationSec = (pack, buildingId) => {
  const building = getBuildingDefinition(pack, buildingId);
  const recipes = Array.isArray(building?.coinOutput?.recipes) ? building.coinOutput.recipes : [];
  const firstDurationSec = Number(recipes?.[0]?.durationSec);
  return Number.isFinite(firstDurationSec) && firstDurationSec > 0 ? firstDurationSec : 0;
};

const getDefaultGoodsProductionDurationSec = (pack, buildingId) => {
  const building = getBuildingDefinition(pack, buildingId);
  const templateRef = building?.templateRef;
  const recipes = Array.isArray(pack?.productionTemplates?.[templateRef]?.recipes)
    ? pack.productionTemplates[templateRef].recipes
    : [];
  const firstDurationSec = Number(recipes?.[0]?.durationSec);
  return Number.isFinite(firstDurationSec) && firstDurationSec > 0 ? firstDurationSec : 18000;
};

const getGoodsProductionRecipes = (pack, buildingId) => {
  const building = getBuildingDefinition(pack, buildingId);
  const templateRef = building?.templateRef;
  const recipes = Array.isArray(pack?.productionTemplates?.[templateRef]?.recipes)
    ? pack.productionTemplates[templateRef].recipes
    : [];

  return recipes
    .map((recipe) => ({
      ...recipe,
      durationSec: Number(recipe?.durationSec) || 0,
    }))
    .filter((recipe) => recipe.durationSec > 0)
    .sort((a, b) => a.durationSec - b.durationSec);
};

const dayKeyToIndex = (key) => {
  if (typeof key !== 'string') return null;
  if (key.startsWith('d')) {
    const n = Number(key.slice(1));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(key);
  return Number.isFinite(n) ? n : null;
};

const weekKeyToIndex = (key) => {
  if (typeof key !== 'string') return null;
  if (key.startsWith('w')) {
    const n = Number(key.slice(1));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(key);
  return Number.isFinite(n) ? n : null;
};

const weeklyIndexToKey = (idx) => `d${idx}`;
const rollingWeekIndexToKey = (idx) => `w${idx}`;
const rollingDayIndexToKey = (idx) => `d${idx}`;

const normalizeWeekly = (weeklyRaw) => {
  const out = {};
  if (!weeklyRaw) return out;

  if (Array.isArray(weeklyRaw)) {
    for (let i = 0; i < weeklyRaw.length; i += 1) {
      const daySlots = weeklyRaw[i];
      if (!Array.isArray(daySlots) || !daySlots.length) continue;
      out[weeklyIndexToKey(i)] = daySlots;
    }
    return out;
  }

  if (typeof weeklyRaw === 'object') {
    Object.keys(weeklyRaw).forEach((k) => {
      const idx = dayKeyToIndex(k);
      if (idx === null) return;
      const daySlots = weeklyRaw[k];
      if (!Array.isArray(daySlots) || !daySlots.length) return;
      out[weeklyIndexToKey(idx)] = daySlots;
    });
  }

  return out;
};

const normalizeRollingWeeks = (rollingWeeksRaw) => {
  if (!rollingWeeksRaw || typeof rollingWeeksRaw !== 'object') return null;

  const anchorAt = rollingWeeksRaw.anchorAt;
  const weeksRaw = rollingWeeksRaw.weeks;
  const weeksOut = {};

  if (!weeksRaw || typeof weeksRaw !== 'object') {
    return { anchorAt, weeks: weeksOut };
  }

  Object.keys(weeksRaw).forEach((wk) => {
    const wIndex = weekKeyToIndex(wk);
    if (wIndex === null) return;

    const weekObj = weeksRaw[wk];
    const daysRaw = weekObj?.days;
    const wKey = rollingWeekIndexToKey(wIndex);
    if (!weeksOut[wKey]) weeksOut[wKey] = { days: {} };

    if (!daysRaw || typeof daysRaw !== 'object') return;

    Object.keys(daysRaw).forEach((dk) => {
      const dIndex = dayKeyToIndex(dk);
      if (dIndex === null) return;

      const slots = daysRaw[dk];
      if (!Array.isArray(slots) || !slots.length) return;

      const dKey = rollingDayIndexToKey(dIndex);
      weeksOut[wKey].days[dKey] = slots;
    });
  });

  return { anchorAt, weeks: weeksOut };
};

const getLocalParts = (utcMs, timeZone) => {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = dtf.formatToParts(new Date(utcMs));
  const map = {};
  parts.forEach((part) => {
    map[part.type] = part.value;
  });

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    weekdayShort: map.weekday,
  };
};

const weekdayShortToMon0 = (value) => {
  const map = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  return map[value] ?? null;
};

const localYmdToUtcMidnightMs = (year, month, day) => Date.UTC(year, month - 1, day);

const isMinuteInsideSlots = (minuteOfDay, slots) => {
  if (!Array.isArray(slots) || !slots.length) return false;
  const minute = Math.max(0, Math.min(minuteOfDay, TOTAL_MINUTES));
  for (const slot of slots) {
    const start = Number(slot?.startMinutes);
    const end = Number(slot?.endMinutes);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (minute >= start && minute < end) return true;
  }
  return false;
};

const isUserActiveNow = (scheduleData, utcMs, timeZone) => {
  if (!scheduleData) return true;

  const tz = timeZone || 'UTC';
  const parts = getLocalParts(utcMs, tz);
  const dayIndex = weekdayShortToMon0(parts.weekdayShort);
  if (dayIndex === null) return true;

  const minuteOfDay = parts.hour * 60 + parts.minute;

  if (scheduleData.weekly) {
    const weekly = normalizeWeekly(scheduleData.weekly);
    const slots = weekly[weeklyIndexToKey(dayIndex)] || [];
    return isMinuteInsideSlots(minuteOfDay, slots);
  }

  if (scheduleData.rollingWeeks?.weeks) {
    const rolling = normalizeRollingWeeks(scheduleData.rollingWeeks);
    const anchorAt = Number(rolling?.anchorAt);
    const weeks = rolling?.weeks || {};
    if (!Number.isFinite(anchorAt)) return true;

    const nowLocalMidUtc = localYmdToUtcMidnightMs(parts.year, parts.month, parts.day);
    const anchorParts = getLocalParts(anchorAt * 1000, tz);
    const anchorLocalMidUtc = localYmdToUtcMidnightMs(anchorParts.year, anchorParts.month, anchorParts.day);
    const diffDays = Math.floor((nowLocalMidUtc - anchorLocalMidUtc) / (24 * 60 * 60 * 1000));
    const weekIndex = Math.floor(diffDays / 7);
    const dayInWeek = ((diffDays % 7) + 7) % 7;

    const wKey = rollingWeekIndexToKey(weekIndex);
    const dKey = rollingDayIndexToKey(dayInWeek);
    const slots = weeks?.[wKey]?.days?.[dKey] || [];
    return isMinuteInsideSlots(minuteOfDay, slots);
  }

  return true;
};

const isUserActiveNowBySchedules = (schedules, utcMs, timeZone) => {
  if (!Array.isArray(schedules) || !schedules.length) return true;
  return schedules.some((schedule) => isUserActiveNow(schedule, utcMs, timeZone));
};

const getPreferredSchedules = (setting) => {
  const timeZone = setting?.timeZone || 'UTC';
  const preferredId = setting?.notificationScheduleId || setting?.activeScheduleId || null;
  const schedulesMap = setting?.schedules && typeof setting.schedules === 'object' ? setting.schedules : {};

  if (preferredId && schedulesMap[preferredId]) {
    return { timeZone, schedules: [schedulesMap[preferredId]] };
  }

  return {
    timeZone,
    schedules: Object.keys(schedulesMap)
      .map((id) => schedulesMap[id])
      .filter((item) => item && typeof item === 'object'),
  };
};

const getRecommendedGoodsProductionDurationSec = ({
  pack,
  buildingId,
  startAtMs,
  schedules,
  timeZone,
}) => {
  const recipes = getGoodsProductionRecipes(pack, buildingId);
  if (!recipes.length) return 18000;

  const recipe5h = recipes.find((recipe) => recipe.durationSec === 18000) || recipes[0];
  const recipe10h = recipes.find((recipe) => recipe.durationSec === 36000) || null;
  const fiveHourEndsAt = startAtMs + recipe5h.durationSec * 1000;

  if (isUserActiveNowBySchedules(schedules, fiveHourEndsAt, timeZone)) {
    return recipe5h.durationSec;
  }

  return recipe10h?.durationSec || recipe5h.durationSec;
};

const formatProductionDurationLabel = (durationSec) => {
  const hours = Number(durationSec) / 3600;
  if (!Number.isFinite(hours) || hours <= 0) return '';
  if (Number.isInteger(hours)) return `${hours}-ти годинне`;
  return `${hours}-годинне`;
};

const normalizeCultureTestingConfig = (value) => {
  const timeScale = Number(value?.timeScale);
  return {
    timeScale: Number.isFinite(timeScale) && timeScale > 1 ? timeScale : 1,
  };
};

const scaleCultureDurationSec = (durationSec, testingConfig) => {
  const safeDurationSec = Number(durationSec);
  if (!Number.isFinite(safeDurationSec) || safeDurationSec <= 0) return 0;

  const timeScale = Number(testingConfig?.timeScale) || 1;
  if (timeScale <= 1) return safeDurationSec;

  return Math.max(1, Math.round(safeDurationSec / timeScale));
};

const getLocalizedCultureResourceLabel = (resourceKey, t) => {
  const normalizedKey = String(resourceKey || '').trim();
  if (!normalizedKey) return '';
  return t ? t(`cultureResources.${normalizedKey}`, { defaultValue: normalizedKey }) : normalizedKey;
};

const isConstructionCompleted = (building, nowMs) => {
  const notifiedAt = Number(building?.construction?.notifications?.build_complete) || 0;
  if (notifiedAt > 0) return true;
  const endsAt = Number(building?.construction?.endsAt) || 0;
  return endsAt > 0 && nowMs >= endsAt;
};

const isJobReadyToCollect = (building, nowMs) => {
  const endsAt = Number(building?.job?.endsAt) || 0;
  return endsAt > 0 && nowMs >= endsAt;
};

const isJobRunning = (building, nowMs) => {
  const endsAt = Number(building?.job?.endsAt) || 0;
  return endsAt > nowMs;
};

const isObstacleDeleteStep = (step) =>
  step?.actionType === 'clear_obstacle' ||
  step?.targetType === 'obstacle' ||
  step?.buildingId === 'obstacle';

const getStepColor = (pack, step) => {
  if (isObstacleDeleteStep(step)) return '#4A4A4A';
  return getBuildingColor(pack, step?.buildingId);
};

const expandStarterPlanBuildSteps = (plan) => {
  if (!plan) return null;
  const steps = Array.isArray(plan.steps) ? plan.steps : [];
  const expandedSteps = [];

  steps.forEach((step) => {
    const isObstacleStep = isObstacleDeleteStep(step);
    const normalizedStep = isObstacleStep
      ? { ...step, actionType: 'clear_obstacle', targetType: 'obstacle' }
      : step;

    if (
      normalizedStep?.actionType !== 'build' &&
      normalizedStep?.actionType !== 'delete' &&
      normalizedStep?.actionType !== 'clear_obstacle'
    ) {
      expandedSteps.push(step);
      return;
    }

    const footprints = Array.isArray(normalizedStep.footprints) ? normalizedStep.footprints : [];
    const tiles = Array.isArray(normalizedStep.tiles) ? normalizedStep.tiles : [];
    const targetFootprints = Array.isArray(normalizedStep.targetFootprints) ? normalizedStep.targetFootprints : [];

    let targetKey = null;
    let sourceTargets = [];
    if (footprints.length > 0) {
      targetKey = 'footprints';
      sourceTargets = footprints;
    } else if (tiles.length > 0) {
      targetKey = 'tiles';
      sourceTargets = tiles;
    } else if (targetFootprints.length > 0) {
      targetKey = 'targetFootprints';
      sourceTargets = targetFootprints;
    }

    if (!targetKey || sourceTargets.length <= 1) {
      expandedSteps.push(normalizedStep);
      return;
    }

    sourceTargets.forEach((target, index) => {
      const splitId = `${normalizedStep.id}__${index + 1}`;
      const splitStep = {
        ...normalizedStep,
        id: splitId,
        expectedCount: 1,
        [targetKey]: [target],
      };

      const inheritedDependsOn = Array.isArray(normalizedStep.dependsOn) ? [...normalizedStep.dependsOn] : [];
      if (index > 0) {
        splitStep.dependsOn = [`${normalizedStep.id}__${index}`];
      } else {
        splitStep.dependsOn = inheritedDependsOn;
      }

      if (index < sourceTargets.length - 1) {
        delete splitStep.completesMilestoneId;
        delete splitStep.onComplete;
      }

      expandedSteps.push(splitStep);
    });
  });

  return {
    ...plan,
    steps: expandedSteps,
  };
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

const formatTaskText = (step, pack, t) => {
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
  if (step.actionType === 'clear_obstacle') {
    const targets = getStepTargetFootprints(step);
    return `Видалити перешкоду${targets.length ? ` (${targets.join(', ')})` : ''}`;
  }
  if (step.actionType === 'start_production') {
    const durationLabel = formatProductionDurationLabel(step?.recommendedProductionDurationSec);
    const outputLabel = getLocalizedCultureResourceLabel(
      step?.outputLabel || getBuildingOutputLabel(pack, step.buildingId),
      t
    );
    if (durationLabel && outputLabel) {
      return `Запустити ${durationLabel} виробництво ${outputLabel} в ${buildingName}`;
    }
    if (durationLabel) {
      return `Запустити ${durationLabel} виробництво в ${buildingName}`;
    }
    return `Запустити виробництво в ${buildingName}`;
  }
  if (step.actionType === 'collect') {
    const outputLabel = getLocalizedCultureResourceLabel(step?.outputLabel, t);
    return `Зібрати ${outputLabel || 'товари'} з ${buildingName}`;
  }
  return step.description || step.id;
};

const buildContinuousGoodsCycleState = ({ plan, pack, placedBuildings, nowMs }) => {
  if (plan?.completion?.type !== 'first_goods_collect') return null;

  const preferredCategory = String(plan?.completion?.fromBuildingCategory || 'goods');
  const steps = Array.isArray(plan?.steps) ? [...plan.steps] : [];
  const seedStep = [...steps].reverse().find(
    (step) =>
      step?.actionType === 'start_production' &&
      getBuildingCategory(pack, step?.buildingId) === preferredCategory
  );

  if (!seedStep) return null;

  const targets = new Set(getStepTargetFootprints(seedStep));
  const matchingBuildings = placedBuildings.filter((building) => {
    if (building?.buildingId !== seedStep.buildingId) return false;
    const footprint = normalizeFootprint(building?.footprint);
    return !targets.size || targets.has(footprint);
  });

  if (!matchingBuildings.length) return null;

  const builtBuildings = matchingBuildings.filter((building) => isConstructionCompleted(building, nowMs));
  if (builtBuildings.length !== matchingBuildings.length) {
    return {
      currentStep: {
        ...seedStep,
        id: `${seedStep.id}__wait_build`,
        isSyntheticCycleStep: true,
      },
      completedCount: steps.length,
      totalSteps: steps.length,
      isCompleted: false,
      currentStepTargetRects: [],
      isCurrentStepReady: false,
      waitingText: 'Очікування завершення будівництва',
      targetHighlightVariant: 'yellow',
      isSyntheticCycleStep: true,
    };
  }

  const readyToCollect = builtBuildings.filter((building) => isJobReadyToCollect(building, nowMs));
  if (readyToCollect.length > 0) {
    const targetFootprints = readyToCollect
      .map((building) => normalizeFootprint(building?.footprint))
      .filter(Boolean);

    return {
      currentStep: {
        id: `${seedStep.id}__collect`,
        actionType: 'collect',
        buildingId: seedStep.buildingId,
        targetFootprints,
        outputLabel: getBuildingOutputLabel(pack, seedStep.buildingId),
        isSyntheticCycleStep: true,
      },
      completedCount: steps.length,
      totalSteps: steps.length,
      isCompleted: false,
      currentStepTargetRects: targetFootprints.map(parseGridRange).filter(Boolean),
      isCurrentStepReady: true,
      waitingText: '',
      targetHighlightVariant: 'green',
      isSyntheticCycleStep: true,
    };
  }

  if (builtBuildings.some((building) => isJobRunning(building, nowMs))) {
    return {
      currentStep: {
        ...seedStep,
        id: `${seedStep.id}__wait_job`,
        isSyntheticCycleStep: true,
      },
      completedCount: steps.length,
      totalSteps: steps.length,
      isCompleted: false,
      currentStepTargetRects: [],
      isCurrentStepReady: false,
      waitingText: 'Очікування завершення виробництва',
      targetHighlightVariant: 'yellow',
      isSyntheticCycleStep: true,
    };
  }

  const targetFootprints = builtBuildings
    .map((building) => normalizeFootprint(building?.footprint))
    .filter(Boolean);

  return {
    currentStep: {
      ...seedStep,
      id: `${seedStep.id}__repeat`,
      targetFootprints,
      isSyntheticCycleStep: true,
    },
    completedCount: steps.length,
    totalSteps: steps.length,
    isCompleted: false,
    currentStepTargetRects: targetFootprints.map(parseGridRange).filter(Boolean),
    isCurrentStepReady: targetFootprints.length > 0,
    waitingText: '',
    targetHighlightVariant: 'green',
    isSyntheticCycleStep: true,
  };
};

const SettlementGamePlanner = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
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
  const [buildPreview, setBuildPreview] = useState(null);
  const [deletePreview, setDeletePreview] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCultureTestingConfigLoading, setIsCultureTestingConfigLoading] = useState(true);
  const [currentTimeMs, setCurrentTimeMs] = useState(Date.now());
  const [activitySchedules, setActivitySchedules] = useState([]);
  const [activityTimeZone, setActivityTimeZone] = useState('UTC');
  const [cultureTestingConfig, setCultureTestingConfig] = useState({ timeScale: 1 });

  useEffect(() => {
    setCurrentTimeMs(Date.now());
    const refreshIntervalMs = cultureTestingConfig.timeScale > 1 ? 1000 : 30000;
    const intervalId = setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, refreshIntervalMs);

    return () => clearInterval(intervalId);
  }, [cultureTestingConfig.timeScale]);

  useEffect(() => {
    const handleDeleteSettlement = async () => {
      const userId = await AsyncStorage.getItem('userId');
      const guildId = await AsyncStorage.getItem('guildId');
      if (!userId || !guildId) return;

      Alert.alert(
        'Підтвердження',
        'Видалити весь прогрес культурного поселення?',
        [
          { text: 'Ні', style: 'cancel' },
          {
            text: 'Так',
            style: 'destructive',
            onPress: async () => {
              try {
                await database().ref(`/users/${userId}/${guildId}/settlement`).remove();
                navigation.navigate('CulturalSettlements');
              } catch (error) {
                console.error('Не вдалося видалити settlement:', error);
              }
            },
          },
        ],
        { cancelable: true }
      );
    };

    navigation.setParams({
      onDeleteSettlement: handleDeleteSettlement,
    });
  }, [navigation]);

  useEffect(() => {
    let isMounted = true;
    let settingRef = null;
    let onSettingValue = null;
    let cultureTestingRef = null;
    let onCultureTestingValue = null;
    let onCultureTestingError = null;
    let settlementRef = null;
    let onValueHandler = null;

    (async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        const guildId = await AsyncStorage.getItem('guildId');
        if (!isMounted) return;

        if (!userId || !guildId) {
          if (isMounted) {
            setOpenedSectorsFromDb([]);
            setObstacleRectsFromDb([]);
            setBuildingRectsFromDb([]);
            setPlacedBuildingsFromDb([]);
            setCultureTestingConfig({ timeScale: 1 });
            setIsCultureTestingConfigLoading(false);
            setPlanStepIndex(0);
            setIsLoading(false);
          }
          return;
        }

        if (isMounted) {
          setIdentity({ userId, guildId });
        }

        settingRef = database().ref(`/users/${userId}/setting`);
        onSettingValue = (snapshot) => {
          const settingData = snapshot.exists() ? snapshot.val() || {} : {};
          const { timeZone, schedules } = getPreferredSchedules(settingData);

          if (isMounted) {
            setActivityTimeZone(timeZone);
            setActivitySchedules(schedules);
          }
        };
        settingRef.on('value', onSettingValue);

        cultureTestingRef = database().ref(`/users/${userId}/${guildId}/culture/testing`);
        onCultureTestingValue = (snapshot) => {
          const testingData = snapshot.exists() ? snapshot.val() || {} : {};
          if (isMounted) {
            setCultureTestingConfig(normalizeCultureTestingConfig(testingData));
            setIsCultureTestingConfigLoading(false);
          }
        };
        onCultureTestingError = (error) => {
          console.warn('Не вдалося завантажити culture testing config:', error);
          if (isMounted) {
            setCultureTestingConfig({ timeScale: 1 });
            setIsCultureTestingConfigLoading(false);
          }
        };
        cultureTestingRef.on('value', onCultureTestingValue, onCultureTestingError);

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
                sector,
                obstacleId: obstacle?.obstacleId || null,
                x: sectorRect.x + x * TILE_SIZE,
                y: sectorRect.y + y * TILE_SIZE,
                width: w * TILE_SIZE,
                height: h * TILE_SIZE,
              });
            });
          });

          const normalizedObstacleRects = nextObstacleRects.map((rect) => ({
            ...rect,
            footprint: absoluteRectToFootprint(rect),
          }));

          const nextBuildingRects = buildingsArr
            .map((building) => ({
              rect: parseGridRange(building?.footprint),
              footprint: normalizeFootprint(building?.footprint),
              buildingId: building?.buildingId || '',
              instanceId: building?.instanceId || '',
            }))
            .filter((item) => item.rect);

          if (isMounted) {
            setOpenedSectorsFromDb(openedArr.filter(Boolean));
            setObstacleRectsFromDb(normalizedObstacleRects);
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
            setActivitySchedules([]);
            setActivityTimeZone('UTC');
            setCultureTestingConfig({ timeScale: 1 });
            setIsCultureTestingConfigLoading(false);
            setPlanStepIndex(0);
            setIsLoading(false);
          }
      }
    })();

    return () => {
      isMounted = false;
      if (settingRef && onSettingValue) {
        settingRef.off('value', onSettingValue);
      }
      if (cultureTestingRef && onCultureTestingValue) {
        cultureTestingRef.off('value', onCultureTestingValue);
      }
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

  const effectiveStarterPlan = useMemo(
    () => expandStarterPlanBuildSteps(starterPlan),
    [starterPlan]
  );

  const { allRects, openedRects } = useMemo(() => {
    const allSectors = pack?.map?.allSectors || [];
    return {
      allRects: allSectors.map(parseSectorRange).filter(Boolean),
      openedRects: openedSectorsFromDb.map(parseSectorRange).filter(Boolean),
    };
  }, [openedSectorsFromDb, pack]);

  const getRecommendedStartProductionDurationSec = (step, startedAtMs = currentTimeMs) => {
    if (!step?.buildingId || getBuildingCategory(pack, step.buildingId) !== 'goods') {
      return getDefaultGoodsProductionDurationSec(pack, step?.buildingId);
    }

    return getRecommendedGoodsProductionDurationSec({
      pack,
      buildingId: step.buildingId,
      startAtMs: startedAtMs,
      schedules: activitySchedules,
      timeZone: activityTimeZone,
    });
  };

  const starterPlanProgress = useMemo(() => {
    if (!effectiveStarterPlan) return null;

    const steps = Array.isArray(effectiveStarterPlan.steps) ? effectiveStarterPlan.steps : [];
    const safeIndex = Math.max(0, Math.min(planStepIndex, steps.length));
    const currentStep = safeIndex < steps.length ? steps[safeIndex] : null;
    const completedCount = safeIndex;
    const isCompleted = safeIndex >= steps.length;

    if (isCompleted) {
      const continuousCycleState = buildContinuousGoodsCycleState({
        plan: effectiveStarterPlan,
        pack,
        placedBuildings: placedBuildingsFromDb,
        nowMs: currentTimeMs,
      });
      if (continuousCycleState) {
        const cycleStep = continuousCycleState.currentStep;
        const recommendedDurationSec =
          cycleStep?.actionType === 'start_production'
            ? getRecommendedStartProductionDurationSec(cycleStep, currentTimeMs)
            : null;
        return {
          ...continuousCycleState,
          currentStep:
            recommendedDurationSec && cycleStep
              ? {
                  ...cycleStep,
                  recommendedProductionDurationSec: recommendedDurationSec,
                  outputLabel: getBuildingOutputLabel(pack, cycleStep.buildingId),
                }
              : cycleStep,
        };
      }
    }

    const currentStepTargetRects = currentStep
      ? getStepTargetFootprints(currentStep).map(parseGridRange).filter(Boolean)
      : [];

    let isCurrentStepReady = true;
    let waitingText = '';
    let displayTargetRects = currentStepTargetRects;
    let targetHighlightVariant = 'yellow';

    if (currentStep?.actionType === 'start_production') {
      const targets = new Set(getStepTargetFootprints(currentStep));
      const matchingBuildings = placedBuildingsFromDb.filter((building) => {
        if (building?.buildingId !== currentStep.buildingId) return false;
        const footprint = normalizeFootprint(building?.footprint);
        return !targets.size || targets.has(footprint);
      });

      const allBuildingsCompleted =
        matchingBuildings.length > 0 &&
        matchingBuildings.every((building) => isConstructionCompleted(building, currentTimeMs));

      if (!allBuildingsCompleted) {
        isCurrentStepReady = false;
        waitingText = 'Очікування завершення будівництва';
        displayTargetRects = [];
      } else {
        targetHighlightVariant = 'green';
      }
    }

    const recommendedDurationSec =
      currentStep?.actionType === 'start_production'
        ? getRecommendedStartProductionDurationSec(currentStep, currentTimeMs)
        : null;
    const displayStep =
      recommendedDurationSec && currentStep
        ? {
            ...currentStep,
            recommendedProductionDurationSec: recommendedDurationSec,
            outputLabel: getBuildingOutputLabel(pack, currentStep.buildingId),
          }
        : currentStep;

    return {
      currentStep: displayStep,
      completedCount,
      totalSteps: steps.length,
      isCompleted,
      currentStepTargetRects: displayTargetRects,
      isCurrentStepReady,
      waitingText,
      targetHighlightVariant,
      isSyntheticCycleStep: false,
    };
  }, [activitySchedules, activityTimeZone, currentTimeMs, effectiveStarterPlan, pack, planStepIndex, placedBuildingsFromDb]);

  useEffect(() => {
    const step = starterPlanProgress?.currentStep;
    if (!step) {
      setMovePreviewRect(null);
      setBuildPreview(null);
      setDeletePreview(null);
      return;
    }

    if (step.actionType === 'build') {
      setMovePreviewRect(null);
      setDeletePreview(null);
      const firstTarget = getStepTargetFootprints(step)[0];
      const targetRect = parseGridRange(firstTarget);
      if (!targetRect) {
        setBuildPreview(null);
        return;
      }

      const color = getStepColor(pack, step);
      let animationFrameId = null;
      const cycleMs = 2000;
      const fadeMs = 1000;
      const cycleStart = Date.now();

      const tick = () => {
        const elapsed = (Date.now() - cycleStart) % cycleMs;
        const strokeOpacity = elapsed <= fadeMs ? elapsed / fadeMs : 1;
        const fillOpacity = elapsed <= fadeMs ? (elapsed / fadeMs) * 0.9 : 0.9;

        setBuildPreview({
          rect: targetRect,
          color,
          strokeOpacity,
          fillOpacity,
        });

        animationFrameId = requestAnimationFrame(tick);
      };

      tick();
      return () => {
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
        }
        setBuildPreview(null);
      };
    }

    if (step.actionType === 'delete' || step.actionType === 'clear_obstacle') {
      setMovePreviewRect(null);
      setBuildPreview(null);
      const firstTarget = getStepTargetFootprints(step)[0];
      const targetRect = parseGridRange(firstTarget);
      if (!targetRect) {
        setDeletePreview(null);
        return;
      }

      const color = getStepColor(pack, step);
      let animationFrameId = null;
      const cycleMs = 2000;
      const fadeMs = 1000;
      const cycleStart = Date.now();

      const tick = () => {
        const elapsed = (Date.now() - cycleStart) % cycleMs;

        if (elapsed <= fadeMs) {
          const t = elapsed / fadeMs;
          const strokeOpacity = 1 - t;
          const fillOpacity = 0.9 * (1 - t);
          setDeletePreview({
            rect: targetRect,
            color,
            strokeOpacity,
            fillOpacity,
          });
        } else {
          setDeletePreview(null);
        }

        animationFrameId = requestAnimationFrame(tick);
      };

      tick();
      return () => {
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
        }
        setDeletePreview(null);
      };
    }

    if (step.actionType !== 'move') {
      setMovePreviewRect(null);
      setBuildPreview(null);
      setDeletePreview(null);
      return;
    }

    setBuildPreview(null);
    setDeletePreview(null);
    const fromRect = parseGridRange(step.from);
    const toRect = parseGridRange(step.to);
    if (!fromRect || !toRect) {
      setMovePreviewRect(null);
      return;
    }

    const isSameFromTo =
      fromRect.x === toRect.x &&
      fromRect.y === toRect.y &&
      fromRect.width === toRect.width &&
      fromRect.height === toRect.height;

    const visualToRect = isSameFromTo
      ? {
          ...toRect,
          x: toRect.x + Math.max(6, Math.round(toRect.width * 0.35)),
        }
      : toRect;

    let animationFrameId = null;
    const cycleMs = 2000;
    const moveMs = 1000;
    const cycleStart = Date.now();

    const tick = () => {
      const elapsed = (Date.now() - cycleStart) % cycleMs;

      if (elapsed <= moveMs) {
        const t = elapsed / moveMs;
        setMovePreviewRect({
          x: fromRect.x + (visualToRect.x - fromRect.x) * t,
          y: fromRect.y + (visualToRect.y - fromRect.y) * t,
          width: fromRect.width + (visualToRect.width - fromRect.width) * t,
          height: fromRect.height + (visualToRect.height - fromRect.height) * t,
        });
      } else {
        if (elapsed < moveMs + 120) {
          setMovePreviewRect(null);
        } else {
          setMovePreviewRect({
            x: fromRect.x,
            y: fromRect.y,
            width: fromRect.width,
            height: fromRect.height,
          });
        }
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
  }, [starterPlanProgress?.currentStep?.id, pack]);

  const handleCompleteCurrentTask = async () => {
    if (!effectiveStarterPlan || !starterPlanProgress?.currentStep || isCompletingStep) return;
    if (!identity.userId || !identity.guildId) return;

    const step = starterPlanProgress.currentStep;
    if (isObstacleDeleteStep(step) && step.actionType !== 'delete' && step.actionType !== 'clear_obstacle') {
      setActionError('Перешкоди можна лише видаляти.');
      return;
    }
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

      if (step.actionType === 'build') {
        const targets = getStepTargetFootprints(step);
        const existingKeys = new Set(
          nextPlacedBuildings.map((building) => `${building?.buildingId || ''}|${normalizeFootprint(building?.footprint) || ''}`)
        );
        const buildStartedAt = Date.now();
        const buildTimeSec = scaleCultureDurationSec(
          getBuildingBuildTimeSec(pack, step.buildingId),
          cultureTestingConfig
        );
        const category = getBuildingCategory(pack, step.buildingId);
        const buildingName = getBuildingDisplayName(pack, step.buildingId);
        const shouldTrackConstruction = shouldTrackConstructionTimers(pack, step.buildingId);
        const currency = getBuildingCurrency(pack, step.buildingId);
        const outputLabel = getBuildingOutputLabel(pack, step.buildingId);
        const passiveDurationSec = scaleCultureDurationSec(
          category === 'residential' ? getFirstCoinRecipeDurationSec(pack, step.buildingId) : 0,
          cultureTestingConfig
        );

        targets.forEach((targetFootprint, idx) => {
          const key = `${step.buildingId}|${targetFootprint}`;
          if (existingKeys.has(key)) return;
          nextPlacedBuildings.push({
            instanceId: `${step.buildingId}_${Date.now()}_${idx}`,
            buildingId: step.buildingId,
            footprint: targetFootprint,
            rotation: 0,
            placedAt: buildStartedAt,
            passive: null,
            job: null,
            construction: shouldTrackConstruction
              ? {
                  startedAt: buildStartedAt,
                  endsAt: buildStartedAt + buildTimeSec * 1000,
                  buildTimeSec,
                  buildingId: step.buildingId,
                  buildingName,
                  category,
                  currency: currency || null,
                  outputLabel: outputLabel || null,
                  passiveDurationSec,
                  notifyBuildCompletion: shouldNotifyBuildCompletion(pack, step.buildingId),
                }
              : null,
          });
          existingKeys.add(key);
        });
      }

      if (step.actionType === 'delete' || step.actionType === 'clear_obstacle') {
        const targets = new Set(getStepTargetFootprints(step));
        if (isObstacleDeleteStep(step)) {
          const remainingObstacles = obstacleRectsFromDb.filter(
            (obstacle) => !targets.has(obstacle.footprint)
          );

          const groupedBySector = {};
          remainingObstacles.forEach((obstacle, index) => {
            const sector = obstacle?.sector;
            if (!sector) return;
            const sectorMeta = parseRangeMeta(sector);
            if (!sectorMeta) return;

            const absoluteX = Math.round(obstacle.x / TILE_SIZE);
            const absoluteY = Math.round(obstacle.y / TILE_SIZE);
            const localX = absoluteX - (sectorMeta.startCol - 1);
            const localY = absoluteY - (sectorMeta.startRow - 1);
            const w = Math.round(obstacle.width / TILE_SIZE);
            const h = Math.round(obstacle.height / TILE_SIZE);

            if (!groupedBySector[sector]) groupedBySector[sector] = [];
            groupedBySector[sector].push({
              obstacleId: obstacle.obstacleId || `obs_${index + 1}`,
              x: localX,
              y: localY,
              w,
              h,
            });
          });

          await database().ref(`${settlementPath}/sectorObstaclesStatic`).set(groupedBySector);
          setObstacleRectsFromDb(remainingObstacles);
        } else {
          nextPlacedBuildings = nextPlacedBuildings.filter((building) => {
            if (building?.buildingId !== step.buildingId) return true;
            const footprint = normalizeFootprint(building?.footprint);
            return !targets.has(footprint);
          });
        }
      }

      if (step.actionType === 'start_production') {
        const productionStartedAt = Date.now();
        const plannedGoodsDurationSec =
          step?.recommendedProductionDurationSec ||
          (step.buildingId ? getRecommendedStartProductionDurationSec(step, productionStartedAt) : 18000);
        const defaultGoodsDurationSec = scaleCultureDurationSec(
          plannedGoodsDurationSec,
          cultureTestingConfig
        );
        const outputLabel = getBuildingOutputLabel(pack, step.buildingId);
        const buildingName = getBuildingDisplayName(pack, step.buildingId);
        const targets = new Set(getStepTargetFootprints(step));
        nextPlacedBuildings = nextPlacedBuildings.map((building) => {
          if (building?.buildingId !== step.buildingId) return building;
          const footprint = normalizeFootprint(building?.footprint);
          if (!targets.size || targets.has(footprint)) {
            const constructionEndsAt = Number(building?.construction?.endsAt) || 0;
            const shouldMarkBuildComplete =
              constructionEndsAt > 0 &&
              productionStartedAt >= constructionEndsAt &&
              !Number(building?.construction?.notifications?.build_complete);

            return {
              ...building,
              construction: shouldMarkBuildComplete
                ? {
                    ...building.construction,
                    notifications: {
                      ...(building?.construction?.notifications || {}),
                      build_complete: productionStartedAt,
                    },
                  }
                : building?.construction || null,
              job: {
                startedAt: productionStartedAt,
                endsAt: productionStartedAt + defaultGoodsDurationSec * 1000,
                durationSec: defaultGoodsDurationSec,
                outputLabel: outputLabel || null,
                buildingName,
              },
            };
          }
          return building;
        });
      }

      if (step.actionType === 'collect') {
        const collectedAt = Date.now();
        const targets = new Set(getStepTargetFootprints(step));
        nextPlacedBuildings = nextPlacedBuildings.map((building) => {
          if (building?.buildingId !== step.buildingId) return building;
          const footprint = normalizeFootprint(building?.footprint);
          if (targets.size && !targets.has(footprint)) return building;
          if (!isJobReadyToCollect(building, collectedAt)) return building;

          return {
            ...building,
            job: null,
          };
        });
      }

      const nextStepIndex = starterPlanProgress.isSyntheticCycleStep
        ? starterPlanProgress.completedCount
        : Math.min(starterPlanProgress.completedCount + 1, starterPlanProgress.totalSteps);

      await database().ref(settlementPath).update({
        placedBuildings: nextPlacedBuildings,
        starterPlanProgress: {
          planId: effectiveStarterPlan.id,
          currentStepIndex: nextStepIndex,
          updatedAt: Date.now(),
        },
      });

      const nextBuildingRects = nextPlacedBuildings
        .map((building) => ({
          rect: parseGridRange(building?.footprint),
          footprint: normalizeFootprint(building?.footprint),
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
  const mapBounds = useMemo(
    () => getBoundsWithGridHeaders(bounds, TILE_SIZE),
    [bounds],
  );
  const mapHeight = screenWidth * (mapBounds.height / mapBounds.width);

  if (isLoading || isCultureTestingConfigLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const activeMoveStep =
    starterPlanProgress?.currentStep?.actionType === 'move' ? starterPlanProgress.currentStep : null;
  const activeBuildStep =
    starterPlanProgress?.currentStep?.actionType === 'build' ? starterPlanProgress.currentStep : null;
  const activeDeleteStep =
    (starterPlanProgress?.currentStep?.actionType === 'delete' ||
      starterPlanProgress?.currentStep?.actionType === 'clear_obstacle')
      ? starterPlanProgress.currentStep
      : null;
  const moveFromFootprint = normalizeFootprint(activeMoveStep?.from);
  const deleteTargets = new Set(getStepTargetFootprints(activeDeleteStep));

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Планувальник: {settlementName || '—'}</Text>
      <Svg
        width={screenWidth}
        height={mapHeight}
        viewBox={`${mapBounds.x} ${mapBounds.y} ${mapBounds.width} ${mapBounds.height}`}
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

          {obstacleRectsFromDb
            .filter((rect) => {
              if (!activeDeleteStep || !isObstacleDeleteStep(activeDeleteStep)) return true;
              return !deleteTargets.has(rect.footprint);
            })
            .map((rect, idx) => (
            <Rect
              key={`g-obstacle-${idx}`}
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              fill="#4A4A4A"
            />
          ))}

          {buildingRectsFromDb
            .filter((building) => {
              if (!activeMoveStep) return true;
              if (building.buildingId !== activeMoveStep.buildingId) return true;
              if (building.footprint === moveFromFootprint) return false;
              return true;
            })
            .filter((building) => {
              if (!activeDeleteStep) return true;
              if (building.buildingId !== activeDeleteStep.buildingId) return true;
              return !deleteTargets.has(building.footprint);
            })
            .map((building, idx) => (
            <Rect
              key={`g-building-${building.instanceId || idx}`}
              x={building.rect.x}
              y={building.rect.y}
              width={building.rect.width}
              height={building.rect.height}
              fill={hexToRgba(getBuildingColor(pack, building.buildingId), 0.9)}
              stroke="#000000"
              strokeWidth={1}
            />
          ))}

          {!activeMoveStep && !activeBuildStep && !activeDeleteStep &&
            (starterPlanProgress?.currentStepTargetRects || []).map((rect, idx) => (
            <Rect
              key={`g-target-${idx}`}
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              fill={
                starterPlanProgress?.targetHighlightVariant === 'green'
                  ? 'rgba(76, 175, 80, 0.2)'
                  : 'rgba(255, 235, 59, 0.2)'
              }
              stroke={
                starterPlanProgress?.targetHighlightVariant === 'green'
                  ? '#4CAF50'
                  : '#FFEB3B'
              }
              strokeWidth={1.5}
            />
          ))}

          {movePreviewRect ? (
            <Rect
              x={movePreviewRect.x}
              y={movePreviewRect.y}
              width={movePreviewRect.width}
              height={movePreviewRect.height}
              fill={hexToRgba(getBuildingColor(pack, activeMoveStep?.buildingId), 0.9)}
              stroke="#000000"
              strokeWidth={1.5}
            />
          ) : null}

          {buildPreview ? (
            <Rect
              x={buildPreview.rect.x}
              y={buildPreview.rect.y}
              width={buildPreview.rect.width}
              height={buildPreview.rect.height}
              fill={hexToRgba(buildPreview.color, buildPreview.fillOpacity)}
              stroke={hexToRgba('#000000', buildPreview.strokeOpacity)}
              strokeWidth={1.5}
            />
          ) : null}

          {deletePreview ? (
            <Rect
              x={deletePreview.rect.x}
              y={deletePreview.rect.y}
              width={deletePreview.rect.width}
              height={deletePreview.rect.height}
              fill={hexToRgba(deletePreview.color, deletePreview.fillOpacity)}
              stroke={hexToRgba('#000000', deletePreview.strokeOpacity)}
              strokeWidth={1.5}
            />
          ) : null}
        </G>
        <SettlementMapGridHeaders bounds={bounds} tileSize={TILE_SIZE} />
      </Svg>

      <View style={styles.taskRow}>
        <Text style={styles.taskText}>
          {!effectiveStarterPlan
            ? 'Для цього поселення стартовий план не задано.'
            : starterPlanProgress?.isCompleted
            ? 'Стартовий план завершено.'
            : !starterPlanProgress?.isCurrentStepReady
            ? starterPlanProgress?.waitingText
            : formatTaskText(starterPlanProgress?.currentStep, pack, t)}
        </Text>
        {starterPlanProgress?.isCurrentStepReady ? (
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
        ) : null}
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
