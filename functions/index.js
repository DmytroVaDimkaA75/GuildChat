// functions/index.js  (CommonJS)
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { onValueCreated } = require("firebase-functions/v2/database");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

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
    const messaging = getMessaging();

    const senderId = message.senderId;
    const senderName = (await db.ref(`/users/${senderId}/userName`).once('value')).val();
    const text = message.text;

    const chatSnap = await db.ref(`/guilds/${guildId}/chats/${chatId}/members`).once('value');
    const members = chatSnap.val() || {};

    const recipientUids = Object.keys(members).filter(uid => uid !== senderId);

    const tokens = [];
    for (const uid of recipientUids) {
      const userSnap = await db.ref(`/users/${uid}/fcmToken`).once('value');
      const fcmToken = userSnap.val();
      if (typeof fcmToken !== 'string' || fcmToken.length === 0) {
        console.warn(`⚠️  Некоректний FCM токен для ${uid}:`, fcmToken);
        continue;
      }

      if (fcmToken.startsWith('ExponentPushToken')) {
        console.warn(
          `⚠️  Виявлено застарілий Expo push token у ${uid}, пропускаємо.`,
        );
        continue;
      }

      console.log(`FCM token for ${uid}:`, fcmToken);
      tokens.push(fcmToken);
    }

    const uniqueTokens = [...new Set(tokens)];

    if (uniqueTokens.length > 0) {
      try {
        const response = await messaging.sendMulticast({
          tokens: uniqueTokens,
          notification: {
            title: senderName,
            body: text,
          },
          data: {
            guildId,
            chatId,
            senderId,
          },
        });
        console.log(`Notification sent to ${uniqueTokens.length} user(s). Success: ${response.successCount}, Failures: ${response.failureCount}`);
      } catch (error) {
        console.error('Error sending FCM push notification:', error);
      }
    } else {
      console.log('No FCM tokens found.');
    }
  }
);
