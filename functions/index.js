const { onValueCreated, onValueWritten } = require("firebase-functions/v2/database");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();

/**
 * =====================================================================
 * ✅ Telegram secrets
 * =====================================================================
 */
const TELEGRAM_BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");
const TELEGRAM_CHAT_ID = defineSecret("TELEGRAM_CHAT_ID");

/**
 * =====================================================================
 * ✅ Telegram helper (send message to channel/group)
 * - Uses Bot API: sendMessage
 * - No external libs required on Node 18+
 * =====================================================================
 */
const sendTelegramMessage = async ({ text, parseMode = "HTML" }) => {
  const token = TELEGRAM_BOT_TOKEN.value();
  const chatId = TELEGRAM_CHAT_ID.value();

  if (!token || !chatId) {
    logger.warn("[TG] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const body = {
      chat_id: String(chatId),
      text: String(text || ""),
      parse_mode: parseMode,
      disable_web_page_preview: true,
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok) {
      logger.error("[TG] sendMessage failed:", {
        status: res.status,
        response: json,
      });
      return false;
    }

    return true;
  } catch (e) {
    logger.error("[TG] sendMessage error:", e);
    return false;
  }
};

/**
 * =====================================================================
 * ✅ Widget refresh helpers (data-only, без показу нотифікацій)
 * - НЕ конфліктує з існуючими експортами
 * - Є cooldown, щоб не шмаляти кожні 1-2 секунди
 * =====================================================================
 */

const WIDGET_REFRESH_COOLDOWN_MS = 20000; // 20s (можеш змінити)

const chunkArray = (arr, size) => {
  const res = [];
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  return res;
};

const getGuildMemberTokens = async (guildId) => {
  const membersSnap = await admin.database().ref(`/guilds/${guildId}/guildUsers`).once("value");
  if (!membersSnap.exists()) return [];

  const memberIds = Object.keys(membersSnap.val() || {});
  if (!memberIds.length) return [];

  const tokenSnaps = await Promise.all(
    memberIds.map((uid) => admin.database().ref(`/users/${uid}/fcmToken`).once("value"))
  );

  const tokens = tokenSnaps.map((s) => (s.exists() ? s.val() : null)).filter(Boolean);
  return Array.from(new Set(tokens));
};

/**
 * ✅ Анти-спам: не частіше ніж раз на WIDGET_REFRESH_COOLDOWN_MS для guildId
 */
const acquireWidgetCooldown = async (guildId) => {
  const ref = admin.database().ref(`/guilds/${guildId}/GBG/_meta/widgetRefreshLastSent`);
  const now = Date.now();

  try {
    const result = await ref.transaction((prev) => {
      const prevMs = typeof prev === "number" ? prev : 0;
      if (now - prevMs < WIDGET_REFRESH_COOLDOWN_MS) {
        return; // abort
      }
      return now;
    });

    return !!result.committed;
  } catch (e) {
    // Якщо транзакція не вдалася — краще не спамити
    logger.error("[WidgetCooldown] transaction error:", e);
    return false;
  }
};

/**
 * ✅ Надсилає data-only повідомлення всім членам гільдії.
 * Важливо: payload БЕЗ android.notification / aps.alert => користувач не бачить пуш.
 */
const sendWidgetRefreshToGuild = async ({ guildId, reason = "", sectorId = "" }) => {
  if (!guildId) return;

  const ok = await acquireWidgetCooldown(guildId);
  if (!ok) return;

  const tokens = await getGuildMemberTokens(guildId);
  if (!tokens.length) return;

  const dataPayload = {
    type: "gbg_widget_refresh",
    guildId: String(guildId),
    reason: String(reason || ""),
    sectorId: String(sectorId || ""),
    ts: String(Date.now()),
  };

  const chunks = chunkArray(tokens, 500);

  for (const chunk of chunks) {
    try {
      // ✅ data-only multicast
      const response = await admin.messaging().sendEachForMulticast({
        tokens: chunk,
        data: dataPayload,
        android: { priority: "high" },
        apns: {
          payload: { aps: { "content-available": 1 } },
          headers: { "apns-priority": "5" },
        },
      });

      if (response) {
        logger.info("[WidgetRefresh] multicast result", {
          guildId: String(guildId),
          reason: String(reason || ""),
          sectorId: String(sectorId || ""),
          successCount: response.successCount,
          failureCount: response.failureCount,
        });
      }
    } catch (e) {
      logger.error("[WidgetRefresh] sendEachForMulticast error:", e);
    }
  }
};

const getSectorOwnerKey = (sectorData) => {
  if (!sectorData || typeof sectorData !== "object") return null;
  const ownerValue = sectorData.owner ?? sectorData.ownerId;
  if (ownerValue === undefined || ownerValue === null) return null;
  return String(ownerValue);
};

const CULTURE_SETTLEMENT_LABELS = {
  vikings: "Вікінги",
  japanese: "Феодальна Японія",
  egyptians: "Стародавній Єгипет",
  aztecs: "Ацтеки",
  mughals: "Імперія Моголів",
  polynesia: "Полінезія",
  pirates: "Піратське поселення",
};

const CULTURE_NOTIFICATION_TYPE = "culture_build_ready";

const toPlainArray = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === "object") return Object.values(value).filter(Boolean);
  return [];
};

const getCultureSettlementLabel = (settlementName) =>
  CULTURE_SETTLEMENT_LABELS[String(settlementName || "")] || String(settlementName || "Поселення");

const normalizeQueueComparable = (value) => JSON.stringify(value || null);

const stripCultureNotificationQueue = (settlement) => {
  if (!settlement || typeof settlement !== "object") return settlement || null;
  const next = { ...settlement };
  delete next.cultureNotificationQueue;
  return next;
};

const getCultureQueueKeyBase = (building, index) => {
  const rawKey = building?.instanceId ? String(building.instanceId) : `idx_${index}`;
  return rawKey.replace(/[.#$[\]/]/g, "_");
};

const buildCultureQueueEntry = ({
  userId,
  guildId,
  settlement,
  building,
  index,
  taskType,
  notificationTime,
  prevTask,
}) => {
  const startedAt = Number(building?.construction?.startedAt) || 0;
  const buildTimeSec = Number(building?.construction?.buildTimeSec);
  const category = String(building?.construction?.category || "");
  const currency = String(building?.construction?.currency || "");
  const passiveDurationSec = Number(building?.construction?.passiveDurationSec) || 0;
  const queueKey = `${getCultureQueueKeyBase(building, index)}__${taskType}`;

  if (!Number.isFinite(notificationTime) || notificationTime <= 0) return null;

  const instanceId = building?.instanceId ? String(building.instanceId) : `idx_${index}`;
  const sameJob =
    prevTask &&
    Number(prevTask?.notificationTime) === notificationTime &&
    String(prevTask?.taskType || "") === taskType;

  return {
    queueKey,
    taskType,
    userId: String(userId),
    guildId: String(guildId),
    settlementName: String(settlement?.settlementName || ""),
    buildingId: String(building?.buildingId || building?.construction?.buildingId || ""),
    buildingName: String(building?.construction?.buildingName || building?.buildingId || "Будівля"),
    instanceId,
    footprint: String(building?.footprint || ""),
    category,
    currency,
    buildTimeSec,
    passiveDurationSec,
    startedAt,
    endsAt: Number(building?.construction?.endsAt) || 0,
    notificationTime,
    status: sameJob && prevTask?.status === "sent" ? "sent" : "pending",
    sentAt: sameJob && prevTask?.status === "sent" ? prevTask?.sentAt || null : null,
  };
};

const buildCultureQueueEntries = ({ userId, guildId, settlement, building, index, currentQueue }) => {
  const constructionEndsAt = Number(building?.construction?.endsAt);
  const buildTimeSec = Number(building?.construction?.buildTimeSec);
  const category = String(building?.construction?.category || "");
  const passiveDurationSec = Number(building?.construction?.passiveDurationSec) || 0;
  const notifyBuildCompletion = building?.construction?.notifyBuildCompletion === true;

  if (!Number.isFinite(constructionEndsAt) || constructionEndsAt <= 0) return [];

  const entries = [];
  const buildCompleteNotificationTime = Math.floor(constructionEndsAt / 1000);

  if (notifyBuildCompletion && (category === "residential" || category === "goods")) {
    const taskType = "build_complete";
    const queueKey = `${getCultureQueueKeyBase(building, index)}__${taskType}`;
    const task = buildCultureQueueEntry({
      userId,
      guildId,
      settlement,
      building,
      index,
      taskType,
      notificationTime: buildCompleteNotificationTime,
      prevTask: currentQueue?.[queueKey],
    });
    if (task) entries.push(task);
  }

  if (category === "residential" && Number.isFinite(buildTimeSec) && buildTimeSec > 0 && Number.isFinite(passiveDurationSec) && passiveDurationSec > 0) {
    const taskType = "residential_collect";
    const queueKey = `${getCultureQueueKeyBase(building, index)}__${taskType}`;
    const task = buildCultureQueueEntry({
      userId,
      guildId,
      settlement,
      building,
      index,
      taskType,
      notificationTime: Math.floor((constructionEndsAt + passiveDurationSec * 1000) / 1000),
      prevTask: currentQueue?.[queueKey],
    });
    if (task) entries.push(task);
  }

  if (category === "coin" && Number.isFinite(buildTimeSec) && buildTimeSec > 0) {
    const taskType = "coin_start_production";
    const queueKey = `${getCultureQueueKeyBase(building, index)}__${taskType}`;
    const task = buildCultureQueueEntry({
      userId,
      guildId,
      settlement,
      building,
      index,
      taskType,
      notificationTime: buildCompleteNotificationTime,
      prevTask: currentQueue?.[queueKey],
    });
    if (task) entries.push(task);
  }

  return entries;
};

const rebuildCultureNotificationQueue = async ({ db, userId, guildId }) => {
  const [settlementSnap, cultureSnap, currentQueueSnap] = await Promise.all([
    db.ref(`/users/${userId}/${guildId}/settlement`).once("value"),
    db.ref(`/users/${userId}/${guildId}/culture`).once("value"),
    db.ref(`/users/${userId}/${guildId}/settlement/cultureNotificationQueue`).once("value"),
  ]);

  const queueRef = db.ref(`/users/${userId}/${guildId}/settlement/cultureNotificationQueue`);
  if (!settlementSnap.exists()) {
    await queueRef.remove();
    return null;
  }

  const culture = cultureSnap.exists() ? (cultureSnap.val() || {}) : {};
  if (culture?.cultureAlarm !== true) {
    await queueRef.remove();
    return null;
  }

  const settlement = settlementSnap.val() || {};
  const currentQueue = currentQueueSnap.exists() ? (currentQueueSnap.val() || {}) : {};
  const placedBuildings = toPlainArray(settlement?.placedBuildings);
  const nextQueue = {};

  placedBuildings.forEach((building, index) => {
    const tasks = buildCultureQueueEntries({
      userId,
      guildId,
      settlement,
      building,
      index,
      currentQueue,
    });
    tasks.forEach((task) => {
      nextQueue[task.queueKey] = task;
    });
  });

  if (normalizeQueueComparable(currentQueue) === normalizeQueueComparable(Object.keys(nextQueue).length ? nextQueue : null)) {
    return null;
  }

  await queueRef.set(Object.keys(nextQueue).length ? nextQueue : null);
  return null;
};

const sendCulturePushAndMarkSent = async ({ db, userId, guildId, queuePath, task }) => {
  const cultureSnap = await db.ref(`/users/${userId}/${guildId}/culture`).once("value");
  const culture = cultureSnap.exists() ? (cultureSnap.val() || {}) : {};
  if (culture?.cultureAlarm !== true) {
    return db.ref(queuePath).remove();
  }

  const tokenSnap = await db.ref(`/users/${userId}/fcmToken`).once("value");
  const token = tokenSnap.exists() ? tokenSnap.val() : null;
  if (!token) {
    return db.ref(queuePath).update({
      status: "pending",
      lastAttemptAt: Date.now(),
      lastError: "no_token",
    });
  }

  const nowMs = Date.now();
  let soundBySchedule = true;
  try {
    const { timeZone, schedules } = await getUserScheduleForNotifications(userId);
    soundBySchedule = isUserActiveNowBySchedules(schedules, nowMs, timeZone);
  } catch (e) {
    logger.error("[Culture] schedule check error:", e);
    soundBySchedule = true;
  }

  const settlementLabel = getCultureSettlementLabel(task?.settlementName);
  const buildingName = String(task?.buildingName || "Будівля");
  const currency = String(task?.currency || "").trim();
  const titleText = `🏝️ ${settlementLabel}`;
  let bodyText = `${buildingName} завершив будівництво.`;

  if (task?.taskType === "residential_collect") {
    bodyText = `Зберіть ${currency || "ресурси"} з ${buildingName}`;
  } else if (task?.taskType === "coin_start_production") {
    bodyText = `Запустіть виробництво ${currency || "ресурсів"} в ${buildingName}`;
  }

  const payload = soundBySchedule
    ? {
        token,
        data: {
          type: CULTURE_NOTIFICATION_TYPE,
          guildId: String(guildId),
          settlementName: String(task?.settlementName || ""),
          buildingId: String(task?.buildingId || ""),
          buildingName,
          title: titleText,
          body: bodyText,
          sound: "1",
        },
        android: {
          priority: "high",
          notification: {
            title: titleText,
            body: bodyText,
            sound: "default",
            channel_id: "culture_settlement",
          },
        },
        apns: {
          payload: {
            aps: {
              alert: { title: titleText, body: bodyText },
              sound: "default",
              "content-available": 1,
            },
          },
        },
      }
    : {
        token,
        data: {
          type: CULTURE_NOTIFICATION_TYPE,
          guildId: String(guildId),
          settlementName: String(task?.settlementName || ""),
          buildingId: String(task?.buildingId || ""),
          buildingName,
          title: titleText,
          body: bodyText,
          sound: "0",
        },
        android: {
          priority: "high",
          notification: {
            title: titleText,
            body: bodyText,
            channel_id: "culture_settlement_silent",
          },
        },
        apns: {
          payload: {
            aps: {
              alert: { title: titleText, body: bodyText },
              "content-available": 1,
            },
          },
        },
      };

  try {
    await admin.messaging().send(payload);
    return db.ref(queuePath).update({
      status: "sent",
      sentAt: admin.database.ServerValue.TIMESTAMP,
      lastAttemptAt: Date.now(),
      lastError: null,
    });
  } catch (e) {
    logger.error("[Culture] send push error:", e);
    return db.ref(queuePath).update({
      status: "pending",
      lastAttemptAt: Date.now(),
      lastError: e?.message || "send_failed",
    });
  }
};

/**
 * =====================================================================
 * ✅ Schedule helpers (локальний час користувача)
 * - Часова зона: users/{uid}/setting/timeZone
 * - Розклад: users/{uid}/setting/schedules/{scheduleId}
 * - Якщо активний час => sound
 * - Якщо не активний => silent
 * =====================================================================
 */

const TOTAL_MINUTES = 24 * 60;

const dayKeyToIndex = (key) => {
  if (typeof key !== "string") return null;
  if (key.startsWith("d")) {
    const n = Number(key.slice(1));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(key);
  return Number.isFinite(n) ? n : null;
};

const weekKeyToIndex = (key) => {
  if (typeof key !== "string") return null;
  if (key.startsWith("w")) {
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

  // legacy array: [null, [...], ...]
  if (Array.isArray(weeklyRaw)) {
    for (let i = 0; i < weeklyRaw.length; i += 1) {
      const daySlots = weeklyRaw[i];
      if (!Array.isArray(daySlots) || !daySlots.length) continue;
      out[weeklyIndexToKey(i)] = daySlots;
    }
    return out;
  }

  // object: {"1":[...]} or {"d1":[...]}
  if (typeof weeklyRaw === "object") {
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
  if (!rollingWeeksRaw || typeof rollingWeeksRaw !== "object") return null;

  const anchorAt = rollingWeeksRaw.anchorAt;
  const weeksRaw = rollingWeeksRaw.weeks;

  const weeksOut = {};
  if (!weeksRaw || typeof weeksRaw !== "object") {
    return { anchorAt, weeks: weeksOut };
  }

  Object.keys(weeksRaw).forEach((wk) => {
    const wIndex = weekKeyToIndex(wk);
    if (wIndex === null) return;

    const weekObj = weeksRaw[wk];
    const daysRaw = weekObj?.days;

    const wKey = rollingWeekIndexToKey(wIndex);
    if (!weeksOut[wKey]) weeksOut[wKey] = { days: {} };

    if (!daysRaw || typeof daysRaw !== "object") return;

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

// Отримуємо локальні частини дати/часу у заданій TZ (без сторонніх бібліотек)
const getLocalParts = (utcMs, timeZone) => {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = dtf.formatToParts(new Date(utcMs));
  const map = {};
  parts.forEach((p) => {
    map[p.type] = p.value;
  });

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    weekdayShort: map.weekday, // Mon Tue ...
  };
};

// Mon..Sun => 0..6 (Пн=0 ... Нд=6) — як у твоєму UI
const weekdayShortToMon0 = (w) => {
  const m = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  return m[w] ?? null;
};

const localYmdToUtcMidnightMs = (y, m, d) => Date.UTC(y, m - 1, d);

const isMinuteInsideSlots = (minuteOfDay, slots) => {
  if (!Array.isArray(slots) || !slots.length) return false;
  const m = Math.max(0, Math.min(minuteOfDay, TOTAL_MINUTES));
  for (const s of slots) {
    const a = Number(s?.startMinutes);
    const b = Number(s?.endMinutes);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (m >= a && m < b) return true;
  }
  return false;
};

const isUserActiveNow = (scheduleData, utcMs, timeZone) => {
  if (!scheduleData) return true; // якщо розкладу нема — не блокуємо звук

  const tz = timeZone || "UTC";
  const parts = getLocalParts(utcMs, tz);
  const dayIndex = weekdayShortToMon0(parts.weekdayShort);
  if (dayIndex === null) return true;

  const minuteOfDay = parts.hour * 60 + parts.minute;

  // WEEKLY
  if (scheduleData.weekly) {
    const weekly = normalizeWeekly(scheduleData.weekly);
    const slots = weekly[weeklyIndexToKey(dayIndex)] || [];
    return isMinuteInsideSlots(minuteOfDay, slots);
  }

  // ROLLING WEEKS
  if (scheduleData.rollingWeeks?.weeks) {
    const rolling = normalizeRollingWeeks(scheduleData.rollingWeeks);
    const anchorAt = Number(rolling?.anchorAt);
    const weeks = rolling?.weeks || {};
    if (!Number.isFinite(anchorAt)) return true;

    // diffDays рахуємо по локальній даті у tz
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

// Витягуємо TZ + розклад користувача
const getUserScheduleForNotifications = async (uid) => {
  const settingSnap = await admin.database().ref(`/users/${uid}/setting`).once("value");
  const setting = settingSnap.exists() ? (settingSnap.val() || {}) : {};

  const timeZone = setting.timeZone || "UTC";
  const preferredId = setting.notificationScheduleId || setting.activeScheduleId || null;

  const schedulesSnap = await admin.database().ref(`/users/${uid}/setting/schedules`).once("value");
  if (!schedulesSnap.exists()) {
    return { timeZone, schedules: [] };
  }

  const schedulesMap = schedulesSnap.val() || {};

  if (preferredId && schedulesMap[preferredId]) {
    return { timeZone, schedules: [schedulesMap[preferredId]] };
  }

  const schedules = Object.keys(schedulesMap)
    .map((id) => schedulesMap[id])
    .filter((item) => item && typeof item === "object");

  return { timeZone, schedules };
};

const isUserActiveNowBySchedules = (schedules, utcMs, timeZone) => {
  if (!Array.isArray(schedules) || !schedules.length) return true;
  return schedules.some((schedule) => isUserActiveNow(schedule, utcMs, timeZone));
};

/**
 * =====================================================================
 * ✅ 1) Callable тест для кнопки “Тест data-only”
 * =====================================================================
 */
exports.sendWidgetDataOnlyTest = onCall({ region: "europe-west1" }, async (request) => {
  const { userId, guildId } = request.data || {};
  if (!userId) return { success: false, error: "userId is required" };

  const tokenSnap = await admin.database().ref(`/users/${userId}/fcmToken`).once("value");
  const token = tokenSnap.exists() ? tokenSnap.val() : null;

  if (!token) return { success: false, error: "No fcmToken for this user" };

  try {
    await admin.messaging().send({
      token,
      data: {
        type: "gbg_widget_refresh",
        guildId: guildId ? String(guildId) : "",
        reason: "manual_test",
        sectorId: "",
        ts: String(Date.now()),
      },
      android: { priority: "high" },
      apns: {
        payload: { aps: { "content-available": 1 } },
        headers: { "apns-priority": "5" },
      },
    });

    return { success: true };
  } catch (e) {
    logger.error("[sendWidgetDataOnlyTest] error:", e);
    return { success: false, error: "send failed" };
  }
});

/**
 * =====================================================================
 * ✅ 2) Тригери на opponents / map / owner change
 * =====================================================================
 */
exports.onGbgOpponentsWrite = onValueWritten(
  {
    ref: "/guilds/{guildId}/GBG/opponents",
    region: "europe-west1",
  },
  async (event) => {
    const guildId = String(event.params.guildId || "");

    if (guildId && !String(guildId).includes("10821")) {
      return null;
    }

    await sendWidgetRefreshToGuild({ guildId, reason: "opponents_write", sectorId: "" });
    return null;
  }
);

exports.onGbgMapWrite = onValueWritten(
  {
    ref: "/guilds/{guildId}/GBG/map",
    region: "europe-west1",
  },
  async (event) => {
    const guildId = String(event.params.guildId || "");

    if (guildId && !String(guildId).includes("10821")) {
      return null;
    }

    await sendWidgetRefreshToGuild({ guildId, reason: "map_write", sectorId: "" });
    return null;
  }
);

exports.onGbgSectorOwnerChange = onValueWritten(
  {
    ref: "/guilds/{guildId}/GBG/sectors/{sectorId}",
    region: "europe-west1",
  },
  async (event) => {
    const guildId = String(event.params.guildId || "");
    const sectorId = String(event.params.sectorId || "");
    if (!guildId) return null;

    const beforeData = event.data?.before?.exists() ? event.data.before.val() : null;
    const afterData = event.data?.after?.exists() ? event.data.after.val() : null;

    const beforeOwner = getSectorOwnerKey(beforeData);
    const afterOwner = getSectorOwnerKey(afterData);

    if (beforeOwner === afterOwner) return null;

    await sendWidgetRefreshToGuild({ guildId, reason: "sector_owner_change", sectorId });
    return null;
  }
);

/**
 * =====================================================================
 * ✅ Chat notifications
 * =====================================================================
 */

const sendChatNotificationForMessage = async ({ guildId, chatId, messageData, db }) => {
  const senderId = messageData.senderId;
  const messageText = messageData.text || "Отправлено изображение";

  const chatRef = db.ref(`/guilds/${guildId}/chats/${chatId}`);
  const chatSnapshot = await chatRef.once("value");
  const chatData = chatSnapshot.val();
  if (!chatData || !chatData.members) return;

  const members = Object.keys(chatData.members);
  const senderProfile = await db.ref(`/users/${senderId}`).once("value");
  const senderName = senderProfile.val()?.userName || "Новое сообщение";

  // ✅ Отримувачі (без відправника)
  const recipients = members.filter((m) => m !== senderId);
  if (!recipients.length) return;

  const nowMs = Date.now();

  // ✅ Для кожного отримувача визначаємо: token + (members flag) + (schedule)
  const userInfos = await Promise.all(
    recipients.map(async (uid) => {
      const tokenSnap = await db.ref(`/users/${uid}/fcmToken`).once("value");
      const token = tokenSnap.exists() ? tokenSnap.val() : null;
      if (!token) return { uid, token: null, sound: false };

      // ✅ якщо members/{uid} === true -> звук може бути, інакше завжди тихо
      const chatSoundEnabled = chatData.members?.[uid] === true;
      if (!chatSoundEnabled) return { uid, token, sound: false };

      // ✅ якщо графік дозволяє -> зі звуком
      let soundBySchedule = true;
      try {
        const { timeZone, schedules } = await getUserScheduleForNotifications(uid);
        soundBySchedule = isUserActiveNowBySchedules(schedules, nowMs, timeZone);
      } catch (e) {
        logger.error("[sendChatNotification] schedule check error:", e);
        soundBySchedule = true;
      }

      return { uid, token, sound: !!soundBySchedule };
    })
  );

  const soundTokens = userInfos.filter((x) => x.token && x.sound).map((x) => x.token);
  const silentTokens = userInfos.filter((x) => x.token && !x.sound).map((x) => x.token);

  const titleText = senderName;
  const bodyText = messageText;

  // ✅ 1) Зі звуком
  if (soundTokens.length > 0) {
    const payloadSound = {
      data: { chatId, guildId, title: titleText, body: bodyText, type: "chat_message", sound: "1" },
      android: {
        priority: "high",
        notification: {
          title: titleText,
          body: bodyText,
          sound: "smeh_minonovhasms",
          channel_id: "chat_messages",
        },
      },
      apns: {
        payload: { aps: { alert: { title: titleText, body: bodyText }, sound: "default", "content-available": 1 } },
      },
    };

    try {
      await admin.messaging().sendEachForMulticast({ tokens: soundTokens, ...payloadSound });
    } catch (e) {
      logger.error("[sendChatNotification] sound send error:", e);
    }
  }

  // ✅ 2) Тихо (без звуку)
  if (silentTokens.length > 0) {
    const payloadSilent = {
      data: { chatId, guildId, title: titleText, body: bodyText, type: "chat_message", sound: "0" },
      android: {
        priority: "high",
        notification: {
          title: titleText,
          body: bodyText,
          channel_id: "chat_messages_silent",
        },
      },
      apns: {
        payload: { aps: { alert: { title: titleText, body: bodyText }, "content-available": 1 } },
      },
    };

    try {
      await admin.messaging().sendEachForMulticast({ tokens: silentTokens, ...payloadSilent });
    } catch (e) {
      logger.error("[sendChatNotification] silent send error:", e);
    }
  }
};

exports.sendChatNotification = onValueCreated(
  {
    ref: "/guilds/{guildId}/chats/{chatId}/messages/{messageId}",
    region: "europe-west1",
  },
  async (event) => {
    const { guildId, chatId } = event.params;
    const messageData = event.data.val();
    if (!messageData) return null;

    await sendChatNotificationForMessage({ guildId, chatId, messageData, db: admin.database() });
    return null;
  }
);

exports.syncCultureNotifications = onValueWritten(
  {
    ref: "/users/{userId}/{guildId}/settlement",
    region: "europe-west1",
  },
  async (event) => {
    const { userId, guildId } = event.params;
    const beforeSettlement = stripCultureNotificationQueue(event.data.before.exists() ? event.data.before.val() : null);
    const afterSettlement = stripCultureNotificationQueue(event.data.after.exists() ? event.data.after.val() : null);

    if (normalizeQueueComparable(beforeSettlement) === normalizeQueueComparable(afterSettlement)) {
      return null;
    }

    await rebuildCultureNotificationQueue({ db: admin.database(), userId, guildId });
    return null;
  }
);

exports.syncCultureNotificationsOnAlarmChange = onValueWritten(
  {
    ref: "/users/{userId}/{guildId}/culture/cultureAlarm",
    region: "europe-west1",
  },
  async (event) => {
    const { userId, guildId } = event.params;
    await rebuildCultureNotificationQueue({ db: admin.database(), userId, guildId });
    return null;
  }
);

exports.processCultureNotificationQueue = onSchedule(
  { schedule: "every 1 minutes", region: "europe-west1", timeZone: "Europe/Kiev" },
  async () => {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const db = admin.database();
    const guildsSnap = await db.ref("guilds").once("value");
    if (!guildsSnap.exists()) return null;

    const guildIds = Object.keys(guildsSnap.val() || {});
    await Promise.all(
      guildIds.map(async (guildId) => {
        const membersSnap = await db.ref(`/guilds/${guildId}/guildUsers`).once("value");
        if (!membersSnap.exists()) return;

          const memberIds = Object.keys(membersSnap.val() || {});
          await Promise.all(
            memberIds.map(async (userId) => {
            const queueRef = db.ref(`/users/${userId}/${guildId}/settlement/cultureNotificationQueue`);
            const snapshot = await queueRef.orderByChild("notificationTime").endAt(nowInSeconds).once("value");
            if (!snapshot.exists()) return;

            const tasks = [];
            snapshot.forEach((child) => {
              const task = child.val();
              if (task?.status === "pending") {
                tasks.push(
                  sendCulturePushAndMarkSent({
                    db,
                    userId,
                    guildId,
                    queuePath: `/users/${userId}/${guildId}/settlement/cultureNotificationQueue/${child.key}`,
                    task,
                  })
                );
              }
            });

            await Promise.all(tasks);
          })
        );
      })
    );

    return null;
  }
);

/**
 * =====================================================================
 * ✅ Scheduled messages
 * =====================================================================
 */
exports.sendScheduledMessages = onSchedule(
  { schedule: "every 1 minutes", region: "europe-west1", timeZone: "Europe/Kiev" },
  async () => {
    const now = Date.now();
    const db = admin.database();
    const guildsSnap = await db.ref("guilds").once("value");
    if (!guildsSnap.exists()) return null;

    const guildIds = Object.keys(guildsSnap.val() || {});
    const guildPromises = guildIds.map(async (guildId) => {
      const scheduledMessagesRef = db.ref(`/guilds/${guildId}/scheduledMessages`);
      const query = scheduledMessagesRef.orderByChild("status").equalTo("pending");
      const snapshot = await query.once("value");
      if (!snapshot.exists()) return;

      const promises = [];
      snapshot.forEach((childSnapshot) => {
        const messageId = childSnapshot.key;
        const messageData = childSnapshot.val();
        if (messageData.sendAt <= now) {
          promises.push(moveMessageToChat({ guildId, messageId, messageData, db }));
        }
      });

      await Promise.all(promises);
    });

    await Promise.all(guildPromises);
    return null;
  }
);

async function moveMessageToChat({ guildId, messageId, messageData, db }) {
  const { chatId, text, senderId } = messageData;
  if (!guildId) return null;
  if (!chatId) {
    return db.ref(`/guilds/${guildId}/scheduledMessages/${messageId}`).update({ status: "error" });
  }
  const chatMessagesRef = db.ref(`/guilds/${guildId}/chats/${chatId}/messages`);
  const finalMessage = { senderId, text, status: "sent", timestamp: admin.database.ServerValue.TIMESTAMP };
  await chatMessagesRef.push(finalMessage);
  await sendChatNotificationForMessage({ guildId, chatId, messageData, db });
  return db.ref(`/guilds/${guildId}/scheduledMessages/${messageId}`).remove();
}

/**
 * =====================================================================
 * ✅ GBG: build queue for sector open notifications
 * =====================================================================
 */
exports.syncGbgNotifications = onValueWritten(
  {
    ref: "/guilds/{guildId}/GBG/sectors/{sectorId}",
    region: "europe-west1",
  },
  async (event) => {
    const guildId = String(event.params.guildId || "");
    if (!guildId) return null;
    const shortGuildId = guildId.includes("_") ? guildId.split("_").pop() : guildId;

    const db = admin.database();
    const LEAD_TIME_SECONDS = 120;
    const TIME_TOLERANCE = 120;

    const mapNameSnap = await db.ref(`/guilds/${guildId}/GBG/map`).once("value");
    const mapName = mapNameSnap.exists() ? mapNameSnap.val() : "volcano_archipelago";

    const [allSectorsSnap, mapTopologySnap, currentQueueSnap] = await Promise.all([
      db.ref(`/guilds/${guildId}/GBG/sectors`).once("value"),
      db.ref(`maps/${mapName}`).once("value"),
      db.ref(`/guilds/${guildId}/GBG/gbgNotificationQueue`).once("value"),
    ]);

    if (!allSectorsSnap.exists() || !mapTopologySnap.exists()) return null;

    const allSectors = allSectorsSnap.val();
    const mapTopology = mapTopologySnap.val();
    const currentQueue = currentQueueSnap.exists() ? currentQueueSnap.val() : {};

    const mySectors = [];
    Object.keys(allSectors).forEach((key) => {
      const sec = allSectors[key];
      const owner = String(sec.owner || sec.ownerId || "0");
      if (owner === shortGuildId) mySectors.push(key);
    });

    const targetSet = new Set();

    mySectors.forEach((mySectorId) => {
      let neighborList = [];
      const rawNeighbors = mapTopology[mySectorId];

      if (rawNeighbors) {
        if (Array.isArray(rawNeighbors)) {
          neighborList = rawNeighbors;
        } else if (typeof rawNeighbors === "object") {
          neighborList = Object.values(rawNeighbors);
        }
      }

      neighborList.forEach((neighborId) => {
        if (neighborId && allSectors[neighborId]) {
          targetSet.add(neighborId);
        }
      });
    });

    const nowInSeconds = Math.floor(Date.now() / 1000);
    const updates = {};
    const processedTaskIds = new Set();

    for (const targetId of targetSet) {
      const sec = allSectors[targetId];
      const owner = String(sec.owner || sec.ownerId || "0");
      const openTime = Number(sec.openTime);
      const armyRaw = String(sec.army || "").toLowerCase();
      const armyType = armyRaw === "attack" ? "attack" : "defense";

      if (owner !== shortGuildId && !isNaN(openTime) && openTime > 0) {
        if (openTime < nowInSeconds - 300) continue;

        const taskId = `${guildId}_${targetId}`;
        processedTaskIds.add(taskId);

        if (currentQueue[taskId]) {
          const existingTask = currentQueue[taskId];

          if (existingTask.status === "processing") continue;

          if (existingTask.status === "sent") {
            if (Math.abs(existingTask.openTime - openTime) < TIME_TOLERANCE) {
              continue;
            }
          }
        }

        const idealNotifyTime = openTime - LEAD_TIME_SECONDS;
        let finalNotifyTime = idealNotifyTime;

        if (idealNotifyTime < nowInSeconds) {
          if (openTime > nowInSeconds) {
            finalNotifyTime = nowInSeconds;
          } else {
            continue;
          }
        }

        updates[`/guilds/${guildId}/GBG/gbgNotificationQueue/${taskId}`] = {
          guildId: String(guildId),
          shortGuildId: shortGuildId,
          sectorId: String(targetId),
          openTime: openTime,
          notificationTime: finalNotifyTime,
          army: armyType,
          status: "pending",
        };
      }
    }

    Object.keys(currentQueue).forEach((taskId) => {
      if (!processedTaskIds.has(taskId)) {
        const task = currentQueue[taskId];
        if (task.status === "pending") {
          updates[`/guilds/${guildId}/GBG/gbgNotificationQueue/${taskId}`] = null;
        } else if (task.status === "sent") {
          if (task.openTime < nowInSeconds - 21600) {
            updates[`/guilds/${guildId}/GBG/gbgNotificationQueue/${taskId}`] = null;
          }
        }
      }
    });

    if (Object.keys(updates).length > 0) {
      await db.ref().update(updates);
    }

    // ✅ Тихий refresh віджета (data-only)
    try {
      const sectorId = String(event.params.sectorId || "");
      await sendWidgetRefreshToGuild({ guildId, reason: "sector_write", sectorId });
    } catch (e) {
      logger.error("[WidgetRefresh] inside syncGbgNotifications error:", e);
    }

    return null;
  }
);

exports.processGbgNotificationQueue = onSchedule(
  {
    schedule: "every 1 minutes",
    region: "europe-west1",
    timeZone: "Europe/Kiev",
    secrets: [TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID],
  },
  async () => {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const db = admin.database();
    const guildsSnap = await db.ref("guilds").once("value");
    if (!guildsSnap.exists()) return null;

    const guildIds = Object.keys(guildsSnap.val() || {});
    const guildPromises = guildIds.map(async (guildId) => {
      const queueRef = db.ref(`/guilds/${guildId}/GBG/gbgNotificationQueue`);
      const query = queueRef.orderByChild("notificationTime").endAt(nowInSeconds);
      const snapshot = await query.once("value");

      if (!snapshot.exists()) return;

      const promises = [];
      snapshot.forEach((child) => {
        const task = child.val();
        const taskId = child.key;
        const queuePath = `/guilds/${guildId}/GBG/gbgNotificationQueue/${taskId}`;

        if (task.status === "pending") {
          promises.push(sendPushAndMarkSent({ taskId, task, db, queuePath }));
        }
      });

      await Promise.all(promises);
    });

    await Promise.all(guildPromises);
    return null;
  }
);

async function sendPushAndMarkSent({ taskId, task, db, queuePath }) {
  const { guildId, sectorId, army, openTime } = task;
  const nowInSeconds = Math.floor(Date.now() / 1000);

  if (openTime > nowInSeconds + 180) {
    logger.warn(
      `[EARLY DETECTED] Task ${taskId} triggered too early. OpenTime: ${openTime}, Now: ${nowInSeconds}. Rescheduling.`
    );

    const correctNotifyTime = openTime - 120;

    return db.ref(queuePath).update({
      notificationTime: correctNotifyTime,
      status: "pending",
    });
  }

  await db.ref(queuePath).update({ status: "processing" });

  const membersSnap = await db.ref(`/guilds/${guildId}/guildUsers`).once("value");
  if (!membersSnap.exists()) {
    return db.ref(queuePath).remove();
  }

  const memberIds = Object.keys(membersSnap.val());
  const nowMs = Date.now();

  const userInfos = await Promise.all(
    memberIds.map(async (uid) => {
      const tokenSnap = await db.ref(`/users/${uid}/fcmToken`).once("value");
      const token = tokenSnap.exists() ? tokenSnap.val() : null;
      if (!token) return { uid, token: null, sound: false };

      let soundBySchedule = true;
      try {
        const { timeZone, schedules } = await getUserScheduleForNotifications(uid);
        soundBySchedule = isUserActiveNowBySchedules(schedules, nowMs, timeZone);
      } catch (e) {
        logger.error("[GBG] schedule check error:", e);
        soundBySchedule = true;
      }

      return { uid, token, sound: !!soundBySchedule };
    })
  );

  const soundTokens = userInfos.filter((x) => x.token && x.sound).map((x) => x.token);
  const silentTokens = userInfos.filter((x) => x.token && !x.sound).map((x) => x.token);

  const isAttack = army === "attack";
  const icon = isAttack ? "⚔️" : "🛡️";
  const actionText = isAttack ? "Атака!" : "Захист!";

  const titleText = `${icon} Поле битви`;
  const messageText = `${icon} Сектор ${sectorId} скоро відкриється! (${actionText})`;

  // ✅ Telegram: ТІЛЬКИ “людський” текст (без guildId/sector/openTime)
  try {
    const tgText = `<b>${titleText}</b>\n${messageText}\n`;
    await sendTelegramMessage({ text: tgText, parseMode: "HTML" });
  } catch (e) {
    logger.error("[TG] error while sending:", e);
  }

  if (soundTokens.length > 0) {
    const payloadSound = {
      data: {
        screen: "GBG",
        sectorId: String(sectorId),
        title: titleText,
        body: messageText,
        type: "gbg_sector_open",
        sound: "1",
      },
      android: {
        priority: "high",
        notification: { title: titleText, body: messageText, sound: "alert", channel_id: "gbg_sector" },
      },
      apns: {
        payload: { aps: { alert: { title: titleText, body: messageText }, sound: "default", "content-available": 1 } },
      },
    };

    try {
      await admin.messaging().sendEachForMulticast({ tokens: soundTokens, ...payloadSound });
      logger.log(`[PUSH SENT SOUND] ${sectorId} sent to ${soundTokens.length} users.`);
    } catch (e) {
      logger.error("[GBG] sound send error:", e);
    }
  }

  if (silentTokens.length > 0) {
    const payloadSilent = {
      data: {
        screen: "GBG",
        sectorId: String(sectorId),
        title: titleText,
        body: messageText,
        type: "gbg_sector_open",
        sound: "0",
      },
      android: {
        priority: "high",
        notification: { title: titleText, body: messageText, channel_id: "gbg_sector_silent" },
      },
      apns: { payload: { aps: { alert: { title: titleText, body: messageText }, "content-available": 1 } } },
    };

    try {
      await admin.messaging().sendEachForMulticast({ tokens: silentTokens, ...payloadSilent });
      logger.log(`[PUSH SENT SILENT] ${sectorId} sent to ${silentTokens.length} users.`);
    } catch (e) {
      logger.error("[GBG] silent send error:", e);
    }
  }

  return db.ref(queuePath).update({
    status: "sent",
    sentAt: admin.database.ServerValue.TIMESTAMP,
  });
}

/**
 * =====================================================================
 * ✅ GBG build-plan helpers / maps
 * =====================================================================
 */

const GBG_BUILDING_BONUS_MAP = {
  guild_command_post_improvised: { attackBonus: 20, defenseRequirementBonus: 5, productionBonus: 15, flatProductionBonus: 0 },
  guild_command_post_forward: { attackBonus: 40, defenseRequirementBonus: 10, productionBonus: 30, flatProductionBonus: 0 },
  guild_command_post_fortified: { attackBonus: 60, defenseRequirementBonus: 30, productionBonus: 100, flatProductionBonus: 0 },
  barracks_improvised: { attackBonus: 20, defenseRequirementBonus: 5, productionBonus: 0, flatProductionBonus: 0 },
  barracks: { attackBonus: 40, defenseRequirementBonus: 10, productionBonus: 0, flatProductionBonus: 0 },
  barracks_reinforced: { attackBonus: 60, defenseRequirementBonus: 30, productionBonus: 0, flatProductionBonus: 0 },
  basic_field_outpost_diamond: { attackBonus: 20, defenseRequirementBonus: 5, productionBonus: 0, flatProductionBonus: 25 },
  regular_field_outpost_diamond: { attackBonus: 40, defenseRequirementBonus: 10, productionBonus: 0, flatProductionBonus: 50 },
  advanced_field_outpost_diamond: { attackBonus: 60, defenseRequirementBonus: 30, productionBonus: 0, flatProductionBonus: 100 },
  guild_fieldcamp_small: { attackBonus: 26, defenseRequirementBonus: 0, productionBonus: 0, flatProductionBonus: 0 },
  guild_fieldcamp: { attackBonus: 52, defenseRequirementBonus: 0, productionBonus: 0, flatProductionBonus: 0 },
  guild_fieldcamp_fortified: { attackBonus: 80, defenseRequirementBonus: 0, productionBonus: 0, flatProductionBonus: 0 },
  basic_guild_fortress_diamond: { attackBonus: 26, defenseRequirementBonus: 0, productionBonus: 0, flatProductionBonus: 0 },
  regular_guild_fortress_diamond: { attackBonus: 52, defenseRequirementBonus: 0, productionBonus: 0, flatProductionBonus: 0 },
  advanced_guild_fortress_diamond: { attackBonus: 80, defenseRequirementBonus: 0, productionBonus: 0, flatProductionBonus: 0 },
};

const GBG_BUILDING_NAME_MAP = {
  guild_command_post_improvised: "Базовий польовий табір",
  guild_command_post_forward: "Звичайний польовий табір",
  guild_command_post_fortified: "Покращений польовий табір",
  barracks_improvised: "Базові казарми гільдії",
  barracks: "Звичайні казарми гільдії",
  barracks_reinforced: "Покращені казарми гільдії",
  basic_field_outpost_diamond: "Базовий польовий аванпост",
  regular_field_outpost_diamond: "Звичайний польовий аванпост",
  advanced_field_outpost_diamond: "Покращений польовий аванпост",
};

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  return [];
};

const getMapBaseDefense = (mapNameRaw) => {
  const mapName = String(mapNameRaw || "").toLowerCase();
  if (mapName === "waterfall_archipelago") return 100;
  if (mapName === "volcano_archipelago" || mapName === "volcanic_archipelago") return 110;
  return 110;
};

const getBuildingBonusesById = (buildingIdRaw) => {
  const key = String(buildingIdRaw || "").toLowerCase();
  return GBG_BUILDING_BONUS_MAP[key] || { attackBonus: 0, defenseRequirementBonus: 0, productionBonus: 0, flatProductionBonus: 0 };
};

const getPercentLimit = (amount) => {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric * 0.01;
};

const buildSectorConstructionVariants = ({ freeSlots, options, treasury }) => {
  const out = [];
  const normalizedSlots = Number(freeSlots);
  if (!Number.isFinite(normalizedSlots) || normalizedSlots <= 0) return out;
  if (!Array.isArray(options) || options.length === 0) return out;

  const walk = (slotIndex, planned, spent) => {
    if (slotIndex >= normalizedSlots) {
      out.push({ planned: [...planned], spent: { ...spent } });
      return;
    }

    options.forEach((option) => {
      const buildingId = String(option.buildingId || "").toLowerCase();
      if (!buildingId) return;
      const resources = option.resources || {};
      const spentNext = { ...spent };
      let valid = true;

      Object.entries(resources).forEach(([resourceKey, rawCost]) => {
        if (!valid) return;
        const cost = Number(rawCost);
        if (!Number.isFinite(cost) || cost <= 0) return;

        const treasuryTotal = Number(treasury?.[resourceKey] || 0);
        const prevSpent = Number(spentNext[resourceKey] || 0);
        const remainingBeforeThisSlot = treasuryTotal - prevSpent;
        if (remainingBeforeThisSlot <= 0) {
          valid = false;
          return;
        }

        if (cost > getPercentLimit(remainingBeforeThisSlot)) {
          valid = false;
          return;
        }

        spentNext[resourceKey] = prevSpent + cost;
      });

      if (!valid) return;

      planned.push(buildingId);
      walk(slotIndex + 1, planned, spentNext);
      planned.pop();
    });
  };

  walk(0, [], {});
  return out;
};

const evaluateSectorVariant = ({ existingBuildings, plannedBuildings, victoryPoints, mapBaseDefense }) => {
  const allBuildings = [...existingBuildings, ...plannedBuildings];
  const sums = allBuildings.reduce(
    (acc, buildingId) => {
      const b = getBuildingBonusesById(buildingId);
      acc.attack += Number(b.attackBonus) || 0;
      acc.defenseRequirement += Number(b.defenseRequirementBonus) || 0;
      acc.productionPercent += Number(b.productionBonus) || 0;
      acc.productionFlat += Number(b.flatProductionBonus) || 0;
      return acc;
    },
    { attack: 0, defenseRequirement: 0, productionPercent: 0, productionFlat: 0 }
  );

  const vp = Number(victoryPoints) || 0;
  const defenseRequirement = mapBaseDefense + (sums.defenseRequirement * mapBaseDefense) / 100;
  const production = vp + (vp * sums.productionPercent) / 100 + sums.productionFlat;

  return { sums, defenseRequirement, production };
};

const formatRecommendedBuildings = (plannedBuildings) => {
  const ordered = [];
  const counts = new Map();

  (plannedBuildings || []).forEach((idRaw) => {
    const id = String(idRaw || "").toLowerCase();
    if (!id) return;
    const name = GBG_BUILDING_NAME_MAP[id] || id;
    if (!counts.has(name)) ordered.push(name);
    counts.set(name, (counts.get(name) || 0) + 1);
  });

  return ordered
    .map((name) => {
      const count = counts.get(name) || 0;
      return count > 1 ? `${count} ${name}` : name;
    })
    .join(",\n");
};

/**
 * =====================================================================
 * ✅ Schedule build check after capture
 * =====================================================================
 */
exports.scheduleGbgSectorBuildCheck = onValueWritten(
  {
    ref: "/guilds/{guildId}/GBG/sectors/{sectorId}",
    region: "europe-west1",
  },
  async (event) => {
    const guildId = String(event.params.guildId || "");
    const sectorId = String(event.params.sectorId || "");
    if (!guildId || !sectorId) return null;

    const shortGuildId = guildId.includes("_") ? guildId.split("_").pop() : guildId;
    const before = event.data.before.exists() ? event.data.before.val() : null;
    const after = event.data.after.exists() ? event.data.after.val() : null;
    if (!after || typeof after !== "object") return null;

    const prevOwner = getSectorOwnerKey(before);
    const nextOwner = getSectorOwnerKey(after);
    if (nextOwner !== String(shortGuildId)) return null;
    if (prevOwner === String(shortGuildId)) return null;

    const nowSec = Math.floor(Date.now() / 1000);
    const runAt = nowSec + 300;
    const taskId = `${sectorId}_${runAt}`;

    await admin.database().ref(`/guilds/${guildId}/GBG/buildCheckQueue/${taskId}`).set({
      guildId,
      sectorId,
      capturedAt: nowSec,
      runAt,
      status: "pending",
    });

    return null;
  }
);

exports.processGbgSectorBuildChecks = onSchedule(
  {
    schedule: "every 1 minutes",
    region: "europe-west1",
    timeZone: "Europe/Kiev",
    // ✅ TG SECRETS: щоб Telegram працював у цьому scheduler
    secrets: [TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID],
  },
  async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const db = admin.database();
    const guildsSnap = await db.ref("guilds").once("value");
    if (!guildsSnap.exists()) return null;

    const guildIds = Object.keys(guildsSnap.val() || {});
    await Promise.all(
      guildIds.map(async (guildId) => {
        const queueRef = db.ref(`/guilds/${guildId}/GBG/buildCheckQueue`);
        const dueSnap = await queueRef.orderByChild("runAt").endAt(nowSec).once("value");
        if (!dueSnap.exists()) return;

        const tasks = [];
        dueSnap.forEach((child) => {
          const task = child.val() || {};
          if (task.status !== "pending") return;
          tasks.push({ taskId: child.key, task });
        });

        await Promise.all(
          tasks.map(async ({ taskId, task }) => {
            const queuePath = `/guilds/${guildId}/GBG/buildCheckQueue/${taskId}`;

            try {
              await db.ref(queuePath).update({ status: "processing", processingAt: nowSec });

              const sectorId = String(task.sectorId || "");
              if (!sectorId) {
                await db.ref(queuePath).remove();
                return;
              }

              const [sectorSnap, resourcesSnap, settingSnap, mapSnap, membersSnap] = await Promise.all([
                db.ref(`/guilds/${guildId}/GBG/sectors/${sectorId}`).once("value"),
                db.ref(`/guilds/${guildId}/resources`).once("value"),
                db.ref(`/guilds/${guildId}/setting`).once("value"),
                db.ref(`/guilds/${guildId}/GBG/map`).once("value"),
                db.ref(`/guilds/${guildId}/guildUsers`).once("value"),
              ]);

              if (!sectorSnap.exists()) {
                await db.ref(queuePath).remove();
                return;
              }

              const sector = sectorSnap.val() || {};
              const freeSlots = Number(sector.freeSlots || 0);
              if (!Number.isFinite(freeSlots) || freeSlots <= 0) {
                await db.ref(queuePath).remove();
                return;
              }

              const existingBuildings = toArray(sector.buildings)
                .map((b) => String(b?.name || "").toLowerCase())
                .filter(Boolean);

              const availableBuildingOptions = toArray(sector.availableBuildings)
                .map((item) => ({
                  buildingId: String(item?.buildingId || "").toLowerCase(),
                  resources: item?.costs?.resources || {},
                }))
                .filter((item) => !!item.buildingId);

              if (availableBuildingOptions.length === 0) {
                await db.ref(queuePath).remove();
                return;
              }

              const treasury = resourcesSnap.exists() ? (resourcesSnap.val() || {}) : {};
              const mapName = mapSnap.exists() ? mapSnap.val() : "volcano_archipelago";
              const mapBaseDefense = getMapBaseDefense(mapName);
              const victoryPoints = Number(sector.victoryPoints || 0);
              const gbgGoal = !!(settingSnap.exists() ? settingSnap.val()?.GBGGoal : false);

              const variants = buildSectorConstructionVariants({ freeSlots, options: availableBuildingOptions, treasury });
              if (!variants.length) {
                await db.ref(queuePath).remove();
                return;
              }

              const evaluated = variants
                .map((variant) => {
                  const metrics = evaluateSectorVariant({
                    existingBuildings,
                    plannedBuildings: variant.planned,
                    victoryPoints,
                    mapBaseDefense,
                  });
                  return { ...variant, ...metrics };
                })
                .filter((v) => (Number(v?.sums?.attack) || 0) >= 80);

              if (!evaluated.length) {
                await db.ref(queuePath).remove();
                return;
              }

              let best = evaluated[0];
              for (let i = 1; i < evaluated.length; i += 1) {
                const cur = evaluated[i];
                if (gbgGoal) {
                  if (cur.production > best.production) best = cur;
                } else if (cur.defenseRequirement > best.defenseRequirement) {
                  best = cur;
                }
              }

              if (!membersSnap.exists()) {
                await db.ref(queuePath).remove();
                return;
              }

              const memberIds = Object.keys(membersSnap.val() || {});
              const leaderInfos = await Promise.all(
                memberIds.map(async (uid) => {
                  const roleSnap = await db.ref(`/users/${uid}/${guildId}/role`).once("value");
                  const role = roleSnap.exists() ? String(roleSnap.val() || "") : "";
                  if (role !== "guildLeader" && role !== "tester") return null;

                  const tokenSnap = await db.ref(`/users/${uid}/fcmToken`).once("value");
                  const token = tokenSnap.exists() ? tokenSnap.val() : null;
                  if (!token) return null;

                  return token;
                })
              );

              const tokens = Array.from(new Set(leaderInfos.filter(Boolean)));
              if (!tokens.length) {
                await db.ref(queuePath).remove();
                return;
              }

              const plannedReadable = formatRecommendedBuildings(best.planned);
              const titleText = "🛠️ Рекомендовано побудувати";
              const messageText = `Сектор ${sectorId}. Рекомендоно побудувати:\n${plannedReadable}`;

              const chunks = chunkArray(tokens, 500);
              await Promise.all(
                chunks.map((chunk) =>
                  admin.messaging().sendEachForMulticast({
                    tokens: chunk,
                    data: {
                      screen: "GBG",
                      type: "gbg_build_plan",
                      title: titleText,
                      body: messageText,
                      guildId: String(guildId),
                      sectorId: String(sectorId),
                    },
                    notification: { title: titleText, body: messageText },
                    android: { priority: "high", notification: { channel_id: "gbg_build", sound: "build" } },
                    apns: { payload: { aps: { sound: "default" } } },
                  })
                )
              );

              // ✅ TG BUILD PLAN: дублюємо в Telegram (без технічних полів)
              try {
                const tgText =
                  `<b>${titleText}</b>\n` +
                  `Сектор <b>${sectorId}</b>\n` +
                  `Рекомендовано побудувати:\n` +
                  `${plannedReadable}`;

                await sendTelegramMessage({ text: tgText, parseMode: "HTML" });
              } catch (e) {
                logger.error("[TG] build plan send error:", e);
              }

              await db.ref(queuePath).remove();
            } catch (e) {
              logger.error("[GBG_BUILD_CHECK] processing error", { guildId, taskId, error: e?.message || e });
              await db.ref(queuePath).remove();
            }
          })
        );
      })
    );

    return null;
  }
);

/**
 * =====================================================================
 * ✅ Help notification (callable)
 * =====================================================================
 */
exports.sendGbgHelpNotification = onCall({ region: "europe-west1" }, async (request) => {
  const { guildId } = request.data;
  if (!guildId) return { success: false };

  const db = admin.database();
  const membersSnap = await db.ref(`/guilds/${guildId}/guildUsers`).once("value");
  if (!membersSnap.exists()) return { success: false };

  const memberIds = Object.keys(membersSnap.val());
  const tokensPromises = memberIds.map((uid) => db.ref(`/users/${uid}/fcmToken`).once("value"));
  const tokensSnaps = await Promise.all(tokensPromises);
  const tokens = tokensSnaps.map((s) => s.val()).filter(Boolean);

  if (tokens.length > 0) {
    const titleText = "🆘 Потрібна допомога!";
    const messageText = "Терміново потрібна допомога на полях битв!";

    const payload = {
      data: { screen: "GBG", title: titleText, body: messageText },
      android: {
        priority: "high",
        notification: { title: titleText, body: messageText, sound: "default", channel_id: "default" },
      },
      apns: {
        payload: { aps: { alert: { title: titleText, body: messageText }, sound: "default", "content-available": 1 } },
      },
    };
    try {
      await admin.messaging().sendEachForMulticast({ tokens, ...payload });
    } catch (e) {
      logger.error(e);
    }
  }
  return { success: true };
});
