const { onRequest }   = require('firebase-functions/v2/https');
const { getMessaging } = require('firebase-admin/messaging');
const { getDatabase } = require('firebase-admin/database');
require('./init.js');

exports.sendPushNow = onRequest(
  { region: 'europe-west1' },
  async (req, res) => {
    const { uid, token: explicitToken, title, body, data = {}, sound = 'default' } = req.body || {};
    if ((!uid && !explicitToken) || !title || !body) {
      return res.status(400).json({ error: 'uid or token plus title and body required' });
    }

    let token = explicitToken;
    if (!token && uid) {
      const snap = await getDatabase()
                        .ref(`users/${uid}/fcmToken`)
                        .once('value');
      token = snap.val();
    }
    if (!token) {
      return res.status(404).json({ error: 'Token not found' });
    }

    await getMessaging().send({
      token,
      notification: { title, body },
      android: { notification: { sound } },
      apns:   { payload: { aps: { sound } } },
      data: Object.fromEntries(
              Object.entries(data).map(([k, v]) => [k, String(v)])),
    });

    res.json({ status: 'sent' });
  }
);
