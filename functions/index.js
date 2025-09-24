// functions/index.js  (CommonJS)
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getDatabase } = require("firebase-admin/database");
const { onValueCreated } = require("firebase-functions/v2/database");
const { getMessaging } = require("firebase-admin/messaging");
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

if (!admin.apps.length) {
  const options = {};

  const serviceAccountFromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (serviceAccountFromEnv) {
    try {
      const serviceAccount = JSON.parse(serviceAccountFromEnv);
      options.credential = admin.credential.cert(serviceAccount);
    } catch (error) {
      console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:", error);
    }
  }

  if (!options.credential) {
    const serviceAccountPath =
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
      path.join(__dirname, "..", "fcm-service-account.json");

    if (fs.existsSync(serviceAccountPath)) {
      try {
        const serviceAccount = require(serviceAccountPath);
        options.credential = admin.credential.cert(serviceAccount);
      } catch (error) {
        console.error("Failed to load service account from file:", error);
      }
    }
  }

  if (!options.credential) {
    try {
      options.credential = admin.credential.applicationDefault();
    } catch (error) {
      console.warn("Falling back to unauthenticated Firebase Admin initialization:", error);
    }
  }

  if (process.env.FIREBASE_DATABASE_URL) {
    options.databaseURL = process.env.FIREBASE_DATABASE_URL;
  }

  if (Object.keys(options).length > 0) {
    admin.initializeApp(options);
  } else {
    admin.initializeApp();
  }
}

exports.sendPushNow = require("./sendPushNow").sendPushNow;

const INVALID_TOKEN_ERRORS = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

function collectTokensFromValue(value, addToken, uidHint) {
  if (!value) {
    return;
  }

  if (typeof value === "string") {
    addToken(value, uidHint);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectTokensFromValue(item, addToken, uidHint));
    return;
  }

  if (typeof value === "object") {
    if (value.token) {
      collectTokensFromValue(value.token, addToken, value.uid || value.userId || uidHint);
      return;
    }

    if (value.tokens) {
      collectTokensFromValue(value.tokens, addToken, value.uid || value.userId || uidHint);
      return;
    }

    Object.entries(value).forEach(([nestedKey, nestedValue]) => {
      collectTokensFromValue(nestedValue, addToken, uidHint || nestedKey);
    });
  }
}

function normalizeDataPayload(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return undefined;
  }

  const entries = Object.entries(data).map(([key, value]) => [key, String(value)]);
  if (!entries.length) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

async function handleNotifyEvent(db, payload) {
  if (!payload || typeof payload !== "object") {
    console.warn("⚠️ notify: порожній payload");
    return true;
  }

  const tokensSet = new Set();
  const tokenToUid = new Map();
  const addToken = (token, uid) => {
    if (!token || typeof token !== "string") {
      return;
    }

    const trimmed = token.trim();
    if (!trimmed) {
      return;
    }

    tokensSet.add(trimmed);
    if (uid && !tokenToUid.has(trimmed)) {
      tokenToUid.set(trimmed, uid);
    }
  };

  collectTokensFromValue(payload.token, addToken);
  collectTokensFromValue(payload.tokens, addToken);
  collectTokensFromValue(payload.recipients, addToken);

  if (!tokensSet.size) {
    console.log("ℹ️ notify: немає валідних токенів");
    return true;
  }

  const tokens = Array.from(tokensSet);
  const notification = payload.notification ||
    ((payload.title || payload.body)
      ? { title: payload.title, body: payload.body }
      : undefined);

  const data = normalizeDataPayload(payload.data);
  const sound = typeof payload.sound === "string" && payload.sound
    ? payload.sound
    : "alert.wav";

  const message = {
    tokens,
  };

  if (notification && Object.keys(notification).length) {
    message.notification = notification;
  }

  if (data) {
    message.data = data;
  }

  if (payload.android) {
    message.android = payload.android;
  } else {
    message.android = {
      priority: "high",
      notification: {
        channelId: "custom-alerts-v4",
        sound: "alert",
      },
    };
  }

  if (payload.apns) {
    message.apns = payload.apns;
  } else {
    message.apns = {
      headers: { "apns-priority": "10" },
      payload: { aps: { sound } },
    };
  }

  if (payload.webpush) {
    message.webpush = payload.webpush;
  }

  if (payload.fcmOptions) {
    message.fcmOptions = payload.fcmOptions;
  }

  const response = await getMessaging().sendEachForMulticast(message);

  console.log(
    `🔔 notify: надіслано ${response.successCount}, помилок ${response.failureCount}`,
  );

  const invalidTokens = [];
  response.responses.forEach((messageResponse, index) => {
    if (messageResponse.success) {
      return;
    }

    const failedToken = tokens[index];
    console.error(
      `❌ notify: помилка для токена ${failedToken}:`,
      messageResponse.error,
    );

    const code = messageResponse.error && messageResponse.error.code;
    if (code && INVALID_TOKEN_ERRORS.has(code)) {
      invalidTokens.push(failedToken);
    }
  });

  if (invalidTokens.length) {
    const updates = {};
    invalidTokens.forEach((token) => {
      const uid = tokenToUid.get(token);
      if (uid) {
        updates[`users/${uid}/fcmToken`] = null;
      }
    });

    if (Object.keys(updates).length) {
      await db.ref().update(updates);
      console.log(
        `🧹 notify: видалено ${Object.keys(updates).length} недійсних токен(ів)`,
      );
    } else {
      console.warn("⚠️ notify: недійсні токени без відповідних uid", invalidTokens);
    }
  }

  return true;
}

exports.executeDueEvents = onSchedule(
  {
    schedule: "every 1 minutes",
    timeZone: "Europe/Kyiv",
    region: "europe-west1",
    runtime: "nodejs20",
    retryConfig: { retryCount: 3 },
  },
  async () => {
    const db = getDatabase();
    const now = Date.now();

    const snap = await db
      .ref("scheduledEvents")
      .orderByChild("executeAt")
      .endAt(now)
      .once("value");

    if (!snap.exists()) return;

    const events = [];
    snap.forEach((child) => {
      events.push({ key: child.key, value: child.val() });
    });

    const removals = {};

    for (const { key, value } of events) {
      const { actionType, payload } = value || {};
      let processed = false;

      try {
        switch (actionType) {
          case "notify":
            processed = await handleNotifyEvent(db, payload);
            break;
          default:
            console.warn("🤷 unknown actionType:", actionType);
            processed = true;
        }
      } catch (error) {
        console.error(`❌ Помилка під час обробки події ${key}:`, error);
      }

      if (processed) {
        removals[key] = null;
      }
    }

    const removalKeys = Object.keys(removals);
    if (removalKeys.length) {
      await db.ref("scheduledEvents").update(removals);
      console.log(`✅ Removed ${removalKeys.length} event(s)`);
    } else {
      console.log("ℹ️ Не вдалося видалити жодної події (жодна не була оброблена успішно)");
    }
  },
);

exports.onMessageCreate = onValueCreated(
  {
    ref: 'guilds/{guildId}/chats/{chatId}/messages/{messageId}',
    region: 'europe-west1',
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const message = snap.val();
    const { guildId, chatId } = event.params;

    const db = getDatabase();

    const senderId = message.senderId;
    const senderNameSnap = await db.ref(`/users/${senderId}/userName`).once('value');
    const senderNameValue = senderNameSnap.val();
    const senderName =
      senderNameValue === undefined || senderNameValue === null
        ? 'GuildChat'
        : senderNameValue;
    const text =
      message.text === undefined || message.text === null ? '' : message.text;

    const chatSnap = await db.ref(`/guilds/${guildId}/chats/${chatId}/members`).once('value');
    const members = chatSnap.val() || {};

    const recipientUids = Object.keys(members).filter(uid => uid !== senderId);

    const tokens = [];
    for (const uid of recipientUids) {
      const userSnap = await db.ref(`/users/${uid}/fcmToken`).once('value');
      const fcmToken = userSnap.val();
      console.log(`FCM token for ${uid}:`, fcmToken);
      if (fcmToken) tokens.push(fcmToken);
    }

    try {
      if (tokens.length === 0) {
        console.log('No FCM tokens found.');
        return;
      }

      const response = await getMessaging().sendMulticast({
        tokens,
        notification: {
          title: senderName,
          body: text,
        },
      });

      console.log(
        `Push notifications sent. Success: ${response.successCount}, failures: ${response.failureCount}.`,
      );

      response.responses.forEach((messageResponse, index) => {
        if (!messageResponse.success) {
          console.error(
            `Failed to send notification to token ${tokens[index]}:`,
            messageResponse.error,
          );
        }
      });
    } catch (error) {
      console.error('Error sending push notification:', error);
    }
  }
);