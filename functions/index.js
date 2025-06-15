const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { CloudTasksClient } = require('@google-cloud/tasks');

admin.initializeApp();

// HTTP function to delete an express record
exports.deleteExpress = functions.https.onRequest(async (req, res) => {
  const { guildId, expressId } = req.body;
  if (!guildId || !expressId) {
    res.status(400).send('Missing parameters');
    return;
  }
  try {
    await admin
      .database()
      .ref(`guilds/${guildId}/express/${expressId}`)
      .remove();
    res.status(200).send('ok');
  } catch (err) {
    console.error(err);
    res.status(500).send('error');
  }
});

// Trigger on creation of express record
exports.scheduleExpressDeletion = functions.database
  .ref('guilds/{guildId}/express/{expressId}')
  .onCreate(async (snapshot, context) => {
    const { guildId, expressId } = context.params;
    const data = snapshot.val();
    const scheduleTime = data && data.scheduleTime;
    if (!scheduleTime) {
      return null;
    }

    const client = new CloudTasksClient();
    const project = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT;
    const location = 'us-central1';
    const queue = 'express-deletions';
    const parent = client.queuePath(project, location, queue);
    const url = `https://${location}-${project}.cloudfunctions.net/deleteExpress`;

    const task = {
      httpRequest: {
        httpMethod: 'POST',
        url,
        headers: {
          'Content-Type': 'application/json',
        },
        body: Buffer.from(JSON.stringify({ guildId, expressId })).toString('base64'),
      },
      scheduleTime: { seconds: Math.floor(scheduleTime / 1000) },
    };

    try {
      await client.createTask({ parent, task });
    } catch (err) {
      console.error('Failed to create task', err);
    }
    return null;
  });
