const { onRequest }   = require('firebase-functions/v2/https');
const { getMessaging } = require('firebase-admin/messaging');
require('./init.js');

exports.sendPushNow = onRequest(
  { region: 'europe-west1' },
  async (req, res) => {
    const { token, title, body, data = {}, sound = 'default' } = req.body || {};
    if (!token || !title || !body) {
      return res.status(400).json({ error: 'token, title, body required' });
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
