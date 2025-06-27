// functions/index.js  (CommonJS)
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {initializeApp} = require("firebase-admin/app");
const {getDatabase} = require("firebase-admin/database");

initializeApp();

exports.executeDueEvents = onSchedule(
    {
      schedule: "every 1 minutes",
      timeZone: "Europe/Kyiv",
      region: "europe-west1",
      runtime: "nodejs20",
      retryConfig: {retryCount: 3},
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
        const {actionType, payload} = child.val();

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

exports.sendPushNow = require('./sendPushNow').sendPushNow;
