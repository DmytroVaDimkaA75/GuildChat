// functions/index.js  (CommonJS)
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { getMessaging } = require("firebase-admin/messaging");
const { onValueCreated } = require("firebase-functions/v2/database");
const fetch = require('node-fetch');

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
          try {
            const {
              tokens,
              token,
              title,
              body,
              notification = {},
              data = {},
              sound = "alert.mp3",
            } = payload || {};

            const targetTokens = Array.isArray(tokens)
              ? tokens.filter((t) => typeof t === "string" && t.trim())
              : token
              ? [token]
              : [];

            if (targetTokens.length === 0) {
              console.warn("⚠️ notify payload without tokens", payload);
              break;
            }

            const messageNotification = {
              ...notification,
            };

            if (!messageNotification.title && title) {
              messageNotification.title = title;
            }
            if (!messageNotification.body && body) {
              messageNotification.body = body;
            }

            const rawData =
              data && typeof data === "object" && !Array.isArray(data) ? data : {};
            const sanitizedData = Object.fromEntries(
              Object.entries(rawData).map(([k, v]) => [k, String(v)])
            );

            const messaging = getMessaging();
            const androidSound = sound ? sound.replace(/\.[^/.]+$/, "") : undefined;

            await Promise.all(
              targetTokens.map((targetToken) =>
                messaging.send({
                  token: targetToken,
                  notification: Object.keys(messageNotification).length
                    ? messageNotification
                    : undefined,
                  data: Object.keys(sanitizedData).length ? sanitizedData : undefined,
                  android: androidSound
                    ? { notification: { sound: androidSound } }
                    : undefined,
                  apns: sound
                    ? { payload: { aps: { sound } } }
                    : undefined,
                })
              )
            );

            console.log(
              `📤 Sent notify event to ${targetTokens.length} recipient(s)`
            );
          } catch (err) {
            console.error("❌ Failed to process notify event", err);
          }
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

    const admin = require('firebase-admin');
    const db = getDatabase();

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
      console.log(`FCM token for ${uid}:`, fcmToken);
      if (fcmToken) tokens.push(fcmToken);
    }

    if (tokens.length > 0) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tokens.map(token => ({
          to: token,
          title: senderName,
          body: text,
        }))),
      });
      console.log(`Notification sent to ${tokens.length} user(s).`);
    } else {
      console.log('No FCM tokens found.');
    }

    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tokens.map(token => ({
          to: token,
          title: senderName,
          body: text,
        }))),
      });
      const result = await response.json();
      console.log('Push notification result:', result);
    } catch (error) {
      console.error('Error sending push notification:', error);
    }
  }
);