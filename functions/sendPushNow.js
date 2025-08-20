// functions/sendPushNow.js
const { onRequest } = require("firebase-functions/v2/https");
const { getMessaging } = require("firebase-admin/messaging");
require("./init.js");

exports.sendPushNow = onRequest(
  { region: "europe-west1" },
  async (req, res) => {
    const {
      token,
      title,
      body,
      data = {},
      // Для iOS лишаю можливість перекидати sound з клієнта,
      // але за замовчуванням ставлю "alert" (без розширення).
      sound = "alert",
    } = req.body || {};

    if (!token || !title || !body) {
      return res.status(400).json({ error: "token, title, body required" });
    }

    await getMessaging().send({
      token,
      notification: { title, body },
      android: {
        notification: {
          // ВАЖЛИВО: канал має збігатися з тим, що ти створюєш у додатку
          channelId: "custom-alerts",
          // На Android 8+ звук визначає канал, але вкажемо для сумісності:
          sound: "alert", // ім'я без розширення
        },
      },
      apns: { payload: { aps: { sound } } }, // iOS (потрібен файл у проєкті у форматі caf/wav/aiff)
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
    });

    res.json({ status: "sent" });
  }
);
