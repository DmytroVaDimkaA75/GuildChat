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
      await admin.messaging().sendEachForMulticast({
        tokens: chunk,
        data: dataPayload,
        android: { priority: "high" },
        apns: {
          payload: { aps: { "content-available": 1 } },
          headers: { "apns-priority": "5" },
        },
      });
    } catch (e) {
      logger.error("[WidgetRefresh] sendEachForMulticast error:", e);
    }
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
// TZ: users/{uid}/setting/timeZone
// scheduleId: users/{uid}/setting/notificationScheduleId (або activeScheduleId) (якщо немає — беремо перший)
const getUserScheduleForNotifications = async (uid) => {
  const settingSnap = await admin.database().ref(`/users/${uid}/setting`).once("value");
  const setting = settingSnap.exists() ? (settingSnap.val() || {}) : {};

  const timeZone = setting.timeZone || "UTC";
  const preferredId = setting.notificationScheduleId || setting.activeScheduleId || null;

  const schedulesSnap = await admin.database().ref(`/users/${uid}/setting/schedules`).once("value");
  if (!schedulesSnap.exists()) {
    return { timeZone, schedule: null };
  }

  const schedules = schedulesSnap.val() || {};
  let scheduleId = preferredId;

  if (!scheduleId || !schedules[scheduleId]) {
    scheduleId = Object.keys(schedules)[0] || null;
  }

  const schedule = scheduleId ? schedules[scheduleId] : null;
  return { timeZone, schedule };
};

/**
 * =====================================================================
 * ✅ 1) Callable тест для кнопки “Тест data-only”
 * НЕ ламає існуючі sendGbgHelpNotification / sendChatNotification тощо.
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
 * ✅ 2) Тригери на opponents і map (окремі ref => без конфліктів)
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

/**
 * =====================================================================
 * ✅ ТВОЇ ІСНУЮЧІ ФУНКЦІЇ (без перейменувань і без конфліктів)
 * =====================================================================
 */

exports.sendChatNotification = onValueCreated(
  {
    ref: "/guilds/{guildId}/chats/{chatId}/messages/{messageId}",
    region: "europe-west1",
  },
  async (event) => {
    const { guildId, chatId } = event.params;
    const messageData = event.data.val();
    if (!messageData) return null;

    const senderId = messageData.senderId;
    const messageText = messageData.text || "Отправлено изображение";

    const chatRef = admin.database().ref(`/guilds/${guildId}/chats/${chatId}`);
    const chatSnapshot = await chatRef.once("value");
    const chatData = chatSnapshot.val();
    if (!chatData || !chatData.members) return null;

    const members = Object.keys(chatData.members);
    const senderProfile = await admin.database().ref(`/users/${senderId}`).once("value");
    const senderName = senderProfile.val()?.userName || "Новое сообщение";

    // ✅ Отримувачі (без відправника)
    const recipients = members.filter((m) => m !== senderId);
    if (!recipients.length) return null;

    const nowMs = Date.now();

    // ✅ Для кожного отримувача визначаємо: token + (members flag) + (schedule)
    const userInfos = await Promise.all(
      recipients.map(async (uid) => {
        const tokenSnap = await admin.database().ref(`/users/${uid}/fcmToken`).once("value");
        const token = tokenSnap.exists() ? tokenSnap.val() : null;
        if (!token) return { uid, token: null, sound: false };

        // ✅ якщо members/{uid} === true -> звук може бути, інакше завжди тихо
        const chatSoundEnabled = chatData.members?.[uid] === true;
        if (!chatSoundEnabled) return { uid, token, sound: false };

        // ✅ якщо графік дозволяє -> зі звуком
        let soundBySchedule = true;
        try {
          const { timeZone, schedule } = await getUserScheduleForNotifications(uid);
          soundBySchedule = isUserActiveNow(schedule, nowMs, timeZone);
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

    return null;
  }
);

exports.sendScheduledMessages = onSchedule(
  { schedule: "every 1 minutes", region: "europe-west1", timeZone: "Europe/Kiev" },
  async (event) => {
    const now = Date.now();
    const db = admin.database();
    const scheduledMessagesRef = db.ref("scheduledMessages");
    const query = scheduledMessagesRef.orderByChild("status").equalTo("pending");
    const snapshot = await query.once("value");
    if (!snapshot.exists()) return null;

    const promises = [];
    snapshot.forEach((childSnapshot) => {
      const messageId = childSnapshot.key;
      const messageData = childSnapshot.val();
      if (messageData.sendAt <= now) {
        promises.push(moveMessageToChat(messageId, messageData, db));
      }
    });

    await Promise.all(promises);
    return null;
  }
);

async function moveMessageToChat(messageId, messageData, db) {
  const { guildId, chatId, text, senderId } = messageData;
  if (!guildId || !chatId) return db.ref(`scheduledMessages/${messageId}`).update({ status: "error" });
  const chatMessagesRef = db.ref(`/guilds/${guildId}/chats/${chatId}/messages`);
  const finalMessage = { senderId, text, status: "sent", timestamp: admin.database.ServerValue.TIMESTAMP };
  await chatMessagesRef.push(finalMessage);
  return db.ref(`scheduledMessages/${messageId}`).update({ status: "sent" });
}

exports.syncGbgNotifications = onValueWritten(
  {
    ref: "/guilds/{guildId}/GBG/sectors/{sectorId}",
    region: "europe-west1",
  },
  async (event) => {
    const triggeredGuildId = event.params.guildId;
    if (triggeredGuildId && !String(triggeredGuildId).includes("10821")) {
      return null;
    }

    const guildId = "ru11_10821";
    const shortGuildId = "10821";

    const db = admin.database();
    const LEAD_TIME_SECONDS = 120;
    const TIME_TOLERANCE = 120;

    const mapNameSnap = await db.ref(`/guilds/${guildId}/GBG/map`).once("value");
    const mapName = mapNameSnap.exists() ? mapNameSnap.val() : "volcano_archipelago";

    const [allSectorsSnap, mapTopologySnap, currentQueueSnap] = await Promise.all([
      db.ref(`/guilds/${guildId}/GBG/sectors`).once("value"),
      db.ref(`maps/${mapName}`).once("value"),
      db.ref("gbgNotificationQueue").orderByChild("guildId").equalTo(guildId).once("value"),
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

        updates[`gbgNotificationQueue/${taskId}`] = {
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
          updates[`gbgNotificationQueue/${taskId}`] = null;
        } else if (task.status === "sent") {
          if (task.openTime < nowInSeconds - 21600) {
            updates[`gbgNotificationQueue/${taskId}`] = null;
          }
        }
      }
    });

    if (Object.keys(updates).length > 0) {
      await db.ref().update(updates);
    }

    // ✅ Тихий refresh віджета (data-only), НЕ ламає твою чергу пушів
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
    // ✅ add secrets for runtime
    secrets: [TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID],
  },
  async (event) => {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const db = admin.database();
    const queueRef = db.ref("gbgNotificationQueue");

    const query = queueRef.orderByChild("notificationTime").endAt(nowInSeconds);
    const snapshot = await query.once("value");

    if (!snapshot.exists()) return null;

    const promises = [];
    snapshot.forEach((child) => {
      const task = child.val();
      const key = child.key;

      if (task.status === "pending") {
        promises.push(sendPushAndMarkSent(key, task, db));
      }
    });

    await Promise.all(promises);
    return null;
  }
);

async function sendPushAndMarkSent(taskId, task, db) {
  const { guildId, sectorId, army, openTime } = task;
  const nowInSeconds = Math.floor(Date.now() / 1000);

  if (openTime > nowInSeconds + 180) {
    logger.warn(
      `[EARLY DETECTED] Task ${taskId} triggered too early. OpenTime: ${openTime}, Now: ${nowInSeconds}. Rescheduling.`
    );

    const correctNotifyTime = openTime - 120;

    return db.ref(`gbgNotificationQueue/${taskId}`).update({
      notificationTime: correctNotifyTime,
      status: "pending",
    });
  }

  await db.ref(`gbgNotificationQueue/${taskId}`).update({ status: "processing" });

  const membersSnap = await db.ref(`/guilds/${guildId}/guildUsers`).once("value");
  if (!membersSnap.exists()) {
    return db.ref(`gbgNotificationQueue/${taskId}`).remove();
  }

  const memberIds = Object.keys(membersSnap.val());
  const nowMs = Date.now();

  // ✅ Для кожного користувача визначаємо sound по графіку
  const userInfos = await Promise.all(
    memberIds.map(async (uid) => {
      const tokenSnap = await db.ref(`/users/${uid}/fcmToken`).once("value");
      const token = tokenSnap.exists() ? tokenSnap.val() : null;
      if (!token) return { uid, token: null, sound: false };

      let soundBySchedule = true;
      try {
        const { timeZone, schedule } = await getUserScheduleForNotifications(uid);
        soundBySchedule = isUserActiveNow(schedule, nowMs, timeZone);
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

  // ✅ Telegram: duplicate the push into channel
  // (самі пуші не блокуємо, якщо TG впаде)
  try {
    const tgText =
      `<b>${titleText}</b>\n` +
      `${messageText}\n` +
      `<code>guildId:</code> ${String(guildId)}\n` +
      `<code>sector:</code> ${String(sectorId)}\n` +
      `<code>openTime:</code> ${String(openTime)}`;

    await sendTelegramMessage({ text: tgText, parseMode: "HTML" });
  } catch (e) {
    logger.error("[TG] error while sending:", e);
  }

  // ✅ 1) Зі звуком
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

  // ✅ 2) Тихо (без звуку)
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

  return db.ref(`gbgNotificationQueue/${taskId}`).update({
    status: "sent",
    sentAt: admin.database.ServerValue.TIMESTAMP,
  });
}

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
