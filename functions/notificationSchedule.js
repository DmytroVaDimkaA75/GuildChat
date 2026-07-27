const TOTAL_MINUTES = 24 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const dayKeyToIndex = (key) => {
  if (typeof key !== "string") return null;
  const value = key.startsWith("d") ? key.slice(1) : key;
  const index = Number(value);
  return Number.isInteger(index) ? index : null;
};

const weekKeyToIndex = (key) => {
  if (typeof key !== "string") return null;
  const value = key.startsWith("w") ? key.slice(1) : key;
  const index = Number(value);
  return Number.isInteger(index) ? index : null;
};

const weeklyIndexToKey = (index) => `d${index}`;
const rollingWeekIndexToKey = (index) => `w${index}`;
const rollingDayIndexToKey = (index) => `d${index}`;

const normalizeWeekly = (weeklyRaw) => {
  const normalized = {};
  if (!weeklyRaw) return normalized;

  if (Array.isArray(weeklyRaw)) {
    weeklyRaw.forEach((slots, index) => {
      if (Array.isArray(slots) && slots.length) {
        normalized[weeklyIndexToKey(index)] = slots;
      }
    });
    return normalized;
  }

  if (typeof weeklyRaw === "object") {
    Object.entries(weeklyRaw).forEach(([key, slots]) => {
      const index = dayKeyToIndex(key);
      if (
        index === null ||
        index < 0 ||
        index > 6 ||
        !Array.isArray(slots) ||
        !slots.length
      ) {
        return;
      }
      normalized[weeklyIndexToKey(index)] = slots;
    });
  }

  return normalized;
};

const normalizeRollingWeeks = (rollingWeeksRaw) => {
  if (!rollingWeeksRaw || typeof rollingWeeksRaw !== "object") return null;

  const weeksOut = {};
  const weeksRaw = rollingWeeksRaw.weeks;
  if (!weeksRaw || typeof weeksRaw !== "object") {
    return {
      anchorAt: rollingWeeksRaw.anchorAt,
      anchorDate: rollingWeeksRaw.anchorDate,
      version: rollingWeeksRaw.version,
      weeks: weeksOut,
    };
  }

  Object.entries(weeksRaw).forEach(([weekKey, week]) => {
    const weekIndex = weekKeyToIndex(weekKey);
    if (weekIndex === null) return;

    const daysRaw = week?.days;
    if (!daysRaw || typeof daysRaw !== "object") return;

    const daysOut = {};
    Object.entries(daysRaw).forEach(([dayKey, slots]) => {
      const dayIndex = dayKeyToIndex(dayKey);
      if (
        dayIndex === null ||
        dayIndex < 0 ||
        dayIndex > 6 ||
        !Array.isArray(slots) ||
        !slots.length
      ) {
        return;
      }
      daysOut[rollingDayIndexToKey(dayIndex)] = slots;
    });

    if (Object.keys(daysOut).length) {
      weeksOut[rollingWeekIndexToKey(weekIndex)] = { days: daysOut };
    }
  });

  return {
    anchorAt: rollingWeeksRaw.anchorAt,
    anchorDate: rollingWeeksRaw.anchorDate,
    version: rollingWeeksRaw.version,
    weeks: weeksOut,
  };
};

const getLocalParts = (utcMs, timeZone) => {
  if (!Number.isFinite(Number(utcMs))) {
    throw new RangeError("Invalid notification timestamp");
  }
  if (typeof timeZone !== "string" || !timeZone.trim()) {
    throw new RangeError("Notification time zone is not configured");
  }

  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const values = {};
  formatter.formatToParts(new Date(Number(utcMs))).forEach((part) => {
    values[part.type] = part.value;
  });

  // Деякі версії ICU все одно повертають 24:xx попри h23.
  const rawHour = Number(values.hour);
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: rawHour === 24 ? 0 : rawHour,
    minute: Number(values.minute),
    weekdayShort: values.weekday,
  };
};

const weekdayShortToMon0 = (value) => {
  const indexes = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  return indexes[value] ?? null;
};

const localYmdToOrdinalMs = (year, month, day) =>
  Date.UTC(year, month - 1, day);

const dateKeyToOrdinalMs = (dateKey) => {
  const match = DATE_KEY_PATTERN.exec(String(dateKey || ""));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ordinal = localYmdToOrdinalMs(year, month, day);
  const parsed = new Date(ordinal);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return ordinal;
};

const getZonedLocalMidnightMs = (year, month, day, timeZone) => {
  const desiredLocalAsUtc = localYmdToOrdinalMs(year, month, day);
  let candidate = desiredLocalAsUtc;

  // Конвертуємо локальне 00:00 заданої IANA TZ у справжній UTC timestamp.
  // Двох ітерацій достатньо навіть біля зміни DST; третя лишає запас для ICU.
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = getLocalParts(candidate, timeZone);
    const representedLocalAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute
    );
    const correction = representedLocalAsUtc - desiredLocalAsUtc;
    candidate -= correction;
    if (correction === 0) break;
  }

  return candidate;
};

const getLegacyRollingDiffDays = ({
  year,
  month,
  day,
  anchorAt,
  timeZone,
}) => {
  const anchorMs = Number(anchorAt) * 1000;
  if (!Number.isFinite(anchorMs)) return null;
  const localMidnightMs = getZonedLocalMidnightMs(
    year,
    month,
    day,
    timeZone
  );
  return Math.floor((localMidnightMs - anchorMs) / DAY_MS);
};

const isMinuteInsideSlots = (minuteOfDay, slots) => {
  if (!Array.isArray(slots) || !slots.length) return false;
  const numericMinute = Number(minuteOfDay);
  if (!Number.isFinite(numericMinute)) return false;
  const minute = Math.max(
    0,
    Math.min(Math.trunc(numericMinute), TOTAL_MINUTES - 1)
  );

  return slots.some((slot) => {
    const start = Number(slot?.startMinutes);
    const end = Number(slot?.endMinutes);
    return (
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      start >= 0 &&
      end <= TOTAL_MINUTES &&
      start < end &&
      minute >= start &&
      minute < end
    );
  });
};

const isUserActiveNow = (scheduleData, utcMs, timeZone) => {
  if (!scheduleData || typeof scheduleData !== "object") return false;

  const parts = getLocalParts(utcMs, timeZone);
  const dayIndex = weekdayShortToMon0(parts.weekdayShort);
  if (dayIndex === null) return false;
  const minuteOfDay = parts.hour * 60 + parts.minute;

  if (scheduleData.weekly) {
    const weekly = normalizeWeekly(scheduleData.weekly);
    return isMinuteInsideSlots(
      minuteOfDay,
      weekly[weeklyIndexToKey(dayIndex)] || []
    );
  }

  if (scheduleData.rollingWeeks?.weeks) {
    const rolling = normalizeRollingWeeks(scheduleData.rollingWeeks);
    const anchorAt = Number(rolling?.anchorAt);
    if (!Number.isFinite(anchorAt)) return false;

    const anchorDateOrdinal = dateKeyToOrdinalMs(rolling?.anchorDate);
    const diffDays =
      anchorDateOrdinal !== null
        ? Math.round(
            (localYmdToOrdinalMs(parts.year, parts.month, parts.day) -
              anchorDateOrdinal) /
              DAY_MS
          )
        : getLegacyRollingDiffDays({
            year: parts.year,
            month: parts.month,
            day: parts.day,
            anchorAt,
            timeZone,
          });
    if (!Number.isFinite(diffDays)) return false;
    const weekIndex = Math.floor(diffDays / 7);
    const dayIndexInWeek = ((diffDays % 7) + 7) % 7;
    const slots =
      rolling?.weeks?.[rollingWeekIndexToKey(weekIndex)]?.days?.[
        rollingDayIndexToKey(dayIndexInWeek)
      ] || [];

    return isMinuteInsideSlots(minuteOfDay, slots);
  }

  return false;
};

const isUserActiveNowBySchedules = (schedules, utcMs, timeZone) => {
  if (!Array.isArray(schedules) || !schedules.length) return true;
  return schedules.some((schedule) =>
    isUserActiveNow(schedule, utcMs, timeZone)
  );
};

module.exports = {
  DAY_MS,
  TOTAL_MINUTES,
  dateKeyToOrdinalMs,
  getLocalParts,
  getLegacyRollingDiffDays,
  getZonedLocalMidnightMs,
  isMinuteInsideSlots,
  isUserActiveNow,
  isUserActiveNowBySchedules,
  normalizeRollingWeeks,
  normalizeWeekly,
};
