// functions/sendPushNow.js
const { onRequest } = require("firebase-functions/v2/https");
const { getMessaging } = require("firebase-admin/messaging");
require("./init.js");

/**
 * HTTP POST /sendPushNow
 * Body JSON:
 *  {
 *    "token": "<Expo/FCM token>",
 *    "title": "Заголовок",
 *    "body": "Текст",
 *    "data": { ... },                 // опційно, лише рядки
 *    "sound": "alert.wav"            // iOS: файл у бандлі (caf/wav/aiff). За замовчуванням: alert.wav
 *  }
 *
 * Для ANDROID 8+:
 *  - звук визначається КАНАЛОМ
 *  - у додатку створено канал "custom-alerts-v3" зі sound: "alert" (без розширення)
 *  - тут надсилаємо в цей самий channelId
 */
exports.sendPushNow = onRequest({ region: "europe-west1" }, async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Use POST" });
    }

    const {
      token,
      title,
      body,
      data = {},
      sound = "alert.wav" // iOS: файл у бандлі (caf/wav/aiff). Для Android не використовується, канал визначає звук
    } = req.body || {};

    if (!token || !title || !body) {
      return res.status(400).json({ error: "token, title, body required" });
    }

    // Перетворюємо data у рядки (вимога FCM)
    const stringData = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    );

    const message = {
      token,
      notification: { title, body },

      // ANDROID: канал МАЄ збігатися з тим, що створюється в App.js
      android: {
        priority: "high",
        notification: {
          channelId: "custom-alerts-v3",
          // Для Android < 8 може вплинути. Для 8+ звук визначається каналом.
          sound: "alert" // <-- без розширення; відповідає res/raw/alert.(wav|mp3)
        }
      },

      // iOS (якщо потрібно): звук задається тут
      apns: {
        headers: { "apns-priority": "10" },
        payload: {
          aps: {
            sound // напр., "alert.wav"
          }
        }
      },

      data: stringData
    };

    await getMessaging().send(message);
    return res.json({ status: "sent" });
  } catch (err) {
    console.error("sendPushNow error:", err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
});
