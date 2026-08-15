import AsyncStorage from "@react-native-async-storage/async-storage";
import database from "@react-native-firebase/database";
import { useNavigation, useRoute } from "@react-navigation/native";
import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  PanResponder,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";
import AlarmClockIcon from "../ico/alarm-clock.svg";
import BedIcon from "../ico/bed.svg";

const TOTAL_MINUTES = 24 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const ROLLING_ANCHOR_AT = 1767484800;
const ROLLING_ANCHOR_DATE = "2026-01-04";
const ROLLING_SCHEDULE_VERSION = 2;

const THEME = {
  background: "#0f1115",
  surface: "#1c1c1c",
  ring: "#242424",
  dial: "#151515",
  tickMajor: "#4b4b4b",
  tickMinor: "#2f2f2f",
  textPrimary: "#f5f5f5",
  textSecondary: "#b0b0b0",
  accent: "#4ea1ff",
};

// ---- helpers for stable keys (NO numeric-only keys) ----
const weeklyDayKey = (dayIndex) => `d${dayIndex}`; // 0..6
const rollingWeekKey = (weekIndex) => `w${weekIndex}`;
const rollingDayKey = (dayIndex) => `d${dayIndex}`;

// Accept both new and legacy keys
const parseDayIndexKey = (key) => {
  if (typeof key !== "string") return null;
  if (key.startsWith("d")) {
    const n = Number(key.slice(1));
    return Number.isFinite(n) ? n : null;
  }
  // legacy numeric keys: "0".."6"
  const n = Number(key);
  return Number.isFinite(n) ? n : null;
};

const parseWeekIndexKey = (key) => {
  if (typeof key !== "string") return null;
  if (key.startsWith("w")) {
    const n = Number(key.slice(1));
    return Number.isFinite(n) ? n : null;
  }
  // legacy numeric keys: "0","1","2",...
  const n = Number(key);
  return Number.isFinite(n) ? n : null;
};

/** -90° (-Math.PI/2) => 00:00, 360° => 24:00 */
const formatTimeFromAngle = (angle) => {
  let adjusted = angle + Math.PI / 2;
  if (adjusted < 0) adjusted += 2 * Math.PI;
  const fraction = adjusted / (2 * Math.PI);
  const totalMins = Math.round(fraction * TOTAL_MINUTES);
  const hh = Math.floor(totalMins / 60);
  const mm = totalMins % 60;
  return `${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
};

const angleToMinutes = (angle) => {
  let adjusted = angle + Math.PI / 2;
  if (adjusted < 0) adjusted += 2 * Math.PI;
  const fraction = adjusted / (2 * Math.PI);
  return Math.round(fraction * TOTAL_MINUTES);
};

const timeToAngle = (time) => {
  const [hours, minutes] = time.split(":").map((value) => Number(value));
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59) return null;
  const totalMinutes = Math.min(hours * 60 + minutes, TOTAL_MINUTES);
  const fraction = totalMinutes / TOTAL_MINUTES;
  return fraction * 2 * Math.PI - Math.PI / 2;
};

const normalizeTimeInput = (value) => {
  const cleaned = value.replace(/[^\d:]/g, "");
  if (cleaned.length <= 2) return cleaned;
  if (!cleaned.includes(":")) {
    return `${cleaned.slice(0, 2)}:${cleaned.slice(2, 4)}`;
  }
  return cleaned;
};

const createRangeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const getDeviceTimeZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const getCalendarOrdinalForTimestamp = (timestampMs, timeZone) => {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timeZone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const values = {};
  formatter.formatToParts(new Date(timestampMs)).forEach((part) => {
    values[part.type] = part.value;
  });
  return Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day)
  );
};

const dateKeyToCalendarOrdinal = (dateKey) => {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};

const calendarOrdinalToDateKey = (ordinal) => {
  const date = new Date(ordinal);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getUTCDate()).padStart(2, "0")}`;
};

const getZonedLocalMidnightMs = (dateKey, timeZone) => {
  const desiredLocalAsUtc = dateKeyToCalendarOrdinal(dateKey);
  let candidate = desiredLocalAsUtc;

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const values = {};
    formatter.formatToParts(new Date(candidate)).forEach((part) => {
      values[part.type] = part.value;
    });
    const rawHour = Number(values.hour);
    const representedLocalAsUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      rawHour === 24 ? 0 : rawHour,
      Number(values.minute)
    );
    const correction = representedLocalAsUtc - desiredLocalAsUtc;
    candidate -= correction;
    if (correction === 0) break;
  }

  return candidate;
};

const getLegacyRollingDiffDays = (dateKey, anchorAt, timeZone) =>
  Math.floor(
    (getZonedLocalMidnightMs(dateKey, timeZone) -
      Number(anchorAt) * 1000) /
      DAY_MS
  );

const legacyRollingDiffDaysToDateKey = (
  diffDays,
  anchorAt,
  timeZone
) => {
  const anchorOrdinal = getCalendarOrdinalForTimestamp(
    Number(anchorAt) * 1000,
    timeZone
  );

  for (let offset = -3; offset <= 3; offset += 1) {
    const candidateKey = calendarOrdinalToDateKey(
      anchorOrdinal + (diffDays + offset) * DAY_MS
    );
    if (
      getLegacyRollingDiffDays(candidateKey, anchorAt, timeZone) ===
      diffDays
    ) {
      return candidateKey;
    }
  }

  return calendarOrdinalToDateKey(anchorOrdinal + diffDays * DAY_MS);
};

const daysOfWeek = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
const monthNames = [
  "Січень",
  "Лютий",
  "Березень",
  "Квітень",
  "Травень",
  "Червень",
  "Липень",
  "Серпень",
  "Вересень",
  "Жовтень",
  "Листопад",
  "Грудень",
];

const resolveTimeRange = (slots) => {
  if (!slots || !slots.length) return null;

  const primary = slots.find((slot) => slot.part === "full") || slots[0];
  if (!primary) return null;

  if (primary.part === "full") {
    return { start: primary.startMinutes, end: primary.endMinutes };
  }

  if (primary.part === "head") {
    const tail = slots.find((slot) => slot.rangeId === primary.rangeId && slot.part === "tail");
    return { start: primary.startMinutes, end: tail?.endMinutes ?? primary.endMinutes };
  }

  if (primary.part === "tail") {
    const head = slots.find((slot) => slot.rangeId === primary.rangeId && slot.part === "head");
    return { start: head?.startMinutes ?? primary.startMinutes, end: primary.endMinutes };
  }

  return null;
};

// Normalize weekly to a stable object with d0..d6 keys
const normalizeWeeklyToDKeys = (weeklyRaw) => {
  // weeklyRaw can be:
  // - array: [null, [...], [...]]
  // - object with numeric keys: { "1": [...], "2": [...] }
  // - object with d-keys: { "d1": [...], "d2": [...] }

  const out = {}; // d0..d6 only if present

  if (!weeklyRaw) return out;

  // Case A: Array
  if (Array.isArray(weeklyRaw)) {
    for (let i = 0; i < weeklyRaw.length; i += 1) {
      const daySlots = weeklyRaw[i];
      if (!daySlots || !Array.isArray(daySlots) || !daySlots.length) continue;
      out[weeklyDayKey(i)] = daySlots;
    }
    return out;
  }

  // Case B: Object
  if (typeof weeklyRaw === "object") {
    Object.keys(weeklyRaw).forEach((k) => {
      const dayIndex = parseDayIndexKey(k);
      if (dayIndex === null) return;
      const daySlots = weeklyRaw[k];
      if (!daySlots || !Array.isArray(daySlots) || !daySlots.length) return;
      out[weeklyDayKey(dayIndex)] = daySlots;
    });
  }

  return out;
};

// Normalize rollingWeeks weeks/days to wX/dY keys internally (for reading)
const normalizeRollingWeeksKeys = (rollingWeeksRaw) => {
  if (!rollingWeeksRaw || typeof rollingWeeksRaw !== "object") return null;
  const anchorAt = rollingWeeksRaw.anchorAt || ROLLING_ANCHOR_AT;
  const anchorDate = rollingWeeksRaw.anchorDate || "";
  const version = Number(rollingWeeksRaw.version) || 1;
  const weeksRaw = rollingWeeksRaw.weeks;

  const weeksOut = {};
  if (!weeksRaw || typeof weeksRaw !== "object") {
    return { anchorAt, anchorDate, version, weeks: weeksOut };
  }

  Object.keys(weeksRaw).forEach((wk) => {
    const wIndex = parseWeekIndexKey(wk);
    if (wIndex === null) return;

    const weekObj = weeksRaw[wk];
    const daysRaw = weekObj?.days;
    const wKey = rollingWeekKey(wIndex);

    if (!weeksOut[wKey]) weeksOut[wKey] = { days: {} };
    if (!daysRaw || typeof daysRaw !== "object") return;

    Object.keys(daysRaw).forEach((dk) => {
      const dIndex = parseDayIndexKey(dk);
      if (dIndex === null) return;
      const dKey = rollingDayKey(dIndex);
      const slots = daysRaw[dk];
      if (!Array.isArray(slots) || !slots.length) return;
      weeksOut[wKey].days[dKey] = slots;
    });
  });

  return { anchorAt, anchorDate, version, weeks: weeksOut };
};

const SleepSchedule = () => {
  const { width } = Dimensions.get("window");
  const navigation = useNavigation();
  const route = useRoute();
  const scheduleIdParam = route.params?.scheduleId ?? null;

  // main sizes
  const redDiameter = width;
  const innerDiameter = width - 40;
  const smallDiameter = width - 100;

  // center
  const cx = redDiameter / 2;
  const cy = redDiameter / 2;

  // ring radii
  const R1 = innerDiameter / 2;
  const R2 = smallDiameter / 2;

  const ringPath = `
    M ${cx} ${cy - R1}
    A ${R1} ${R1} 0 1 1 ${cx} ${cy + R1}
    A ${R1} ${R1} 0 1 1 ${cx} ${cy - R1}
    M ${cx} ${cy - R2}
    A ${R2} ${R2} 0 1 0 ${cx} ${cy + R2}
    A ${R2} ${R2} 0 1 0 ${cx} ${cy - R2}
    Z
  `;

  // angles
  const [greenStartAngle, setGreenStartAngle] = useState(-Math.PI / 2);
  const [greenEndAngle, setGreenEndAngle] = useState(-Math.PI / 2 + (120 * Math.PI) / 180);

  // which handle (optional, just to avoid crash in onPress)
  const [activeHandle, setActiveHandle] = useState(null);

  // handle coords
  const fixedDistance = R1 - 15;
  const greenX1 = cx + fixedDistance * Math.cos(greenStartAngle);
  const greenY1 = cy + fixedDistance * Math.sin(greenStartAngle);
  const greenX2 = cx + fixedDistance * Math.cos(greenEndAngle);
  const greenY2 = cy + fixedDistance * Math.sin(greenEndAngle);

  // arc
  let angleDiff = greenEndAngle - greenStartAngle;
  if (angleDiff < 0) angleDiff += 2 * Math.PI;
  const largeArcFlag = angleDiff > Math.PI ? 1 : 0;

  const outerStartX = cx + R1 * Math.cos(greenStartAngle);
  const outerStartY = cy + R1 * Math.sin(greenStartAngle);
  const outerEndX = cx + R1 * Math.cos(greenEndAngle);
  const outerEndY = cy + R1 * Math.sin(greenEndAngle);
  const innerEndX = cx + R2 * Math.cos(greenEndAngle);
  const innerEndY = cy + R2 * Math.sin(greenEndAngle);
  const innerStartX = cx + R2 * Math.cos(greenStartAngle);
  const innerStartY = cy + R2 * Math.sin(greenStartAngle);

  const d = `
    M ${outerStartX} ${outerStartY}
    A ${R1} ${R1} 0 ${largeArcFlag} 1 ${outerEndX} ${outerEndY}
    L ${innerEndX} ${innerEndY}
    A ${R2} ${R2} 0 ${largeArcFlag} 0 ${innerStartX} ${innerStartY}
    Z
  `;

  // handle active
  const [isGreenStartActive, setIsGreenStartActive] = useState(false);
  const [isGreenEndActive, setIsGreenEndActive] = useState(false);

  const greenStartPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setIsGreenStartActive(true);
        setActiveHandle("start");
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const newAngle = Math.atan2(locationY - cy, locationX - cx);
        setGreenStartAngle(newAngle);
      },
      onPanResponderRelease: () => {
        setIsGreenStartActive(false);
      },
      onPanResponderTerminate: () => {
        setIsGreenStartActive(false);
      },
    })
  ).current;

  const greenEndPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setIsGreenEndActive(true);
        setActiveHandle("end");
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const newAngle = Math.atan2(locationY - cy, locationX - cx);
        setGreenEndAngle(newAngle);
      },
      onPanResponderRelease: () => {
        setIsGreenEndActive(false);
      },
      onPanResponderTerminate: () => {
        setIsGreenEndActive(false);
      },
    })
  ).current;

  // handle size
  const startDiameter = isGreenStartActive ? 40 : 30;
  const endDiameter = isGreenEndActive ? 40 : 30;
  const startRadiusControl = startDiameter / 2;
  const endRadiusControl = endDiameter / 2;

  // icon sizes
  const ICON_SCALE = 0.7;
  const startIconSize = startDiameter * ICON_SCALE;
  const endIconSize = endDiameter * ICON_SCALE;
  const startIconOffset = startIconSize / 2;
  const endIconOffset = endIconSize / 2;

  const ICON_POSITION_SHIFT_X = 0;
  const ICON_POSITION_SHIFT_Y = 0;

  const renderMinuteTicks = () => {
    const ticks = [];
    const markRadius = smallDiameter / 2 - 10;
    const totalTicks = 144;
    for (let i = 0; i < totalTicks; i++) {
      if (i % 6 === 0) continue;
      const angle = i * 10 * (2 * Math.PI / 1440) - Math.PI / 2;
      const innerTick = markRadius - 3;
      const outerTick = markRadius + 3;
      const tx1 = cx + innerTick * Math.cos(angle);
      const ty1 = cy + innerTick * Math.sin(angle);
      const tx2 = cx + outerTick * Math.cos(angle);
      const ty2 = cy + outerTick * Math.sin(angle);
      ticks.push(
        <Line
          key={`min-tick-${i}`}
          x1={tx1}
          y1={ty1}
          x2={tx2}
          y2={ty2}
          stroke={THEME.tickMinor}
          strokeWidth={1}
        />
      );
    }
    return ticks;
  };

  const renderHourlyTicks = () => {
    const ticks = [];
    const markRadius = smallDiameter / 2 - 10;
    for (let hour = 0; hour < 24; hour++) {
      if ([0, 6, 12, 18].includes(hour)) continue;
      const angle = (hour / 24) * 2 * Math.PI - Math.PI / 2;
      const tickLength = 8;
      const innerTick = markRadius - tickLength / 2;
      const outerTick = markRadius + tickLength / 2;
      const tx1 = cx + innerTick * Math.cos(angle);
      const ty1 = cy + innerTick * Math.sin(angle);
      const tx2 = cx + outerTick * Math.cos(angle);
      const ty2 = cy + outerTick * Math.sin(angle);
      ticks.push(
        <Line
          key={`hour-tick-${hour}`}
          x1={tx1}
          y1={ty1}
          x2={tx2}
          y2={ty2}
          stroke={THEME.tickMajor}
          strokeWidth={2}
        />
      );
    }
    return ticks;
  };

  const renderMajorMarks = () => {
    const marks = [];
    const markRadius = smallDiameter / 2 - 10;
    const majorHours = [0, 6, 12, 18];
    majorHours.forEach((hour) => {
      const angle = (hour / 24) * 2 * Math.PI - Math.PI / 2;
      const tx = cx + markRadius * Math.cos(angle);
      const ty = cy + markRadius * Math.sin(angle);
      marks.push(
        <SvgText
          key={`major-${hour}`}
          x={tx}
          y={ty}
          fill={THEME.textSecondary}
          fontSize={14}
          fontWeight="bold"
          textAnchor="middle"
          alignmentBaseline="middle"
        >
          {hour}
        </SvgText>
      );
    });
    return marks;
  };

  // week/month selection
  const [selectedDays, setSelectedDays] = useState([0, 1, 2, 3, 4]);
  const [notificationTimeZone, setNotificationTimeZone] = useState(
    getDeviceTimeZone
  );
  const [viewMode, setViewMode] = useState("week");
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDates, setSelectedDates] = useState([]);

  const [startTimeInput, setStartTimeInput] = useState(formatTimeFromAngle(greenStartAngle));
  const [endTimeInput, setEndTimeInput] = useState(formatTimeFromAngle(greenEndAngle));

  useEffect(() => {
    let isActive = true;

    const loadNotificationTimeZone = async () => {
      try {
        const userId = await AsyncStorage.getItem("userId");
        if (!userId) return;
        const snapshot = await database()
          .ref(`users/${userId}/setting/timeZone`)
          .once("value");
        const storedTimeZone = snapshot.exists()
          ? String(snapshot.val() || "").trim()
          : "";
        if (isActive && storedTimeZone) {
          setNotificationTimeZone(storedTimeZone);
        }
      } catch (error) {
        console.error(error);
      }
    };

    loadNotificationTimeZone();
    return () => {
      isActive = false;
    };
  }, []);

  const toggleDay = (idx) => {
    setSelectedDays((prev) => (prev.includes(idx) ? prev.filter((d0) => d0 !== idx) : [...prev, idx]));
  };

  const getMonthDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-based grid

    const cells = [];
    for (let i = 0; i < firstDayIndex; i += 1) cells.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
    while (cells.length % 7 !== 0) cells.push(null);

    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  };

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const isPrevMonthDisabled =
    new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1) < currentMonthStart;

  const handlePrevMonth = () => {
    if (isPrevMonthDisabled) return;
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const toggleDate = (dateKey) => {
    setSelectedDates((prev) => (prev.includes(dateKey) ? prev.filter((x) => x !== dateKey) : [...prev, dateKey]));
  };

  useEffect(() => {
    setStartTimeInput(formatTimeFromAngle(greenStartAngle));
  }, [greenStartAngle]);

  useEffect(() => {
    setEndTimeInput(formatTimeFromAngle(greenEndAngle));
  }, [greenEndAngle]);

  const handleStartTimeChange = (value) => {
    const normalized = normalizeTimeInput(value);
    setStartTimeInput(normalized);
    if (normalized.length < 4) return;
    const angle = timeToAngle(normalized);
    if (angle === null) return;
    setGreenStartAngle(angle);
  };

  const handleEndTimeChange = (value) => {
    const normalized = normalizeTimeInput(value);
    setEndTimeInput(normalized);
    if (normalized.length < 4) return;
    const angle = timeToAngle(normalized);
    if (angle === null) return;
    setGreenEndAngle(angle);
  };

  // ---- BUILDERS (write new stable keys) ----
  const buildWeeklySchedule = (startMinutes, endMinutes, scheduleId) => {
    const weekly = {};

    const addSlot = (dayIndex, slot) => {
      const key = weeklyDayKey(dayIndex); // d0..d6
      if (!weekly[key]) weekly[key] = [];
      weekly[key].push(slot);
    };

    selectedDays.forEach((dayIndex) => {
      const rangeId = createRangeId();

      if (endMinutes > startMinutes) {
        addSlot(dayIndex, { startMinutes, endMinutes, rangeId, part: "full", scheduleId });
        return;
      }

      // split to head + tail (so it’s clearly "перехід в іншу добу")
      addSlot(dayIndex, {
        startMinutes,
        endMinutes: TOTAL_MINUTES,
        rangeId,
        part: "head",
        scheduleId,
      });

      addSlot((dayIndex + 1) % 7, {
        startMinutes: 0,
        endMinutes,
        rangeId,
        part: "tail",
        scheduleId,
      });
    });

    return weekly;
  };

  const buildRollingWeeksSchedule = (startMinutes, endMinutes, scheduleId) => {
    const rollingWeeks = {
      anchorAt: ROLLING_ANCHOR_AT,
      anchorDate: ROLLING_ANCHOR_DATE,
      version: ROLLING_SCHEDULE_VERSION,
      weeks: {},
    };
    const anchorOrdinal = dateKeyToCalendarOrdinal(
      ROLLING_ANCHOR_DATE
    );

    const addSlot = (weekIndex, dayIndex, slot) => {
      const wKey = rollingWeekKey(weekIndex); // w0,w1...
      const dKey = rollingDayKey(dayIndex); // d0..d6

      if (!rollingWeeks.weeks[wKey]) rollingWeeks.weeks[wKey] = { days: {} };
      if (!rollingWeeks.weeks[wKey].days[dKey]) rollingWeeks.weeks[wKey].days[dKey] = [];
      rollingWeeks.weeks[wKey].days[dKey].push(slot);
    };

    selectedDates.forEach((dateKey) => {
      const rangeId = createRangeId();
      const dateOrdinal = dateKeyToCalendarOrdinal(dateKey);
      const diffDays = Math.round((dateOrdinal - anchorOrdinal) / DAY_MS);
      const weekIndex = Math.floor(diffDays / 7);
      const dayIndex = ((diffDays % 7) + 7) % 7;

      if (endMinutes > startMinutes) {
        addSlot(weekIndex, dayIndex, { startMinutes, endMinutes, rangeId, part: "full", scheduleId });
        return;
      }

      addSlot(weekIndex, dayIndex, {
        startMinutes,
        endMinutes: TOTAL_MINUTES,
        rangeId,
        part: "head",
        scheduleId,
      });

      // tail into next day (might jump to next week)
      if (dayIndex === 6) {
        addSlot(weekIndex + 1, 0, { startMinutes: 0, endMinutes, rangeId, part: "tail", scheduleId });
      } else {
        addSlot(weekIndex, dayIndex + 1, { startMinutes: 0, endMinutes, rangeId, part: "tail", scheduleId });
      }
    });

    return rollingWeeks;
  };

  // ---- LOAD EXISTING SCHEDULE (supports old + new formats) ----
  useEffect(() => {
    let scheduleRef;
    let isActive = true;

    const loadSchedule = async () => {
      if (!scheduleIdParam) return;

      try {
        const userId = await AsyncStorage.getItem("userId");
        if (!userId) return;

        scheduleRef = database().ref(`users/${userId}/setting/schedules/${scheduleIdParam}`);

        scheduleRef.once("value", (snapshot) => {
          if (!isActive || !snapshot.exists()) return;

          const scheduleData = snapshot.val();

          // WEEKLY
          if (scheduleData?.weekly) {
            const weeklyNormalized = normalizeWeeklyToDKeys(scheduleData.weekly);

            const dayKeys = Object.keys(weeklyNormalized)
              .map((k) => parseDayIndexKey(k))
              .filter((n) => Number.isFinite(n))
              .sort((a, b) => a - b);

            const slots = dayKeys.flatMap((dayIndex) => weeklyNormalized[weeklyDayKey(dayIndex)] || []);
            const range = resolveTimeRange(slots);

            if (range) {
              const startAngle = (range.start / TOTAL_MINUTES) * 2 * Math.PI - Math.PI / 2;
              const endAngle = (range.end / TOTAL_MINUTES) * 2 * Math.PI - Math.PI / 2;
              setGreenStartAngle(startAngle);
              setGreenEndAngle(endAngle);
            }

            setSelectedDays(dayKeys);
            setViewMode("week");
            return;
          }

          // ROLLING WEEKS
          if (scheduleData?.rollingWeeks?.weeks) {
            const rollingNormalized = normalizeRollingWeeksKeys(scheduleData.rollingWeeks);
            if (!rollingNormalized) return;

            const weeksEntries = Object.entries(rollingNormalized.weeks);

            const slots = weeksEntries.flatMap(([, week]) =>
              Object.values(week.days || {}).flatMap((daySlots) => daySlots || [])
            );

            const range = resolveTimeRange(slots);
            if (range) {
              const startAngle = (range.start / TOTAL_MINUTES) * 2 * Math.PI - Math.PI / 2;
              const endAngle = (range.end / TOTAL_MINUTES) * 2 * Math.PI - Math.PI / 2;
              setGreenStartAngle(startAngle);
              setGreenEndAngle(endAngle);
            }

            const anchorOrdinal = rollingNormalized.anchorDate
              ? dateKeyToCalendarOrdinal(rollingNormalized.anchorDate)
              : null;
            const dateKeys = new Set();

            weeksEntries.forEach(([wKey, week]) => {
              const wIndex = parseWeekIndexKey(wKey);
              if (wIndex === null) return;

              Object.entries(week.days || {}).forEach(([dKey, daySlots]) => {
                const dIndex = parseDayIndexKey(dKey);
                if (dIndex === null) return;

                // to avoid selecting tail-only days, keep your rule:
                const hasPrimarySlot = (daySlots || []).some((slot) => slot.part !== "tail");
                if (!hasPrimarySlot) return;

                const diffDays = wIndex * 7 + dIndex;
                dateKeys.add(
                  anchorOrdinal !== null
                    ? calendarOrdinalToDateKey(
                        anchorOrdinal + diffDays * DAY_MS
                      )
                    : legacyRollingDiffDaysToDateKey(
                        diffDays,
                        rollingNormalized.anchorAt || ROLLING_ANCHOR_AT,
                        notificationTimeZone
                      )
                );
              });
            });

            const dateList = Array.from(dateKeys).sort();
            setSelectedDates(dateList);

            if (dateList.length) {
              const [year, month] = dateList[0].split("-").map(Number);
              setCurrentMonth(new Date(year, month - 1, 1));
            }

            setViewMode("month");
          }
        });
      } catch (error) {
        console.error(error);
      }
    };

    loadSchedule();

    return () => {
      isActive = false;
      if (scheduleRef) scheduleRef.off();
    };
  }, [notificationTimeZone, scheduleIdParam]);

  // ---- SAVE ----
  const handleSave = async () => {
    try {
      const userId = await AsyncStorage.getItem("userId");
      if (!userId) return;

      const startMinutes = angleToMinutes(greenStartAngle);
      const endMinutes = angleToMinutes(greenEndAngle);

      const scheduleRef = scheduleIdParam
        ? database().ref(`users/${userId}/setting/schedules/${scheduleIdParam}`)
        : database().ref(`users/${userId}/setting/schedules`).push();

      const scheduleId = scheduleIdParam || scheduleRef.key;

      const calendarMode = viewMode === "week" ? "weekly" : "rollingWeeks";
      const schedulePayload =
        calendarMode === "weekly"
          ? { weekly: buildWeeklySchedule(startMinutes, endMinutes, scheduleId) }
          : { rollingWeeks: buildRollingWeeksSchedule(startMinutes, endMinutes, scheduleId) };

      await Promise.all([
        scheduleRef.set(schedulePayload),
        database()
          .ref(`users/${userId}/setting/timeZone`)
          .transaction((currentTimeZone) => {
            if (
              typeof currentTimeZone === "string" &&
              currentTimeZone.trim()
            ) {
              return undefined;
            }
            return notificationTimeZone || getDeviceTimeZone();
          }),
      ]);
      navigation.navigate("AddSchedule");
    } catch (e) {
      console.error(e);
    }
  };

  // expose save to header
  useEffect(() => {
    navigation.setParams?.({ handleSave });
  }, [
    greenStartAngle,
    greenEndAngle,
    selectedDays,
    selectedDates,
    viewMode,
    notificationTimeZone,
    scheduleIdParam,
  ]);

  return (
    <View style={styles.container}>
      <View style={styles.dialWrapper}>
        <Svg width={redDiameter} height={redDiameter}>
          <Circle cx={cx} cy={cy} r={redDiameter / 2} fill={THEME.background} />
          <Path d={ringPath} fill={THEME.ring} fillRule="evenodd" />
          <Path d={d} fill={THEME.accent} />
          <Circle cx={cx} cy={cy} r={smallDiameter / 2} fill={THEME.dial} />

          {renderMinuteTicks()}
          {renderHourlyTicks()}
          {renderMajorMarks()}

          <G transform={`translate(${cx - 50}, ${cy - 30})`} onPress={() => setActiveHandle("start")}>
            <G>
              <AlarmClockIcon width={24} height={24} fill={THEME.textSecondary} />
            </G>
          </G>

          <G transform={`translate(${cx - 50}, ${cy + 5})`} onPress={() => setActiveHandle("end")}>
            <G>
              <BedIcon width={24} height={24} fill={THEME.textSecondary} />
            </G>
          </G>

          <G transform={`translate(${greenX1}, ${greenY1})`} {...greenStartPanResponder.panHandlers}>
            <Circle cx={0} cy={0} r={startRadiusControl} fill={THEME.accent} />
            <G
              transform={`translate(${ICON_POSITION_SHIFT_X - startIconOffset}, ${
                ICON_POSITION_SHIFT_Y - startIconOffset
              })`}
            >
              <AlarmClockIcon width={startIconSize} height={startIconSize} fill="#fff" />
            </G>
          </G>

          <G transform={`translate(${greenX2}, ${greenY2})`} {...greenEndPanResponder.panHandlers}>
            <Circle cx={0} cy={0} r={endRadiusControl} fill={THEME.accent} />
            <G
              transform={`translate(${ICON_POSITION_SHIFT_X - endIconOffset}, ${
                ICON_POSITION_SHIFT_Y - endIconOffset
              })`}
            >
              <BedIcon width={endIconSize} height={endIconSize} fill="#fff" />
            </G>
          </G>
        </Svg>

        <View pointerEvents="box-none" style={styles.timeInputsOverlay}>
          <TextInput
            value={startTimeInput}
            onChangeText={handleStartTimeChange}
            placeholder="00:00"
            placeholderTextColor="rgba(255,255,255,0.35)"
            keyboardType="numeric"
            maxLength={5}
            style={[styles.timeInputField, { left: cx - 20, top: cy - 30 }]}
            selectionColor={THEME.accent}
          />
          <TextInput
            value={endTimeInput}
            onChangeText={handleEndTimeChange}
            placeholder="00:00"
            placeholderTextColor="rgba(255,255,255,0.35)"
            keyboardType="numeric"
            maxLength={5}
            style={[styles.timeInputField, { left: cx - 20, top: cy + 5 }]}
            selectionColor={THEME.accent}
          />
        </View>
      </View>

      <View style={styles.viewToggle}>
        <Text style={[styles.toggleLabel, viewMode === "week" && styles.toggleLabelActive]}>Тиждень</Text>
        <Switch
          value={viewMode === "month"}
          onValueChange={(value) => setViewMode(value ? "month" : "week")}
          trackColor={{ false: "rgba(255,255,255,0.15)", true: "rgba(52,152,219,0.35)" }}
          thumbColor={viewMode === "month" ? THEME.accent : "#d0d0d0"}
        />
        <Text style={[styles.toggleLabel, viewMode === "month" && styles.toggleLabelActive]}>Місяць</Text>
      </View>

      {viewMode === "week" ? (
        <View style={styles.daysRow}>
          {daysOfWeek.map((day, idx) => (
            <TouchableOpacity
              key={day}
              style={[styles.dayButton, selectedDays.includes(idx) && styles.dayButtonActive]}
              onPress={() => toggleDay(idx)}
              activeOpacity={0.7}
            >
              <Text style={[styles.dayButtonText, selectedDays.includes(idx) && styles.dayButtonTextActive]}>
                {day}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={styles.monthWrapper}>
          <View style={styles.monthHeader}>
            <TouchableOpacity
              onPress={handlePrevMonth}
              style={[styles.monthArrow, isPrevMonthDisabled && styles.monthArrowDisabled]}
              activeOpacity={0.7}
              disabled={isPrevMonthDisabled}
            >
              <Text style={[styles.monthArrowText, isPrevMonthDisabled && styles.monthArrowTextDisabled]}>‹</Text>
            </TouchableOpacity>

            <Text style={styles.monthTitle}>
              {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </Text>

            <TouchableOpacity onPress={handleNextMonth} style={styles.monthArrow} activeOpacity={0.7}>
              <Text style={styles.monthArrowText}>›</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.monthWeekRow}>
            {daysOfWeek.map((day) => (
              <Text key={day} style={styles.monthWeekday}>
                {day}
              </Text>
            ))}
          </View>

          {getMonthDays().map((week, index) => (
            <View key={`week-${index}`} style={styles.monthWeekRow}>
              {week.map((day, dayIndex) => {
                if (!day) {
                  return (
                    <View key={`day-${index}-${dayIndex}`} style={styles.monthDayCell}>
                      <Text style={[styles.monthDayText, styles.monthDayTextMuted]}>{""}</Text>
                    </View>
                  );
                }

                const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
                const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
                  day
                ).padStart(2, "0")}`;

                const isPastDate = date < todayStart;
                const isSelected = selectedDates.includes(dateKey);

                return (
                  <TouchableOpacity
                    key={`day-${index}-${dayIndex}`}
                    style={[
                      styles.monthDayCell,
                      isSelected && styles.monthDayCellSelected,
                      isPastDate && styles.monthDayCellDisabled,
                    ]}
                    onPress={() => toggleDate(dateKey)}
                    activeOpacity={0.7}
                    disabled={isPastDate}
                  >
                    <Text
                      style={[
                        styles.monthDayText,
                        isPastDate && styles.monthDayTextDisabled,
                        isSelected && styles.monthDayTextSelected,
                      ]}
                    >
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.background,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 10,
    paddingBottom: 16,
  },
  viewToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
    marginBottom: 8,
  },
  toggleLabel: {
    color: THEME.textSecondary,
    fontWeight: "700",
    fontSize: 14,
  },
  toggleLabelActive: {
    color: THEME.textPrimary,
  },
  daysRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 12,
    gap: 3,
  },
  dayButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: THEME.surface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginHorizontal: 1.5,
    minWidth: 32,
    alignItems: "center",
  },
  dayButtonActive: {
    backgroundColor: "rgba(52,152,219,0.15)",
    borderColor: THEME.accent,
  },
  dayButtonText: {
    color: THEME.textSecondary,
    fontWeight: "700",
    fontSize: 15,
  },
  dayButtonTextActive: {
    color: THEME.textPrimary,
  },
  monthWrapper: {
    width: "92%",
    backgroundColor: THEME.surface,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginBottom: 12,
  },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  monthTitle: {
    color: THEME.textPrimary,
    fontWeight: "700",
    fontSize: 14,
  },
  monthArrow: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  monthArrowDisabled: {
    opacity: 0.4,
  },
  monthArrowText: {
    color: THEME.textSecondary,
    fontSize: 20,
  },
  monthArrowTextDisabled: {
    color: "rgba(255,255,255,0.35)",
  },
  monthWeekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  monthWeekday: {
    flex: 1,
    textAlign: "center",
    color: THEME.textSecondary,
    fontWeight: "600",
    fontSize: 11,
    paddingVertical: 2,
  },
  monthDayCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  monthDayCellSelected: {
    backgroundColor: "rgba(52,152,219,0.15)",
    borderColor: THEME.accent,
  },
  monthDayCellDisabled: {
    opacity: 0.5,
  },
  monthDayText: {
    color: THEME.textPrimary,
    fontSize: 12,
  },
  monthDayTextMuted: {
    color: "transparent",
  },
  monthDayTextDisabled: {
    color: "rgba(255,255,255,0.3)",
  },
  monthDayTextSelected: {
    color: THEME.textPrimary,
    fontWeight: "700",
  },
  dialWrapper: {
    position: "relative",
  },
  timeInputsOverlay: {
    position: "absolute",
    inset: 0,
  },
  timeInputField: {
    position: "absolute",
    color: THEME.textPrimary,
    fontSize: 28,
    fontWeight: "700",
    textAlign: "left",
    width: 90,
    paddingVertical: 0,
  },
});

export default SleepSchedule;
