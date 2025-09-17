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

    const removals = {};

    snap.forEach((child) => {
      const { actionType, payload } = child.val();

      switch (actionType) {
        case "notify":
          console.log("🔔 notify:", payload);
          break;
        default:
          console.warn("🤷 unknown actionType:", actionType);
      }
      removals[child.key] = null;
    });

    await db.ref("scheduledEvents").update(removals);
    console.log(`✅ Removed ${Object.keys(removals).length} event(s)`);
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