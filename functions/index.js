const { onValueCreated, onValueWritten } = require("firebase-functions/v2/database");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { HttpsError, onCall, onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const {
  createTelegramBindingFunctions,
  isValidTelegramBinding,
  normalizeTelegramNumericChatId,
  telegramApiRequest,
} = require("./telegramBinding");
const {
  isUserActiveNowBySchedules,
} = require("./notificationSchedule");
const {
  ApiValidationError,
  GUARANTEE_STATUSES,
  calculateGuarantee,
  writeIfCurrent,
} = require("./gbGuarantee");
const {
  isGbgNotificationSoundMuted,
} = require("./gbgNotificationMute");
const { fetchLinkPreview } = require("./linkPreview");
const { fetchYouTubeChannelFeed } = require("./youtubeFeed");
const { ARC_CONTRIBUTION_BOOSTS } = require("./arcLevels");
const { PUSH: EXPRESS_PUSH, advanceExpress, uniqueAvailableIds } = require("./expressWorkflow");
const {
  buildQuantumSectorNotification,
  collectUserFcmTokens,
  isQuantumSectorOpening,
} = require("./quantumNotifications");

admin.initializeApp();

const linkPreviewCache = new Map();
const LINK_PREVIEW_CACHE_TTL_MS = 30 * 60 * 1000;
const youtubeFeedCache = { value: null, expiresAt: 0 };
const YOUTUBE_FEED_CACHE_TTL_MS = 15 * 60 * 1000;

exports.getLinkPreview = onCall({ region: "europe-west1", timeoutSeconds: 15, memory: "256MiB" }, async (request) => {
  const requestedUrl = String(request.data?.url || "").trim();
  const cached = linkPreviewCache.get(requestedUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    const value = await fetchLinkPreview(requestedUrl);
    if (value.status === "ok") {
      if (linkPreviewCache.size >= 200) linkPreviewCache.delete(linkPreviewCache.keys().next().value);
      linkPreviewCache.set(requestedUrl, { value, expiresAt: Date.now() + LINK_PREVIEW_CACHE_TTL_MS });
    }
    return value;
  } catch (error) {
    logger.info("[LINK_PREVIEW] Metadata unavailable", { url: requestedUrl.slice(0, 300), reason: error?.message || String(error) });
    return { status: "unavailable", kind: "page", url: requestedUrl, host: "", title: "", description: "", image: "" };
  }
});

exports.getYouTubeChannelVideos = onCall(
  { region: "europe-west1", timeoutSeconds: 15, memory: "256MiB" },
  async () => {
    if (youtubeFeedCache.value && youtubeFeedCache.expiresAt > Date.now()) {
      return youtubeFeedCache.value;
    }

    try {
      const value = await fetchYouTubeChannelFeed();
      youtubeFeedCache.value = value;
      youtubeFeedCache.expiresAt = Date.now() + YOUTUBE_FEED_CACHE_TTL_MS;
      return value;
    } catch (error) {
      logger.warn("[YOUTUBE_FEED] Feed unavailable", {
        reason: error?.message || String(error),
      });
      if (youtubeFeedCache.value) {
        return { ...youtubeFeedCache.value, stale: true };
      }
      throw new HttpsError("unavailable", "Не вдалося завантажити відео каналу.");
    }
  }
);

/**
 * =====================================================================
 * ✅ Telegram secrets
 * =====================================================================
 */
const TELEGRAM_BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");
const normalizeTelegramChatId = normalizeTelegramNumericChatId;

const getGuildTelegramChatId = async ({ db, guildId }) => {
  if (!guildId) return "";

  try {
    const snapshot = await db
      .ref(`/telegramBot/guildBindings/${guildId}`)
      .once("value");
    const binding = snapshot.exists() ? snapshot.val() || {} : null;
    const token = TELEGRAM_BOT_TOKEN.value();

    if (!isValidTelegramBinding({ token, guildId, binding })) {
      if (binding) {
        logger.warn("[TG] Ignoring invalid guild Telegram binding", {
          guildId: String(guildId),
        });
      }
      return "";
    }

    const chatId = normalizeTelegramChatId(binding.chatId);
    if (!chatId) {
      logger.warn("[TG] Invalid Chat ID in verified binding", {
        guildId: String(guildId),
      });
      return "";
    }

    return chatId;
  } catch (error) {
    logger.error("[TG] Could not load guild Telegram settings", {
      guildId: String(guildId),
      error: error?.message || String(error),
    });
    return "";
  }
};

const markGuildTelegramBindingError = async ({
  guildId,
  chatId,
  errorCode,
}) => {
  if (!guildId || !chatId) return;

  try {
    const bindingRef = admin
      .database()
      .ref(`/telegramBot/guildBindings/${guildId}`);
    const snapshot = await bindingRef.once("value");
    const binding = snapshot.exists() ? snapshot.val() || {} : null;
    if (
      !binding ||
      String(binding.chatId || "") !== String(chatId) ||
      binding.status !== "connected"
    ) {
      return;
    }

    await Promise.all([
      bindingRef.update({
        status: "error",
        errorCode,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      }),
      admin
        .database()
        .ref(`/guilds/${guildId}/setting/telegram`)
        .update({
          status: "error",
          errorCode,
          updatedAt: admin.database.ServerValue.TIMESTAMP,
        }),
    ]);
  } catch (error) {
    logger.error("[TG] Could not mark binding as unavailable", {
      guildId: String(guildId),
      error: error?.message || String(error),
    });
  }
};

/**
 * =====================================================================
 * ✅ Telegram helper (send message to channel/group)
 * - Uses Bot API: sendMessage
 * - No external libs required on Node 18+
 * =====================================================================
 */
const sendTelegramMessage = async ({
  chatId,
  text,
  parseMode = "HTML",
  guildId = "",
  notificationType = "unknown",
}) => {
  const token = TELEGRAM_BOT_TOKEN.value();
  const normalizedChatId = normalizeTelegramChatId(chatId);

  if (!token) {
    logger.warn("[TG] Missing TELEGRAM_BOT_TOKEN");
    return false;
  }

  if (!normalizedChatId) {
    if (String(chatId || "").trim()) {
      logger.warn("[TG] Invalid Telegram Chat ID", {
        guildId: String(guildId),
        notificationType,
      });
    }
    return false;
  }

  try {
    const result = await telegramApiRequest({
      token,
      method: "sendMessage",
      body: {
        chat_id: normalizedChatId,
        text: String(text || ""),
        parse_mode: parseMode,
        disable_web_page_preview: true,
      },
    });

    if (!result.ok) {
      logger.error("[TG] sendMessage failed:", {
        guildId: String(guildId),
        notificationType,
        status: result.status,
        description: String(
          result.description || "Unknown Telegram error"
        ),
      });

      if ((result.status === 400 || result.status === 403) && guildId) {
        await markGuildTelegramBindingError({
          guildId: String(guildId),
          chatId: normalizedChatId,
          errorCode:
            result.status === 403
              ? "BOT_ACCESS_LOST"
              : "CHANNEL_UNAVAILABLE",
        });
      }
      return false;
    }

    return true;
  } catch (e) {
    logger.error("[TG] sendMessage error:", {
      guildId: String(guildId),
      notificationType,
      error: e?.message || String(e),
    });
    return false;
  }
};

const telegramBindingFunctions = createTelegramBindingFunctions({
  admin,
  logger,
  onCall,
  onRequest,
  telegramBotToken: TELEGRAM_BOT_TOKEN,
});

exports.createTelegramBindingCode =
  telegramBindingFunctions.createBindingCode;
exports.testTelegramGuildConnection = telegramBindingFunctions.testBinding;
exports.disconnectTelegramGuild = telegramBindingFunctions.disconnectBinding;
exports.telegramWebhook = telegramBindingFunctions.telegramWebhook;

/**
 * =====================================================================
 * ✅ Widget refresh helpers (data-only, без показу нотифікацій)
 * - НЕ конфліктує з існуючими експортами
 * - Snapshot + debounce/collapse не створюють шквал push-подій
 * =====================================================================
 */

const WIDGET_PUSH_TTL_MS = 60 * 1000;
const WIDGET_PUSH_DEBOUNCE_MS = 2500;
const WIDGET_PUSH_MIN_INTERVAL_MS = 5000;
const INVALID_FCM_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

const chunkArray = (arr, size) => {
  const res = [];
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  return res;
};

const getPushWorldContext = async ({ db, guildId, userIds }) => {
  const uniqueUserIds = Array.from(new Set((userIds || []).filter(Boolean).map(String)));
  const result = new Map(uniqueUserIds.map((uid) => [uid, { hasMultipleGuilds: false, worldName: "" }]));
  if (!guildId || !uniqueUserIds.length) return result;

  const [worldNameSnap, ...userGuildSnapshots] = await Promise.all([
    db.ref(`/guilds/${guildId}/worldName`).once("value"),
    ...uniqueUserIds.map((uid) =>
      db.ref(`/users/${uid}/userGuilds`).once("value")
    ),
  ]);
  const worldName = String(worldNameSnap.val() || "").trim();
  uniqueUserIds.forEach((uid, index) => {
    const userGuilds = userGuildSnapshots[index].val() || {};
    result.set(uid, {
      hasMultipleGuilds: Object.keys(userGuilds).length > 1,
      worldName,
    });
  });

  return result;
};

const addWorldNameToPushBody = (body, context) => {
  if (!context?.hasMultipleGuilds || !context.worldName) return body;
  return `${context.worldName}: ${body}`;
};

const sendMulticastWithoutRecipientLimit = async ({ tokens, ...payload }) => {
  const uniqueTokens = Array.from(new Set((tokens || []).filter(Boolean)));
  if (!uniqueTokens.length) return [];

  return Promise.all(
    chunkArray(uniqueTokens, 500).map((chunk) =>
      admin.messaging().sendEachForMulticast({ tokens: chunk, ...payload })
    )
  );
};

exports.notifyQuantumSectorOpen = onValueWritten(
  {
    ref: "/guilds/{guildId}/quantum/nodes/{sectorId}/state",
    region: "europe-west1",
  },
  async (event) => {
    const beforeState = event.data.before.val();
    const afterState = event.data.after.val();
    if (!isQuantumSectorOpening(beforeState, afterState)) return null;

    const guildId = String(event.params.guildId || "");
    const sectorId = String(event.params.sectorId || "");
    const db = admin.database();
    const subscriptionsRef = db.ref(
      `/guilds/${guildId}/quantum/stateNotifications/${sectorId}`
    );
    const [subscriptionsSnap, guildMembersSnap] = await Promise.all([
      subscriptionsRef.once("value"),
      db.ref(`/guilds/${guildId}/guildUsers`).once("value"),
    ]);
    const subscriptions = subscriptionsSnap.val() || {};
    const guildMembers = guildMembersSnap.val() || {};
    const userIds = Object.keys(subscriptions).filter((userId) =>
      Object.prototype.hasOwnProperty.call(guildMembers, userId)
    );

    if (!userIds.length) {
      await subscriptionsRef.remove();
      return null;
    }

    const userSnapshots = await Promise.all(
      userIds.map((userId) => db.ref(`/users/${userId}`).once("value"))
    );
    const userRecords = Object.fromEntries(
      userSnapshots.map((snapshot, index) => [userIds[index], snapshot.val() || {}])
    );
    const worldContexts = await getPushWorldContext({ db, guildId, userIds });
    const notification = buildQuantumSectorNotification({
      guildId,
      sectorId,
    });

    const deliveries = userIds.map(async (userId) => {
      const tokens = collectUserFcmTokens({ [userId]: userRecords[userId] });
      if (!tokens.length) return 0;
      const body = addWorldNameToPushBody(
        notification.body,
        worldContexts.get(userId)
      );
      await sendMulticastWithoutRecipientLimit({
        tokens,
        data: {
          ...notification.data,
          body,
          notificationEventId: String(event.id || ""),
        },
        android: {
          priority: "high",
          notification: {
            title: notification.title,
            body,
            channelId: "quantum_sector",
            sound: "quant",
          },
        },
        apns: {
          payload: {
            aps: {
              alert: { title: notification.title, body },
              sound: "default",
            },
          },
        },
      });
      return tokens.length;
    });
    const tokenCount = (await Promise.all(deliveries)).reduce(
      (sum, count) => sum + count,
      0
    );
    if (!tokenCount) {
      logger.warn("[QuantumNotifications] No FCM tokens for subscriptions", {
        guildId,
        sectorId,
        userIds,
      });
    }

    await subscriptionsRef.remove();
    logger.info("[QuantumNotifications] Sector opened", {
      guildId,
      sectorId,
      subscriberCount: userIds.length,
      tokenCount,
    });
    return null;
  }
);

const normalizeFcmToken = (value) => {
  const token = String(value || "").trim();
  return token.length >= 20 ? token : "";
};

const getGuildWidgetRecipients = async (guildId) => {
  if (!guildId) return [];

  const db = admin.database();
  const [membersSnap, subscriptionsSnap] = await Promise.all([
    db.ref(`/guilds/${guildId}/guildUsers`).once("value"),
    db.ref(`/widgetSubscriptions/${guildId}`).once("value"),
  ]);
  const memberIds = Object.keys(membersSnap.val() || {});
  const memberSet = new Set(memberIds.map(String));
  if (!memberSet.size) return [];

  const recipientsByToken = new Map();
  const addRecipient = ({ token, userId, cleanupPaths }) => {
    const normalizedToken = normalizeFcmToken(token);
    const normalizedUserId = String(userId || "");
    if (!normalizedToken || !memberSet.has(normalizedUserId)) return;

    const existing = recipientsByToken.get(normalizedToken) || {
      token: normalizedToken,
      userIds: new Set(),
      cleanupPaths: new Set(),
    };
    existing.userIds.add(normalizedUserId);
    (cleanupPaths || []).filter(Boolean).forEach((path) => {
      existing.cleanupPaths.add(path);
    });
    recipientsByToken.set(normalizedToken, existing);
  };

  const subscriptions = subscriptionsSnap.val() || {};
  Object.entries(subscriptions).forEach(([installationId, subscription]) => {
    if (!subscription || typeof subscription !== "object") return;
    if (
      subscription.platform &&
      String(subscription.platform).toLowerCase() !== "android"
    ) {
      return;
    }
    const userId = String(subscription.userId || "");
    addRecipient({
      token: subscription.fcmToken,
      userId,
      cleanupPaths: [
        `/widgetSubscriptions/${guildId}/${installationId}`,
        userId ? `/users/${userId}/devices/${installationId}` : "",
        userId ? `/users/${userId}/fcmToken` : "",
      ],
    });
  });

  // Старі версії застосунку мають лише один users/{uid}/fcmToken. Якщо цей
  // token уже належить новому device record, його активну гільдію визначає
  // widgetSubscriptions. Інший token вважаємо окремим legacy-пристроєм.
  const legacyUsers = await Promise.all(
    memberIds.map(async (uid) => {
      const [devicesSnap, tokenSnap] = await Promise.all([
        db.ref(`/users/${uid}/devices`).once("value"),
        db.ref(`/users/${uid}/fcmToken`).once("value"),
      ]);
      return {
        devices: devicesSnap.val() || {},
        token: tokenSnap.val(),
      };
    })
  );
  legacyUsers.forEach((userData, index) => {
    const userId = String(memberIds[index]);
    const devices =
      userData.devices && typeof userData.devices === "object"
        ? userData.devices
        : {};
    const token = normalizeFcmToken(userData.token);
    const deviceTokens = new Set(
      Object.values(devices)
        .map((device) => normalizeFcmToken(device?.fcmToken))
        .filter(Boolean)
    );
    if (!token || deviceTokens.has(token)) return;

    addRecipient({
      token,
      userId,
      cleanupPaths: [`/users/${userId}/fcmToken`],
    });
  });

  return Array.from(recipientsByToken.values());
};

const removeInvalidWidgetRecipient = async (recipient) => {
  const token = normalizeFcmToken(recipient?.token);
  const cleanupPaths = Array.from(recipient?.cleanupPaths || []);
  if (!token || !cleanupPaths.length) return;

  await Promise.all(
    cleanupPaths.map(async (path) => {
      try {
        await admin.database().ref(path).transaction((current) => {
          const currentToken =
            current && typeof current === "object"
              ? normalizeFcmToken(current.fcmToken)
              : normalizeFcmToken(current);
          return currentToken === token ? null : current;
        });
      } catch (error) {
        logger.warn("[WidgetRefresh] Could not remove invalid token", {
          path,
          error: error?.message || String(error),
        });
      }
    })
  );
};

/**
 * ✅ Надсилає data-only повідомлення всім членам гільдії.
 * Важливо: payload БЕЗ android.notification / aps.alert => користувач не бачить пуш.
 */
const sendWidgetRefreshToGuild = async ({
  guildId,
  snapshotVersion = Date.now(),
}) => {
  if (!guildId) return;

  const recipients = await getGuildWidgetRecipients(guildId);
  if (!recipients.length) return;

  const dataPayload = {
    type: "gbg_widget_refresh",
    guildId: String(guildId),
    snapshotVersion: String(snapshotVersion || Date.now()),
  };

  const chunks = chunkArray(recipients, 500);

  for (const recipientChunk of chunks) {
    try {
      const response = await admin.messaging().sendEachForMulticast({
        tokens: recipientChunk.map((recipient) => recipient.token),
        data: dataPayload,
        android: {
          priority: "high",
          ttl: WIDGET_PUSH_TTL_MS,
          collapseKey: `gbg_widget_${String(guildId).slice(0, 48)}`,
        },
        apns: {
          payload: { aps: { "content-available": 1 } },
          headers: {
            "apns-priority": "5",
            "apns-collapse-id": `gbg_widget_${String(guildId).slice(0, 48)}`,
            "apns-expiration": String(
              Math.floor((Date.now() + WIDGET_PUSH_TTL_MS) / 1000)
            ),
          },
        },
      });

      if (response) {
        logger.info("[WidgetRefresh] multicast result", {
          guildId: String(guildId),
          snapshotVersion: String(snapshotVersion || ""),
          successCount: response.successCount,
          failureCount: response.failureCount,
        });

        const retryableFailures = [];
        await Promise.all(
          response.responses.map(async (result, index) => {
            if (result.success) return;
            const code = result.error?.code || "";
            if (INVALID_FCM_TOKEN_CODES.has(code)) {
              await removeInvalidWidgetRecipient(recipientChunk[index]);
              return;
            }
            retryableFailures.push({
              code,
              message: result.error?.message || "Unknown FCM error",
            });
          })
        );

        // Невалідний token видаляємо й не повторюємо. Решта помилок можуть
        // бути тимчасовими, тому дозволяємо retry:true повторити event.
        if (retryableFailures.length) {
          throw new Error(
            `Widget FCM failed for ${retryableFailures.length} recipient(s): ` +
              retryableFailures
                .slice(0, 3)
                .map((failure) => failure.code || failure.message)
                .join(", ")
          );
        }
      }
    } catch (e) {
      logger.error("[WidgetRefresh] sendEachForMulticast error:", e);
      throw e;
    }
  }
};

const getSectorOwnerKey = (sectorData) => {
  if (!sectorData || typeof sectorData !== "object") return null;
  const ownerValue = sectorData.owner ?? sectorData.ownerId;
  if (ownerValue === undefined || ownerValue === null) return null;
  return String(ownerValue);
};

const isOwnGbgSector = (sectorData) => sectorData?.isOwn === true;

const createWidgetNeighborMap = (raw) =>
  Object.fromEntries(
    String(raw || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((entry) => {
        const [sectorId, neighborsRaw = ""] = entry.split(":");
        return [
          sectorId,
          neighborsRaw.split(",").filter(Boolean),
        ];
      })
  );

const WIDGET_VOLCANIC_NEIGHBORS = createWidgetNeighborMap(`
A1M:B1O,D1B,A2S,A2T
A2S:A1M,A2T,D2T,A3V,A3X
A2T:A1M,A2S,B2S,A3Y,A3Z
A3V:A2S,A3X,D3Z,A4A,A4B
A3X:A2S,A3V,A3Y,A4C,A4D
A3Y:A2T,A3X,A3Z,A4E,A4F
A3Z:A2T,A3Y,B3V,A4G,A4H
A4A:A3V,A4B,D4H
A4B:A3V,A4A,A4C
A4C:A3X,A4B,A4D
A4D:A3X,A4C,A4E
A4E:A3Y,A4D,A4F
A4F:A3Y,A4E,A4G
A4G:A3Z,A4F,A4H
A4H:A3Z,A4G,B4A
B1O:A1M,C1N,B2S,B2T
B2S:B1O,A2T,B2T,B3V,B3X
B2T:B1O,B2S,C2S,B3Y,B3Z
B3V:B2S,A3Z,B3X,B4A,B4B
B3X:B2S,B3V,B3Y,B4C,B4D
B3Y:B2T,B3X,B3Z,B4E,B4F
B3Z:B2T,B3Y,C3V,B4G,B4H
B4A:B3V,A4H,B4B
B4B:B3V,B4A,B4C
B4C:B3X,B4B,B4D
B4D:B3X,B4C,B4E
B4E:B3Y,B4D,B4F
B4F:B3Y,B4E,B4G
B4G:B3Z,B4F,B4H
B4H:B3Z,B4G,C4A
C1N:B1O,D1B,C2S,C2T
C2S:C1N,B2T,C2T,C3V,C3X
C2T:C1N,C2S,D2S,C3Y,C3Z
C3V:C2S,B3Z,C3X,C4A,C4B
C3X:C2S,C3V,C3Y,C4C,C4D
C3Y:C2T,C3X,C3Z,C4E,C4F
C3Z:C2T,C3Y,D3V,C4G,C4H
C4A:C3V,B4H,C4B
C4B:C3V,C4A,C4C
C4C:C3X,C4B,C4D
C4D:C3X,C4C,C4E
C4E:C3Y,C4D,C4F
C4F:C3Y,C4E,C4G
C4G:C3Z,C4F,C4H
C4H:C3Z,C4G,D4A
D1B:A1M,C1N,D2S,D2T
D2S:D1B,C2T,D2T,D3V,D3X
D2T:D1B,A2S,D2S,D3Y,D3Z
D3V:D2S,C3Z,D3X,D4A,D4B
D3X:D2S,D3V,D3Y,D4C,D4D
D3Y:D2T,D3X,D3Z,D4E,D4F
D3Z:D2T,A3V,D3Y,D4G,D4H
D4A:D3V,C4H,D4B
D4B:D3V,D4A,D4C
D4C:D3X,D4B,D4D
D4D:D3X,D4C,D4E
D4E:D3Y,D4D,D4F
D4F:D3Y,D4E,D4G
D4G:D3Z,D4F,D4H
D4H:D3Z,A4A,D4G
`);

const WIDGET_WATERFALL_NEIGHBORS = createWidgetNeighborMap(`
C5D:C4C,D4A,C5C,D5A
D5A:D4A,C5D,D5B
A4A:A3A,A4B,F4C,A5A,A5B,F5D
A5A:A4A,A5B,F5D
A3A:A2A,A3B,F3B,A4A,A4B,F4C
A2A:X1X,B2A,F2A,A3A,A3B,F3B
X1X:A2A,B2A,C2A,D2A,E2A,F2A
D2A:X1X,C2A,E2A,C3B,D3A,D3B
D3A:D2A,C3B,D3B,C4C,D4A,D4B
C2A:X1X,B2A,D2A,B3B,C3A,C3B
B2A:X1X,A2A,C2A,A3B,B3A,B3B
F2A:X1X,A2A,E2A,E3B,F3A,F3B
E2A:X1X,D2A,F2A,D3B,E3A,E3B
D3B:D2A,E2A,D3A,E3A,D4B,D4C
F3A:F2A,E3B,F3B,E4C,F4A,F4B
E3B:E2A,F2A,E3A,F3A,E4B,E4C
E3A:E2A,D3B,E3B,D4C,E4A,E4B
A3B:A2A,B2A,A3A,B3A,A4B,A4C
C3B:C2A,D2A,C3A,D3A,C4B,C4C
B3A:B2A,A3B,B3B,A4C,B4A,B4B
B3B:B2A,C2A,B3A,C3A,B4B,B4C
C3A:C2A,B3B,C3B,B4C,C4A,C4B
F3B:A2A,F2A,A3A,F3A,F4B,F4C
A4B:A3A,A3B,A4A,A4C,A5B,A5C
C4C:C3B,D3A,C4B,D4A,C5C,C5D
A4C:A3B,B3A,A4B,B4A,A5C,A5D
C4B:C3A,C3B,C4A,C4C,C5B,C5C
B4A:B3A,A4C,B4B,A5D,B5A,B5B
B4B:B3A,B3B,B4A,B4C,B5B,B5C
B4C:B3B,C3A,B4B,C4A,B5C,B5D
C4A:C3A,B4C,C4B,B5D,C5A,C5B
F4C:A3A,F3B,A4A,F4B,F5C,F5D
D4B:D3A,D3B,D4A,D4C,D5B,D5C
F4B:F3A,F3B,F4A,F4C,F5B,F5C
D4C:D3B,E3A,D4B,E4A,D5C,D5D
F4A:F3A,E4C,F4B,E5D,F5A,F5B
E4C:E3B,F3A,E4B,F4A,E5C,E5D
E4B:E3A,E3B,E4A,E4C,E5B,E5C
E4A:E3A,D4C,E4B,D5D,E5A,E5B
D4A:D3A,C4C,D4B,C5D,D5A,D5B
A5B:A4A,A4B,A5A,A5C
A5C:A4B,A4C,A5B,A5D
C5C:C4B,C4C,C5B,C5D
A5D:A4C,B4A,A5C,B5A
C5B:C4A,C4B,C5A,C5C
B5A:B4A,A5D,B5B
B5B:B4A,B4B,B5A,B5C
B5C:B4B,B4C,B5B,B5D
B5D:B4C,C4A,B5C,C5A
C5A:C4A,B5D,C5B
F5D:A4A,F4C,A5A,F5C
D5B:D4A,D4B,D5A,D5C
F5C:F4B,F4C,F5B,F5D
D5C:D4B,D4C,D5B,D5D
F5B:F4A,F4B,F5A,F5C
D5D:D4C,E4A,D5C,E5A
F5A:F4A,E5D,F5B
E5D:E4C,F4A,E5C,F5A
E5C:E4B,E4C,E5B,E5D
E5B:E4A,E4B,E5A,E5C
E5A:E4A,D5D,E5B
`);

const WIDGET_MAP_NEIGHBORS = {
  volcanic_archipelago: WIDGET_VOLCANIC_NEIGHBORS,
  waterfall_archipelago: WIDGET_WATERFALL_NEIGHBORS,
};

const normalizeWidgetMapKey = (value) =>
  String(value || "").toLowerCase() === "waterfall_archipelago"
    ? "waterfall_archipelago"
    : "volcanic_archipelago";

const normalizeWidgetColor = (value) => {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(color)
    ? color
    : "#FFFFFF";
};

const parseWidgetStaffSectors = (rawValue) => {
  const result = new Set();
  const add = (value) => {
    const normalized = String(value ?? "").trim().toUpperCase();
    if (normalized) result.add(normalized);
  };

  if (Array.isArray(rawValue)) {
    rawValue.forEach((value) => {
      if (typeof value === "string") {
        value.split(/[,\s;|/\\]+/).forEach(add);
      } else {
        add(value);
      }
    });
  } else if (typeof rawValue === "string") {
    rawValue.split(/[,\s;|/\\]+/).forEach(add);
  } else if (rawValue !== undefined && rawValue !== null) {
    add(rawValue);
  }
  return result;
};

const getWidgetSectorBuildings = (sector) => {
  const raw = sector?.buildings;
  if (Array.isArray(raw)) return raw;
  return raw && typeof raw === "object" ? Object.values(raw) : [];
};

const calculateWidgetSectorBonus = ({
  sectorId,
  sectors,
  neighbors,
}) => {
  const bonuses = [];
  (neighbors[sectorId] || []).forEach((neighborId) => {
    const neighbor = sectors[neighborId];
    if (
      !neighbor ||
      typeof neighbor !== "object" ||
      !isOwnGbgSector(neighbor)
    ) {
      return;
    }

    getWidgetSectorBuildings(neighbor).forEach((building) => {
      if (!building || typeof building !== "object") return;
      const state = String(building.state || "").toLowerCase();
      if (state !== "active" && state !== "building") return;

      const attackBonus = Number(
        getBuildingBonusesById(building.name).attackBonus
      );
      if (!Number.isFinite(attackBonus) || attackBonus <= 0) return;

      if (state === "active") {
        bonuses.push({ bonus: attackBonus, readyAt: 0 });
        return;
      }
      const readyAt = Number(building.readyAt);
      if (Number.isFinite(readyAt) && readyAt > 0) {
        bonuses.push({ bonus: attackBonus, readyAt });
      }
    });
  });

  if (!bonuses.length) return { value: 100, readyAt: 0 };
  const total = bonuses.reduce((sum, item) => sum + item.bonus, 0);
  if (total <= 80) {
    return {
      value: 100 - total,
      readyAt: bonuses.reduce(
        (latest, item) => Math.max(latest, item.readyAt),
        0
      ),
    };
  }

  let accumulated = 0;
  let readyAt = 0;
  [...bonuses]
    .sort((a, b) => a.readyAt - b.readyAt)
    .some((item) => {
      accumulated += item.bonus;
      readyAt = item.readyAt;
      return accumulated >= 80;
    });
  return { value: 20, readyAt };
};

const buildWidgetSnapshot = ({
  guildId,
  mapValue,
  sectorsValue,
  opponentsValue,
}) => {
  const mapKey = normalizeWidgetMapKey(mapValue);
  const neighbors = WIDGET_MAP_NEIGHBORS[mapKey];
  const sectorIds = Object.keys(neighbors);
  const sectors =
    sectorsValue && typeof sectorsValue === "object" ? sectorsValue : {};
  const opponents =
    opponentsValue && typeof opponentsValue === "object"
      ? opponentsValue
      : {};
  const opponentColors = {};
  const opponentStaff = new Set();

  Object.entries(opponents).forEach(([key, opponent]) => {
    if (!opponent || typeof opponent !== "object") return;
    const ownerId = String(opponent.id ?? key);
    opponentColors[ownerId] = normalizeWidgetColor(opponent.sectorColor);
    parseWidgetStaffSectors(opponent.staff).forEach((sectorId) => {
      opponentStaff.add(sectorId);
    });
  });

  const sectorColors = {};
  const sectorStaff = {};
  sectorIds.forEach((sectorId) => {
    const sector = sectors[sectorId];
    let color = "#FFFFFF";
    let staff = false;

    if (sector && typeof sector === "object") {
      const ownerId = getSectorOwnerKey(sector);
      color = normalizeWidgetColor(sector.color);
      if (ownerId !== null) {
        color =
          ownerId !== "0"
            ? opponentColors[ownerId] || color
            : "#FFFFFF";
      }
      staff = Boolean(sector.staff);
    } else if (typeof sector === "string") {
      color = normalizeWidgetColor(sector);
    }

    sectorColors[sectorId] = color;
    if (staff || opponentStaff.has(sectorId)) {
      sectorStaff[sectorId] = true;
    }
  });

  const ownSectorIds = sectorIds.filter(
    (sectorId) => isOwnGbgSector(sectors[sectorId])
  );
  const ownSectorSet = new Set(ownSectorIds);
  const adjacentSectorIds = new Set();
  ownSectorIds.forEach((sectorId) => {
    (neighbors[sectorId] || []).forEach((neighborId) => {
      if (!ownSectorSet.has(neighborId)) adjacentSectorIds.add(neighborId);
    });
  });

  const next5 = Array.from(adjacentSectorIds)
    .map((sectorId) => {
      const sector = sectors[sectorId];
      if (!sector || typeof sector !== "object") return null;
      const openTime = Number(sector.openTime);
      if (!Number.isFinite(openTime) || openTime <= 0) return null;

      const armyValue = String(sector.army || "").trim().toLowerCase();
      const bonus = calculateWidgetSectorBonus({
        sectorId,
        sectors,
        neighbors,
      });
      return {
        sectorId,
        openTime,
        army:
          armyValue === "attack" || armyValue === "defense"
            ? armyValue
            : "",
        bonusValue: bonus.value,
        bonusReadyAt: bonus.readyAt,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.openTime - b.openTime)
    .slice(0, 5);

  return {
    schemaVersion: 1,
    guildId: String(guildId),
    mapKey,
    next5,
    sectorColors,
    sectorStaff,
    updatedAt: Date.now(),
  };
};

const rebuildWidgetSnapshot = async (guildId) => {
  if (!guildId) return null;
  const gbgRef = admin.database().ref(`/guilds/${guildId}/GBG`);

  // map/sectors/opponents мають бути з одного RTDB revision. Транзакція на
  // їхньому найменшому спільному предку автоматично перерахує snapshot, якщо
  // будь-яка з цих гілок зміниться під час побудови.
  const result = await gbgRef.transaction((currentValue) => {
    const current =
      currentValue && typeof currentValue === "object"
        ? currentValue
        : {};
    const snapshot = buildWidgetSnapshot({
      guildId,
      mapValue: current.map,
      sectorsValue: current.sectors,
      opponentsValue: current.opponents,
    });

    return {
      ...current,
      widgetSnapshot: snapshot,
    };
  });

  if (!result.committed) return null;
  const snapshot = result.snapshot.child("widgetSnapshot");
  return snapshot.exists() ? snapshot.val() : null;
};

const rebuildAndQueueWidgetRefresh = async (guildId, eventId = "") => {
  if (!guildId) return;
  const requestId =
    String(eventId || "").trim() ||
    [Date.now(), Math.random().toString(36).slice(2, 10)].join("_");
  const requestRef = admin
    .database()
    .ref(`/widgetRefreshState/${guildId}/request`);

  const requestResult = await requestRef.transaction((current) => {
    if (current?.requestId === requestId && current?.sentAt) return;
    return {
      requestId,
      requestedAt: admin.database.ServerValue.TIMESTAMP,
    };
  });
  if (!requestResult.committed) return;

  // Trailing-edge debounce: тільки остання подія будує узгоджений snapshot.
  await new Promise((resolve) => setTimeout(resolve, WIDGET_PUSH_DEBOUNCE_MS));
  const latestRequestSnap = await requestRef.once("value");
  const latestRequest = latestRequestSnap.val() || {};
  if (latestRequest.requestId !== requestId) return;

  const lastSentRef = admin
    .database()
    .ref(`/widgetRefreshState/${guildId}/lastSentAt`);
  const acquireSendSlot = () => {
    const now = Date.now();
    return lastSentRef.transaction((previous) => {
      const previousMs = Number(previous) || 0;
      if (now - previousMs < WIDGET_PUSH_MIN_INTERVAL_MS) return;
      return now;
    });
  };

  let sendSlot = await acquireSendSlot();
  if (!sendSlot.committed) {
    const previousMs = Number(sendSlot.snapshot.val()) || 0;
    const waitMs = Math.max(
      0,
      WIDGET_PUSH_MIN_INTERVAL_MS - (Date.now() - previousMs)
    );
    await new Promise((resolve) => setTimeout(resolve, waitMs + 50));

    const stillLatestSnap = await requestRef.once("value");
    if (stillLatestSnap.val()?.requestId !== requestId) return;
    sendSlot = await acquireSendSlot();
    if (!sendSlot.committed) return;
  }

  const snapshot = await rebuildWidgetSnapshot(guildId);
  if (!snapshot) return;

  const requestAfterBuildSnap = await requestRef.once("value");
  if (requestAfterBuildSnap.val()?.requestId !== requestId) return;

  await sendWidgetRefreshToGuild({
    guildId,
    snapshotVersion: snapshot.updatedAt,
  });

  await requestRef.transaction((current) => {
    if (!current || current.requestId !== requestId) return current;
    return {
      ...current,
      sentAt: Date.now(),
    };
  });
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
const CULTURE_NOTIFICATION_BATCH_WINDOW_SEC = 60;

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

const getCultureNotificationGroupKey = (task) =>
  [
    String(task?.settlementName || ""),
    String(task?.taskType || ""),
    String(task?.buildingId || ""),
    String(task?.buildingName || ""),
    String(task?.currency || ""),
  ].join("::");

const buildCultureNotificationTexts = (task, batchCount = 1) => {
  const settlementLabel = getCultureSettlementLabel(task?.settlementName);
  const buildingName = String(task?.buildingName || "Будівля");
  const currency = String(task?.currency || "").trim();
  const titleText = `🏝️ ${settlementLabel}`;

  if (task?.taskType === "residential_collect") {
    return {
      titleText,
      bodyText:
        batchCount > 1
          ? `Зберіть ${currency || "ресурси"} з ${buildingName} (${batchCount})`
          : `Зберіть ${currency || "ресурси"} з ${buildingName}`,
    };
  }

  if (task?.taskType === "coin_start_production") {
    return {
      titleText,
      bodyText:
        batchCount > 1
          ? `Запустіть виробництво ${currency || "ресурсів"} в ${buildingName} (${batchCount})`
          : `Запустіть виробництво ${currency || "ресурсів"} в ${buildingName}`,
    };
  }

  if (task?.taskType === "goods_collect_ready") {
    return {
      titleText,
      bodyText:
        batchCount > 1
          ? `Зберіть ${currency || "товари"} з ${buildingName} (${batchCount})`
          : `Зберіть ${currency || "товари"} з ${buildingName}`,
    };
  }

  return {
    titleText,
    bodyText:
      batchCount > 1
        ? `Завершено будівництво ${buildingName} (${batchCount})`
        : `${buildingName} завершив будівництво.`,
  };
};

const clusterCultureNotificationTasks = (tasks, nowInSeconds) => {
  const pendingTasks = tasks
    .filter((task) => task?.status === "pending")
    .sort((a, b) => Number(a?.notificationTime || 0) - Number(b?.notificationTime || 0));

  const grouped = new Map();
  pendingTasks.forEach((task) => {
    const groupKey = getCultureNotificationGroupKey(task);
    if (!grouped.has(groupKey)) grouped.set(groupKey, []);
    grouped.get(groupKey).push(task);
  });

  const dueClusters = [];

  grouped.forEach((groupTasks) => {
    let currentCluster = [];

    groupTasks.forEach((task) => {
      if (!currentCluster.length) {
        currentCluster = [task];
        return;
      }

      const prevTask = currentCluster[currentCluster.length - 1];
      const prevTime = Number(prevTask?.notificationTime || 0);
      const currentTime = Number(task?.notificationTime || 0);
      if (currentTime - prevTime <= CULTURE_NOTIFICATION_BATCH_WINDOW_SEC) {
        currentCluster.push(task);
        return;
      }

      if (Number(currentCluster[0]?.notificationTime || 0) <= nowInSeconds &&
          Number(currentCluster[currentCluster.length - 1]?.notificationTime || 0) <= nowInSeconds) {
        dueClusters.push(currentCluster);
      }
      currentCluster = [task];
    });

    if (
      currentCluster.length &&
      Number(currentCluster[0]?.notificationTime || 0) <= nowInSeconds &&
      Number(currentCluster[currentCluster.length - 1]?.notificationTime || 0) <= nowInSeconds
    ) {
      dueClusters.push(currentCluster);
    }
  });

  return dueClusters;
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
  const currency = String(
    building?.job?.outputLabel ||
    building?.construction?.outputLabel ||
    building?.construction?.currency ||
    ""
  );
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
  const notifyBuildCompletion =
    building?.construction?.notifyBuildCompletion === true ||
    (category === "goods" && Number.isFinite(buildTimeSec) && buildTimeSec > 0) ||
    (category === "residential" && Number.isFinite(buildTimeSec) && buildTimeSec >= 3600);
  const notifications = building?.construction?.notifications || {};
  const jobEndsAt = Number(building?.job?.endsAt);
  const jobNotifications = building?.job?.notifications || {};

  if (!Number.isFinite(constructionEndsAt) || constructionEndsAt <= 0) return [];

  const entries = [];
  const buildCompleteNotificationTime = Math.floor(constructionEndsAt / 1000);

  if (notifyBuildCompletion && (category === "residential" || category === "goods")) {
    const taskType = "build_complete";
    if (!notifications?.[taskType]) {
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
  }

  if (category === "residential" && Number.isFinite(buildTimeSec) && buildTimeSec > 0 && Number.isFinite(passiveDurationSec) && passiveDurationSec > 0) {
    const taskType = "residential_collect";
    if (!notifications?.[taskType]) {
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
  }

  if (category === "coin" && Number.isFinite(buildTimeSec) && buildTimeSec > 0) {
    const taskType = "coin_start_production";
    if (!notifications?.[taskType]) {
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
  }

  if (category === "goods" && Number.isFinite(jobEndsAt) && jobEndsAt > 0) {
    const taskType = "goods_collect_ready";
    if (!jobNotifications?.[taskType]) {
      const queueKey = `${getCultureQueueKeyBase(building, index)}__${taskType}`;
      const task = buildCultureQueueEntry({
        userId,
        guildId,
        settlement,
        building,
        index,
        taskType,
        notificationTime: Math.floor(jobEndsAt / 1000),
        prevTask: currentQueue?.[queueKey],
      });
      if (task) entries.push(task);
    }
  }

  return entries;
};

const rebuildCultureNotificationQueue = async ({ db, userId, guildId }) => {
  const [settlementSnap, cultureSnap, currentQueueSnap] = await Promise.all([
    db.ref(`/users/${userId}/userGuilds/${guildId}/settlement`).once("value"),
    db.ref(`/users/${userId}/userGuilds/${guildId}/culture`).once("value"),
    db.ref(`/users/${userId}/userGuilds/${guildId}/settlement/cultureNotificationQueue`).once("value"),
  ]);

  const queueRef = db.ref(`/users/${userId}/userGuilds/${guildId}/settlement/cultureNotificationQueue`);
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

const markBuildingTaskNotified = async ({ db, userId, guildId, instanceId, taskType }) => {
  if (!instanceId || !taskType) return false;

  const placedBuildingsRef = db.ref(`/users/${userId}/userGuilds/${guildId}/settlement/placedBuildings`);
  const snapshot = await placedBuildingsRef.once("value");
  if (!snapshot.exists()) return false;

  let targetKey = null;
  snapshot.forEach((child) => {
    if (String(child.val()?.instanceId || "") === String(instanceId)) {
      targetKey = child.key;
      return true;
    }
    return false;
  });

  if (!targetKey) return false;

  const storageKey = taskType === "goods_collect_ready" ? "job" : "construction";
  await placedBuildingsRef
    .child(`${targetKey}/${storageKey}/notifications/${taskType}`)
    .set(admin.database.ServerValue.TIMESTAMP);

  return true;
};

const sendCulturePushAndMarkSent = async ({ db, userId, guildId, queuePaths, tasks }) => {
  const safeTasks = Array.isArray(tasks) ? tasks.filter(Boolean) : [];
  const safeQueuePaths = Array.isArray(queuePaths) ? queuePaths.filter(Boolean) : [];
  const primaryTask = safeTasks[safeTasks.length - 1] || null;
  if (!primaryTask || !safeQueuePaths.length) return null;

  const cultureSnap = await db.ref(`/users/${userId}/userGuilds/${guildId}/culture`).once("value");
  const culture = cultureSnap.exists() ? (cultureSnap.val() || {}) : {};
  if (culture?.cultureAlarm !== true) {
    return db.ref(`/users/${userId}/userGuilds/${guildId}/settlement/cultureNotificationQueue`).remove();
  }

  const tokenSnap = await db.ref(`/users/${userId}/fcmToken`).once("value");
  const token = tokenSnap.exists() ? tokenSnap.val() : null;
  if (!token) {
    await Promise.all(
      safeQueuePaths.map((queuePath) =>
        db.ref(queuePath).update({
          status: "pending",
          lastAttemptAt: Date.now(),
          lastError: "no_token",
        })
      )
    );
    return null;
  }

  const nowMs = Date.now();
  let soundBySchedule = false;
  try {
    soundBySchedule = await shouldNotificationPlaySound(userId, nowMs);
  } catch (e) {
    logger.error("[Culture] schedule check error:", e);
    soundBySchedule = false;
  }

  const batchCount = safeTasks.length;
  const { titleText, bodyText } = buildCultureNotificationTexts(primaryTask, batchCount);
  const worldContexts = await getPushWorldContext({ db, guildId, userIds: [userId] });
  const pushBodyText = addWorldNameToPushBody(bodyText, worldContexts.get(String(userId)));
  const buildingName = String(primaryTask?.buildingName || "Будівля");
  const notificationEventId = String(
    safeQueuePaths[safeQueuePaths.length - 1] ||
    `${guildId}:${userId}:${primaryTask?.instanceId || ""}:${primaryTask?.taskType || ""}`
  );

  const payload = soundBySchedule
    ? {
        token,
        data: {
          type: CULTURE_NOTIFICATION_TYPE,
          guildId: String(guildId),
          settlementName: String(primaryTask?.settlementName || ""),
          buildingId: String(primaryTask?.buildingId || ""),
          buildingName,
          notificationEventId,
          title: titleText,
          body: pushBodyText,
          batchCount: String(batchCount),
          sound: "1",
        },
        android: {
          priority: "high",
          notification: {
            title: titleText,
            body: pushBodyText,
            sound: "kolokol",
            channelId: "culture_settlement_kolokol",
          },
        },
        apns: {
          payload: {
            aps: {
              alert: { title: titleText, body: pushBodyText },
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
          settlementName: String(primaryTask?.settlementName || ""),
          buildingId: String(primaryTask?.buildingId || ""),
          buildingName,
          notificationEventId,
          title: titleText,
          body: pushBodyText,
          batchCount: String(batchCount),
          sound: "0",
        },
        android: {
          priority: "high",
          notification: {
            title: titleText,
            body: pushBodyText,
            channelId: "culture_settlement_silent",
          },
        },
        apns: {
          payload: {
            aps: {
              alert: { title: titleText, body: pushBodyText },
              "content-available": 1,
            },
          },
        },
      };

  try {
    await admin.messaging().send(payload);

    await Promise.all(
      safeTasks.map((task) =>
        markBuildingTaskNotified({
          db,
          userId,
          guildId,
          instanceId: task?.instanceId,
          taskType: task?.taskType,
        })
      )
    );

    await Promise.all(safeQueuePaths.map((queuePath) => db.ref(queuePath).remove()));
    return null;
  } catch (e) {
    logger.error("[Culture] send push error:", e);
    await Promise.all(
      safeQueuePaths.map((queuePath) =>
        db.ref(queuePath).update({
          status: "pending",
          lastAttemptAt: Date.now(),
          lastError: e?.message || "send_failed",
        })
      )
    );
    return null;
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

// Витягуємо TZ + розклад користувача
const getUserScheduleForNotifications = async (uid) => {
  const settingSnap = await admin.database().ref(`/users/${uid}/setting`).once("value");
  const setting = settingSnap.exists() ? (settingSnap.val() || {}) : {};

  const timeZone =
    typeof setting.timeZone === "string" ? setting.timeZone.trim() : "";
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

const shouldNotificationPlaySound = async (uid, utcMs = Date.now()) => {
  const { timeZone, schedules } =
    await getUserScheduleForNotifications(uid);

  // Без графіка зберігаємо попередню поведінку: звук дозволений.
  if (!schedules.length) return true;

  // Якщо користувач налаштував графік, але TZ невідома, UTC не вгадуємо:
  // помилка не повинна будити користувача в його локальний час сну.
  if (!timeZone) {
    logger.warn("[NotificationSchedule] Missing time zone; using silent", {
      uid: String(uid),
    });
    return false;
  }

  return isUserActiveNowBySchedules(schedules, utcMs, timeZone);
};

/**
 * =====================================================================
 * ✅ Тригери на opponents / map / sectors
 * =====================================================================
 */
exports.onGbgOpponentsWrite = onValueWritten(
  {
    ref: "/guilds/{guildId}/GBG/opponents",
    region: "europe-west1",
    retry: true,
  },
  async (event) => {
    const guildId = String(event.params.guildId || "");
    if (!guildId) return null;
    await rebuildAndQueueWidgetRefresh(guildId, event.id);
    return null;
  }
);

exports.onGbgMapWrite = onValueWritten(
  {
    ref: "/guilds/{guildId}/GBG/map",
    region: "europe-west1",
    retry: true,
  },
  async (event) => {
    const guildId = String(event.params.guildId || "");
    if (!guildId) return null;
    await rebuildAndQueueWidgetRefresh(guildId, event.id);
    return null;
  }
);

exports.onGbgSectorOwnerChange = onValueWritten(
  {
    ref: "/guilds/{guildId}/GBG/sectors",
    region: "europe-west1",
    retry: true,
  },
  async (event) => {
    const guildId = String(event.params.guildId || "");
    if (!guildId) return null;

    await rebuildAndQueueWidgetRefresh(guildId, event.id);
    return null;
  }
);

exports.ensureGbgWidgetSnapshotForSubscription = onValueCreated(
  {
    ref: "/widgetSubscriptions/{guildId}/{installationId}",
    region: "europe-west1",
    retry: true,
  },
  async (event) => {
    const guildId = String(event.params.guildId || "");
    const subscription = event.data?.val() || {};
    const userId = String(subscription.userId || "");
    if (!guildId || !userId) return null;

    const snapshotRef = admin
      .database()
      .ref(`/guilds/${guildId}/GBG/widgetSnapshot`);
    const [existingSnapshot, membershipSnapshot] = await Promise.all([
      snapshotRef.once("value"),
      admin
        .database()
        .ref(`/guilds/${guildId}/guildUsers/${userId}`)
        .once("value"),
    ]);
    if (!membershipSnapshot.exists()) return null;
    if (existingSnapshot.exists()) return null;

    // Спочатку створюємо snapshot, потім надсилаємо один debounced FCM.
    // Це закриває race, коли native worker стартував ще до onCreate trigger.
    await rebuildAndQueueWidgetRefresh(guildId, event.id);
    return null;
  }
);

/**
 * =====================================================================
 * ✅ Chat notifications
 * =====================================================================
 */

const sendChatNotificationForMessage = async ({ guildId, chatId, messageId, messageData, db }) => {
  const normalizedGuildId = String(guildId || "");
  const normalizedChatId = String(chatId || "");
  const normalizedMessageId = String(messageId || "");
  const senderId = messageData.senderId;
  const messageText = messageData.text || "Отправлено изображение";

  const chatRef = db.ref(`/guilds/${normalizedGuildId}/chats/${normalizedChatId}`);
  const chatSnapshot = await chatRef.once("value");
  const chatData = chatSnapshot.val();
  if (!chatData || !chatData.members) return;

  const members = Object.keys(chatData.members);
  const senderProfile = await db.ref(`/users/${senderId}`).once("value");
  const senderName = senderProfile.val()?.userName || "Новое сообщение";
  const senderGuildRole = senderProfile.val()?.userGuilds?.[normalizedGuildId]?.role;
  const isGbgBotSender = senderGuildRole === "GBGbot";

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

      // Для GBGbot налаштування звуку конкретного чату не блокує alarm.
      // Особистий графік активності отримувача перевіряється нижче завжди.
      const chatSoundEnabled = chatData.members?.[uid] === true;
      if (!chatSoundEnabled && !isGbgBotSender) return { uid, token, sound: false };

      // ✅ якщо графік дозволяє -> зі звуком
      let soundBySchedule = false;
      try {
        soundBySchedule = await shouldNotificationPlaySound(uid, nowMs);
      } catch (e) {
        logger.error("[sendChatNotification] schedule check error:", e);
        soundBySchedule = false;
      }

      return { uid, token, sound: !!soundBySchedule };
    })
  );

  const titleText = senderName;
  const bodyText = messageText;
  const worldContexts = await getPushWorldContext({ db, guildId: normalizedGuildId, userIds: recipients });
  const recipientGroups = new Map();

  userInfos.filter((x) => x.token).forEach((info) => {
    const body = addWorldNameToPushBody(bodyText, worldContexts.get(String(info.uid)));
    const key = `${info.sound ? "sound" : "silent"}\u0000${body}`;
    if (!recipientGroups.has(key)) recipientGroups.set(key, { sound: info.sound, body, tokens: [] });
    recipientGroups.get(key).tokens.push(info.token);
  });

  await Promise.all(Array.from(recipientGroups.values()).map(async (group) => {
    const payload = {
      data: {
        chatId: normalizedChatId,
        guildId: normalizedGuildId,
        messageId: normalizedMessageId,
        title: titleText,
        body: group.body,
        type: "chat_message",
        sound: group.sound ? "1" : "0",
        chatSound: isGbgBotSender ? "gbg_bot_alarm" : "default",
      },
      android: {
        priority: "high",
        notification: {
          title: titleText,
          body: group.body,
          ...(group.sound ? { sound: isGbgBotSender ? "alarm" : "smeh_minonovhasms" } : {}),
          channelId: group.sound
            ? (isGbgBotSender ? "chat_messages_gbg_bot_alarm" : "chat_messages")
            : "chat_messages_silent",
        },
      },
      apns: {
        payload: {
          aps: {
            alert: { title: titleText, body: group.body },
            ...(group.sound ? { sound: "default" } : {}),
            "content-available": 1,
          },
        },
      },
    };

    try {
      await sendMulticastWithoutRecipientLimit({ tokens: group.tokens, ...payload });
    } catch (e) {
      logger.error(`[sendChatNotification] ${group.sound ? "sound" : "silent"} send error:`, e);
    }
  }));
};

exports.sendChatNotification = onValueCreated(
  {
    ref: "/guilds/{guildId}/chats/{chatId}/messages/{messageId}",
    region: "europe-west1",
  },
  async (event) => {
    const guildId = String(event.params.guildId || "");
    const chatId = String(event.params.chatId || "");
    const messageId = String(event.params.messageId || "");
    const messageData = event.data.val();
    if (!messageData) return null;

    const db = admin.database();
    const tasks = [
      sendChatNotificationForMessage({
        guildId,
        chatId,
        messageId,
        messageData,
        db,
      }),
    ];
    const senderId = String(messageData.senderId || "");
    if (senderId && messageData.deliverySource !== "scheduled") {
      tasks.push(
        db
          .ref(`guilds/${guildId}/guildUsers/${senderId}/presence/lastActivityAt`)
          .set(admin.database.ServerValue.TIMESTAMP)
      );
    }

    await Promise.all(tasks);
    return null;
  }
);

exports.syncCultureNotifications = onValueWritten(
  {
    ref: "/users/{userId}/userGuilds/{guildId}/settlement",
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
    ref: "/users/{userId}/userGuilds/{guildId}/culture/cultureAlarm",
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
            const queueRef = db.ref(`/users/${userId}/userGuilds/${guildId}/settlement/cultureNotificationQueue`);
            const snapshot = await queueRef.once("value");
            if (!snapshot.exists()) return;

            const queueItems = [];
            snapshot.forEach((child) => {
              queueItems.push({
                ...child.val(),
                queueKey: child.key,
                queuePath: `/users/${userId}/userGuilds/${guildId}/settlement/cultureNotificationQueue/${child.key}`,
              });
            });

            const dueClusters = clusterCultureNotificationTasks(queueItems, nowInSeconds);
            if (!dueClusters.length) return;

            await Promise.all(
              dueClusters.map((cluster) =>
                sendCulturePushAndMarkSent({
                  db,
                  userId,
                  guildId,
                  queuePaths: cluster.map((task) => task.queuePath),
                  tasks: cluster,
                })
              )
            );
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
      const promises = [];
      if (snapshot.exists()) {
        snapshot.forEach((childSnapshot) => {
          const messageId = childSnapshot.key;
          const messageData = childSnapshot.val();
          if (messageData.sendAt <= now) {
            promises.push(moveMessageToChat({ guildId, messageId, messageData, db }));
          }
        });
      }

      const temporarySnapshot = await db
        .ref(`/guilds/${guildId}/temporaryMessages`)
        .orderByChild("status")
        .equalTo("pending")
        .once("value");
      if (temporarySnapshot.exists()) {
        temporarySnapshot.forEach((childSnapshot) => {
          const messageId = childSnapshot.key;
          const temporaryData = childSnapshot.val() || {};
          if (Number(temporaryData.expiresAt) <= now) {
            const chatId = String(temporaryData.chatId || "");
            const updates = { [`temporaryMessages/${messageId}`]: null };
            if (chatId) updates[`chats/${chatId}/messages/${messageId}`] = null;
            promises.push(db.ref(`/guilds/${guildId}`).update(updates));
          }
        });
      }

      await Promise.all(promises);
    });

    await Promise.all(guildPromises);
    return null;
  }
);

async function moveMessageToChat({ guildId, messageId, messageData, db }) {
  const { chatId, text, senderId } = messageData;
  const normalizedGuildId = String(guildId || "");
  const normalizedChatId = String(chatId || "");
  const scheduledMessageId = String(messageId || "");
  if (!normalizedGuildId) return null;
  if (!normalizedChatId) {
    return db.ref(`/guilds/${normalizedGuildId}/scheduledMessages/${scheduledMessageId}`).update({ status: "error" });
  }
  const chatMessagesRef = db.ref(`/guilds/${normalizedGuildId}/chats/${normalizedChatId}/messages`);
  const chatMessageRef = chatMessagesRef.push();
  const authoredAt = Number(messageData.authoredAt);
  const finalMessage = {
    senderId,
    text,
    status: "sent",
    timestamp: admin.database.ServerValue.TIMESTAMP,
    deliverySource: "scheduled",
    ...(Number.isFinite(authoredAt) && authoredAt > 0 ? { authoredAt } : {}),
  };
  await chatMessageRef.set(finalMessage);
  return db.ref(`/guilds/${normalizedGuildId}/scheduledMessages/${scheduledMessageId}`).remove();
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

    const [allSectorsSnap, currentQueueSnap] = await Promise.all([
      db.ref(`/guilds/${guildId}/GBG/sectors`).once("value"),
      db.ref(`/guilds/${guildId}/GBG/gbgNotificationQueue`).once("value"),
    ]);

    if (!allSectorsSnap.exists()) return null;

    const allSectors = allSectorsSnap.val();
    const normalizedMapName = normalizeWidgetMapKey(mapName);
    const mapTopology = WIDGET_MAP_NEIGHBORS[normalizedMapName];
    const currentQueue = currentQueueSnap.exists() ? currentQueueSnap.val() : {};

    if (String(mapName || "").toLowerCase() !== normalizedMapName) {
      logger.warn("[GBG] Unknown map name; using bundled topology", {
        guildId,
        mapName: String(mapName || ""),
        fallbackMapName: normalizedMapName,
      });
    }

    const mySectors = Object.keys(allSectors).filter((key) =>
      isOwnGbgSector(allSectors[key])
    );

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
      const openTime = Number(sec.openTime);
      const armyRaw = String(sec.army || "").toLowerCase();
      const armyType = armyRaw === "attack" ? "attack" : "defense";

      if (!isOwnGbgSector(sec) && !isNaN(openTime) && openTime > 0) {
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

    return null;
  }
);

exports.processGbgNotificationQueue = onSchedule(
  {
    schedule: "every 1 minutes",
    region: "europe-west1",
    timeZone: "Europe/Kiev",
    secrets: [TELEGRAM_BOT_TOKEN],
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

      const pendingTasks = [];
      snapshot.forEach((child) => {
        const task = child.val();
        const taskId = child.key;
        const queuePath = `/guilds/${guildId}/GBG/gbgNotificationQueue/${taskId}`;

        if (task.status === "pending") {
          pendingTasks.push({ taskId, task, queuePath });
        }
      });

      if (!pendingTasks.length) return;
      const telegramChatId = await getGuildTelegramChatId({ db, guildId });

      await Promise.all(
        pendingTasks.map(({ taskId, task, queuePath }) =>
          sendPushAndMarkSent({
            guildId,
            telegramChatId,
            taskId,
            task,
            db,
            queuePath,
          })
        )
      );
    });

    await Promise.all(guildPromises);
    return null;
  }
);

async function sendPushAndMarkSent({
  guildId: queueGuildId,
  telegramChatId,
  taskId,
  task,
  db,
  queuePath,
}) {
  const {
    guildId: taskGuildId,
    sectorId,
    army,
    openTime,
  } = task;
  const guildId = String(queueGuildId || taskGuildId || "");
  if (!guildId) {
    logger.warn("[GBG] Notification task has no guildId", { taskId });
    return db.ref(queuePath).remove();
  }
  if (taskGuildId && String(taskGuildId) !== guildId) {
    logger.warn("[GBG] Queue/task guildId mismatch; using queue guild", {
      taskId,
      queueGuildId: guildId,
      taskGuildId: String(taskGuildId),
    });
  }
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
  const currentArmySnap = await db
    .ref(`/guilds/${guildId}/GBG/sectors/${sectorId}/army`)
    .once("value");
  const effectiveArmy = String(currentArmySnap.val() || army || "").trim().toLowerCase();

  const userInfos = await Promise.all(
    memberIds.map(async (uid) => {
      const [tokenSnap, muteUntilSnap] = await Promise.all([
        db.ref(`/users/${uid}/fcmToken`).once("value"),
        db
          .ref(`/users/${uid}/setting/notificationMutes/gbgSectorOpen/${guildId}`)
          .once("value"),
      ]);

      const isSoundMuted = isGbgNotificationSoundMuted({
        rawMute: muteUntilSnap.val(),
        army: effectiveArmy,
        nowMs,
      });

      const token = tokenSnap.exists() ? tokenSnap.val() : null;
      if (!token) return { uid, token: null, sound: false };

      let soundBySchedule = false;
      try {
        soundBySchedule = await shouldNotificationPlaySound(uid, nowMs);
      } catch (e) {
        logger.error("[GBG] schedule check error:", e);
        soundBySchedule = false;
      }

      return { uid, token, sound: !isSoundMuted && !!soundBySchedule };
    })
  );

  const isAttack = effectiveArmy === "attack";
  const icon = isAttack ? "⚔️" : "🛡️";
  const actionText = isAttack ? "Атака!" : "Захист!";

  const titleText = `${icon} Поле битви`;
  const messageText = `${icon} Сектор ${sectorId} скоро відкриється! (${actionText})`;
  const notifiableUserIds = userInfos.filter((info) => info.token).map((info) => info.uid);
  const worldContexts = await getPushWorldContext({ db, guildId, userIds: notifiableUserIds });
  const recipientGroups = new Map();

  userInfos.filter((x) => x.token).forEach((info) => {
    const body = addWorldNameToPushBody(messageText, worldContexts.get(String(info.uid)));
    const key = `${info.sound ? "sound" : "silent"}\u0000${body}`;
    if (!recipientGroups.has(key)) recipientGroups.set(key, { sound: info.sound, body, tokens: [] });
    recipientGroups.get(key).tokens.push(info.token);
  });

  // ✅ Telegram: ТІЛЬКИ “людський” текст (без guildId/sector/openTime)
  if (telegramChatId) {
    try {
      const tgText = `<b>${titleText}</b>\n${messageText}\n`;
      await sendTelegramMessage({
        chatId: telegramChatId,
        text: tgText,
        parseMode: "HTML",
        guildId,
        notificationType: "gbg_sector_open",
      });
    } catch (e) {
      logger.error("[TG] error while sending:", {
        guildId,
        notificationType: "gbg_sector_open",
        error: e?.message || String(e),
      });
    }
  }

  await Promise.all(Array.from(recipientGroups.values()).map(async (group) => {
    const payload = {
      data: {
        screen: "GBG",
        guildId: String(guildId),
        sectorId: String(sectorId),
        notificationEventId: String(taskId),
        title: titleText,
        body: group.body,
        type: "gbg_sector_open",
        sound: group.sound ? "1" : "0",
      },
      android: {
        priority: "high",
        notification: {
          title: titleText,
          body: group.body,
          ...(group.sound ? { sound: "alert" } : {}),
          channelId: group.sound ? "gbg_sector" : "gbg_sector_silent",
        },
      },
      apns: {
        payload: {
          aps: {
            alert: { title: titleText, body: group.body },
            ...(group.sound ? { sound: "default" } : {}),
            "content-available": 1,
          },
        },
      },
    };

    try {
      await sendMulticastWithoutRecipientLimit({ tokens: group.tokens, ...payload });
      logger.log(`[PUSH SENT ${group.sound ? "SOUND" : "SILENT"}] ${sectorId} sent to ${group.tokens.length} users.`);
    } catch (e) {
      logger.error(`[GBG] ${group.sound ? "sound" : "silent"} send error:`, e);
    }
  }));

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

    const before = event.data.before.exists() ? event.data.before.val() : null;
    const after = event.data.after.exists() ? event.data.after.val() : null;
    if (!after || typeof after !== "object") return null;

    if (!isOwnGbgSector(after)) return null;
    if (isOwnGbgSector(before)) return null;

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
    secrets: [TELEGRAM_BOT_TOKEN],
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
              const guildSetting = settingSnap.exists() ? (settingSnap.val() || {}) : {};
              const mapName = mapSnap.exists() ? mapSnap.val() : "volcano_archipelago";
              const mapBaseDefense = getMapBaseDefense(mapName);
              const victoryPoints = Number(sector.victoryPoints || 0);
              const gbgGoal = !!guildSetting.GBGGoal;
              const telegramChatId = await getGuildTelegramChatId({
                db,
                guildId,
              });

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

              const memberIds = membersSnap.exists()
                ? Object.keys(membersSnap.val() || {})
                : [];
              const nowMs = Date.now();
              const leaderInfos = await Promise.all(
                memberIds.map(async (uid) => {
                  const [roleSnap, tokenSnap, muteSnap] = await Promise.all([
                    db.ref(`/users/${uid}/userGuilds/${guildId}/role`).once("value"),
                    db.ref(`/users/${uid}/fcmToken`).once("value"),
                    db.ref(`/users/${uid}/setting/notificationMutes/gbgSectorOpen/${guildId}`).once("value"),
                  ]);
                  const role = roleSnap.exists() ? String(roleSnap.val() || "") : "";
                  if (
                    role !== "guildLeader" &&
                    role !== "tester" &&
                    role !== "developer"
                  ) {
                    return null;
                  }

                  const token = tokenSnap.exists() ? tokenSnap.val() : null;
                  if (!token) return null;

                  let soundBySchedule = false;
                  try {
                    soundBySchedule = await shouldNotificationPlaySound(
                      uid,
                      nowMs
                    );
                  } catch (error) {
                    logger.error(
                      "[GBG_BUILD_CHECK] schedule check error:",
                      error
                    );
                    soundBySchedule = false;
                  }

                  const isSoundMuted = isGbgNotificationSoundMuted({
                    rawMute: muteSnap.val(),
                    nowMs,
                  });
                  return { uid, token, sound: !isSoundMuted && !!soundBySchedule };
                })
              );

              const recipients = leaderInfos.filter(Boolean);
              const plannedReadable = formatRecommendedBuildings(best.planned);
              const titleText = "🛠️ Рекомендовано побудувати";
              const messageText = `Сектор ${sectorId}. Рекомендоно побудувати:\n${plannedReadable}`;
              if (recipients.length) {
                const worldContexts = await getPushWorldContext({
                  db,
                  guildId,
                  userIds: recipients.map((info) => info.uid),
                });
                const groups = new Map();
                recipients.forEach((info) => {
                  const body = addWorldNameToPushBody(
                    messageText,
                    worldContexts.get(String(info.uid))
                  );
                  const key = `${info.sound ? "sound" : "silent"}\u0000${body}`;
                  if (!groups.has(key)) {
                    groups.set(key, {
                      sound: info.sound,
                      body,
                      tokens: [],
                    });
                  }
                  groups.get(key).tokens.push(info.token);
                });

                await Promise.all(
                  Array.from(groups.values()).map((group) =>
                    sendMulticastWithoutRecipientLimit({
                      tokens: group.tokens,
                      data: {
                        screen: "GBG",
                        type: "gbg_build_plan",
                        title: titleText,
                        body: group.body,
                        guildId: String(guildId),
                        sectorId: String(sectorId),
                        notificationEventId: String(taskId),
                        sound: group.sound ? "1" : "0",
                      },
                      notification: {
                        title: titleText,
                        body: group.body,
                      },
                      android: {
                        priority: "high",
                        notification: {
                          channelId: group.sound
                            ? "gbg_build"
                            : "gbg_sector_silent",
                          ...(group.sound ? { sound: "build" } : {}),
                        },
                      },
                      apns: {
                        payload: {
                          aps: {
                            ...(group.sound ? { sound: "default" } : {}),
                            "content-available": 1,
                          },
                        },
                      },
                    })
                  )
                );
              }

              // ✅ TG BUILD PLAN: дублюємо в Telegram гільдії (без технічних полів)
              if (String(telegramChatId || "").trim()) {
                try {
                  const tgText =
                    `<b>${titleText}</b>\n` +
                    `Сектор <b>${sectorId}</b>\n` +
                    `Рекомендовано побудувати:\n` +
                    `${plannedReadable}`;

                  await sendTelegramMessage({
                    chatId: telegramChatId,
                    text: tgText,
                    parseMode: "HTML",
                    guildId,
                    notificationType: "gbg_build_plan",
                  });
                } catch (e) {
                  logger.error("[TG] build plan send error:", {
                    guildId,
                    notificationType: "gbg_build_plan",
                    error: e?.message || String(e),
                  });
                }
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
  const nowMs = Date.now();
  const tokensPromises = memberIds.map(async (uid) => {
    const [tokenSnap, muteSnap] = await Promise.all([
      db.ref(`/users/${uid}/fcmToken`).once("value"),
      db.ref(`/users/${uid}/setting/notificationMutes/gbgSectorOpen/${guildId}`).once("value"),
    ]);
    const token = tokenSnap.exists() ? tokenSnap.val() : null;
    if (!token) return null;

    let soundBySchedule = false;
    try {
      soundBySchedule = await shouldNotificationPlaySound(uid, nowMs);
    } catch (error) {
      logger.error("[GBG_HELP] schedule check error:", error);
      soundBySchedule = false;
    }

    const isSoundMuted = isGbgNotificationSoundMuted({
      rawMute: muteSnap.val(),
      nowMs,
    });
    return { uid, token, sound: !isSoundMuted && !!soundBySchedule };
  });
  const recipients = (await Promise.all(tokensPromises)).filter(Boolean);

  if (recipients.length > 0) {
    const titleText = "🆘 Потрібна допомога!";
    const messageText = "Терміново потрібна допомога на полях битв!";
    const worldContexts = await getPushWorldContext({ db, guildId, userIds: memberIds });
    const groups = new Map();
    recipients.forEach((info) => {
      const body = addWorldNameToPushBody(messageText, worldContexts.get(String(info.uid)));
      const key = `${info.sound ? "sound" : "silent"}\u0000${body}`;
      if (!groups.has(key)) {
        groups.set(key, {
          sound: info.sound,
          body,
          tokens: [],
        });
      }
      groups.get(key).tokens.push(info.token);
    });

    await Promise.all(Array.from(groups.values()).map(async (group) => {
      const payload = {
        data: {
          screen: "GBG",
          type: "gbg_help",
          guildId: String(guildId),
          title: titleText,
          body: group.body,
          sound: group.sound ? "1" : "0",
        },
        android: {
          priority: "high",
          notification: {
            title: titleText,
            body: group.body,
            channelId: group.sound ? "gbg_sector" : "gbg_sector_silent",
            ...(group.sound ? { sound: "alert" } : {}),
          },
        },
        apns: {
          payload: {
            aps: {
              alert: { title: titleText, body: group.body },
              ...(group.sound ? { sound: "default" } : {}),
              "content-available": 1,
            },
          },
        },
      };
      try {
        await sendMulticastWithoutRecipientLimit({
          tokens: group.tokens,
          ...payload,
        });
      } catch (e) {
        logger.error(e);
      }
    }));
  }
  return { success: true };
});

/**
 * Calculates the next actionable Great Building guarantee from the completed
 * autoclicker snapshot. The formulas are intentionally kept server-side.
 */
const handleGreatBuildingGuaranteeRefresh = (timestampField) => async (event) => {
    const triggeringUpdateAt = event.data.after.val();
    if (triggeringUpdateAt == null || triggeringUpdateAt === event.data.before.val()) return null;

    const { guildId, ownerUserId, buildingId } = event.params;
    const db = admin.database();
    const buildingPath = `/guilds/${guildId}/guildUsers/${ownerUserId}/greatBuild/${buildingId}`;
    const updateAtRef = db.ref(`${buildingPath}/${timestampField}`);
    const guarantRef = db.ref(`${buildingPath}/guarant`);
    const context = { guildId, ownerUserId, buildingId, timestampField };
    const writeStatus = (status) => writeIfCurrent({
      updateAtRef,
      guarantRef,
      triggeringUpdateAt,
      result: {
        calculatedAt: admin.database.ServerValue.TIMESTAMP,
        status,
      },
    });

    try {
      const [buildingSnap, catalogSnap, guildUsersSnap, branchesSnap] = await Promise.all([
        db.ref(buildingPath).once("value"),
        db.ref(`/greatBuildings/${buildingId}`).once("value"),
        db.ref(`/guilds/${guildId}/guildUsers`).once("value"),
        db.ref(`/guilds/${guildId}/GBChat`).once("value"),
      ]);
      const building = buildingSnap.val();
      const catalog = catalogSnap.val();
      if (!building || !catalog || typeof catalog.levelBase !== "string" || !catalog.levelBase.trim()) {
        throw new Error("Missing building or levelBase");
      }
      const currentLevel = Number(building.level);
      if (!Number.isFinite(currentLevel) || currentLevel < 0) throw new Error("Invalid current level");
      const targetLevel = currentLevel + 1;
      const apiUrl = `${catalog.levelBase}${targetLevel}`;
      let apiPayload;
      try {
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        apiPayload = await response.json();
      } catch (error) {
        logger.error("[GB_GUARANTEE] API request failed", {
          ...context, targetLevel, error: error?.message || String(error),
        });
        await writeStatus(GUARANTEE_STATUSES.API_ERROR);
        return null;
      }

      let result;
      try {
        result = calculateGuarantee({
          ownerUserId,
          buildingId,
          building,
          guildUsers: guildUsersSnap.val() || {},
          branches: branchesSnap.val() || {},
          apiPayload,
          calculatedAt: admin.database.ServerValue.TIMESTAMP,
        });
      } catch (error) {
        const isApiValidationError = error instanceof ApiValidationError;
        logger.error("[GB_GUARANTEE] Calculation failed", {
          ...context,
          targetLevel,
          stage: isApiValidationError ? "api_validation" : "input_validation",
          error: error?.message || String(error),
        });
        await writeStatus(
          isApiValidationError ? GUARANTEE_STATUSES.API_ERROR : GUARANTEE_STATUSES.INVALID_DATA
        );
        return null;
      }

      const written = await writeIfCurrent({
        updateAtRef, guarantRef, triggeringUpdateAt, result,
      });
      if (!written) {
        logger.info("[GB_GUARANTEE] Skipped stale result", context);
      } else {
        const currentContributorsSnap = await db.ref(`${buildingPath}/contributors`).once("value");
        const hasContribution = Object.values(currentContributorsSnap.val() || {}).some(
          (contributor) => Number(contributor?.forgePoints) > 0
        );
        if (hasContribution) {
          await db.ref(`${buildingPath}/lock`).set(false);
        }
      }
      return null;
    } catch (error) {
      logger.error("[GB_GUARANTEE] Invalid building input", {
        ...context, error: error?.message || String(error),
      });
      await writeStatus(GUARANTEE_STATUSES.INVALID_DATA);
      return null;
    }
};

// `updateAt` is a temporary manual refresh signal. Keep it alongside the
// normal autoclicker `updatedAt` trigger until the manual action is removed.
exports.calculateGreatBuildingGuarantee = onValueWritten(
  {
    ref: "/guilds/{guildId}/guildUsers/{ownerUserId}/greatBuild/{buildingId}/updateAt",
    region: "europe-west1",
  },
  handleGreatBuildingGuaranteeRefresh("updateAt")
);

exports.calculateGreatBuildingGuaranteeOnUpdatedAt = onValueWritten(
  {
    ref: "/guilds/{guildId}/guildUsers/{ownerUserId}/greatBuild/{buildingId}/updatedAt",
    region: "europe-west1",
  },
  handleGreatBuildingGuaranteeRefresh("updatedAt")
);

/** Scheduled express-upgrade state machine. The transaction makes every minute tick idempotent. */
const getExpressMultiplier = (guildUsers, uid, record = {}) => {
  const level = Math.max(0, Math.trunc(Number(guildUsers?.[uid]?.greatBuild?.["The Arc"]?.level) || 0));
  const boost = level > 0 ? ARC_CONTRIBUTION_BOOSTS[Math.min(level, ARC_CONTRIBUTION_BOOSTS.length) - 1] : 0;
  const calculated = 1 + Number(boost || 0) / 100;
  return Number.isFinite(calculated) ? calculated : Number(record.contributionMultiplier) || 1;
};

const sendExpressPush = async ({ db, guildId, chatId, notice }) => {
  const ledgerRef = db.ref(`/expressNotificationLedger/${guildId}/${chatId}/${notice.event}_${notice.userId}`);
  const claim = await ledgerRef.transaction((current) => current ? undefined : ({
    claimedAt: admin.database.ServerValue.TIMESTAMP,
    status: "claimed",
  }), undefined, false);
  if (!claim.committed) return;
  const tokenSnap = await db.ref(`/users/${notice.userId}/fcmToken`).once("value");
  const token = tokenSnap.val();
  if (!token) {
    await ledgerRef.update({ status: "no_token", completedAt: admin.database.ServerValue.TIMESTAMP });
    return;
  }
  const title = "Експрес прокачка";
  await admin.messaging().send({
    token,
    data: {
      type: "express_upgrade",
      screen: "GBExpress",
      guildId: String(guildId),
      chatId: String(chatId),
      title,
      body: notice.body,
      sound: "1",
      notificationEventId: `${chatId}_${notice.event}_${notice.userId}`,
    },
    android: {
      priority: "high",
      notification: { title, body: notice.body, channelId: "express_upgrade", sound: "kirpich" },
    },
    apns: { payload: { aps: { alert: { title, body: notice.body }, sound: "kirpich.mp3", "content-available": 1 } } },
  });
  await ledgerRef.update({ status: "sent", completedAt: admin.database.ServerValue.TIMESTAMP });
};

exports.processScheduledExpressUpgrades = onSchedule(
  { schedule: "every 1 minutes", region: "europe-west1", timeZone: "UTC", timeoutSeconds: 120, memory: "512MiB" },
  async () => {
    const db = admin.database();
    const guildsSnap = await db.ref("/guilds").once("value");
    const now = Date.now();
    await Promise.all(Object.entries(guildsSnap.val() || {}).map(async ([guildId, guild]) => {
      const guildUsers = guild?.guildUsers || {};
      await Promise.all(Object.entries(guild?.express || {}).map(async ([chatId, rawGroup]) => {
        // Legacy flat records remain readable by old clients but cannot be safely deadline-processed.
        if ((!rawGroup?.gbs && !rawGroup?.postponementAudience) || !rawGroup?.scheduleTime) return;
        const notices = [];
        let shouldDelete = false;
        const ref = db.ref(`/guilds/${guildId}/express/${chatId}`);
        const result = await ref.transaction((current) => {
          if (!current) return current;
          const advanced = advanceExpress(current, now, (uid, record) => getExpressMultiplier(guildUsers, uid, record));
          notices.splice(0, notices.length, ...advanced.notices);
          shouldDelete = advanced.deleteGroup;
          if (advanced.deleteGroup) return { ...current, workflow: { ...(current.workflow || {}), stage: "deleting", deletingAt: now } };
          return advanced.group;
        }, undefined, false);
        if (!result.committed || !result.snapshot.exists()) return;
        const current = result.snapshot.val();
        if (current.postponementAudience && !current.workflow?.postponementPushSentAt) {
          Object.keys(current.postponementAudience).forEach((uid) => notices.push({ event: "postponed", userId: uid, body: EXPRESS_PUSH.postponed }));
          await Promise.all(notices.filter((notice) => notice.event === "postponed").map((notice) => sendExpressPush({ db, guildId, chatId, notice })));
          await ref.update({ postponementAudience: null, "workflow/postponementPushSentAt": admin.database.ServerValue.TIMESTAMP });
          if (!current.gbs || !Object.keys(current.gbs).length) {
            await ref.remove();
            return;
          }
        }
        if (current.workflow?.recruitmentNeeded && !current.workflow?.recruitmentNoticesQueuedAt) {
          const excluded = uniqueAvailableIds(current);
          Object.keys(guildUsers).filter((uid) => !excluded.has(uid)).forEach((uid) => notices.push({ event: "recruit", userId: uid, body: EXPRESS_PUSH.recruit }));
          await ref.child("workflow/recruitmentNoticesQueuedAt").set(admin.database.ServerValue.TIMESTAMP);
        }
        await Promise.all(notices.map((notice) => sendExpressPush({ db, guildId, chatId, notice }).catch((error) => logger.error("[EXPRESS_PUSH]", { guildId, chatId, userId: notice.userId, error: error?.message }))));
        if (shouldDelete) await ref.remove();
      }));
    }));
    return null;
  }
);

exports.notifyExpressOwnerCancellation = onValueWritten(
  { ref: "/guilds/{guildId}/express/{chatId}", region: "europe-west1" },
  async (event) => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    if (!before?.gbs) return null;
    const stage = before.workflow?.stage || "open";
    if (["open", "postponement", "deleting"].includes(stage)) return null;
    const afterGbs = after?.gbs || {};
    const removedOwners = new Set(Object.entries(before.gbs).filter(([id]) => !afterGbs[id]).map(([, gb]) => String(gb.user)));
    if (!removedOwners.size) return null;
    const recipients = Object.entries(before.interested || {}).filter(([, record]) => Number(record?.confirmationTime) > 0).map(([uid]) => uid);
    const db = admin.database();
    await Promise.all(recipients.map((userId) => sendExpressPush({
      db,
      guildId: event.params.guildId,
      chatId: event.params.chatId,
      notice: { event: `manual_cancel_${event.id}`, userId, body: EXPRESS_PUSH.ownerCancel },
    })));
    if (after?.workflow?.pendingManualDelete && !Object.keys(afterGbs).length) {
      await event.data.after.ref.remove();
    }
    return null;
  }
);
