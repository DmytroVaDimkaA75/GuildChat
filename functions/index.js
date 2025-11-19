const { onValueCreated, onValueWritten } = require("firebase-functions/v2/database");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: "https://guildchat-5d8c1-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "guildchat-5d8c1",
});

exports.sendChatNotification = onValueCreated(
  {
    ref: "/guilds/{guildId}/chats/{chatId}/messages/{messageId}",
    region: "europe-west1",
  },
  async (event) => {
    const { guildId, chatId, messageId } = event.params;
    const messageData = event.data.val();

    if (!messageData) {
      logger.log(`No data for message ${messageId}`);
      return null;
    }

    const senderId = messageData.senderId;
    const messageText = messageData.text || "Отправлено изображение";

    logger.log(`New message from ${senderId} in chat ${chatId}: "${messageText}"`);

    const chatRef = admin.database().ref(`/guilds/${guildId}/chats/${chatId}`);
    const chatSnapshot = await chatRef.once("value");
    const chatData = chatSnapshot.val();

    if (!chatData || !chatData.members) {
      logger.log(`Chat ${chatId} not found or has no members.`);
      return null;
    }
    const members = Object.keys(chatData.members);

    const senderProfile = await admin.database().ref(`/users/${senderId}`).once("value");
    const senderName = senderProfile.val()?.userName || "Новое сообщение";

    const tokensPromises = members
      .filter(memberId => memberId !== senderId)
      .map(memberId => 
        admin.database().ref(`/users/${memberId}/fcmToken`).once("value")
      );
    
    const tokensSnapshots = await Promise.all(tokensPromises);
    const tokens = tokensSnapshots
      .map(snap => snap.val())
      .filter(token => token);

    if (tokens.length > 0) {
      logger.log(`Found ${tokens.length} tokens to send notification to.`);

    const payload = {
      data: {
        chatId: chatId,
        guildId: guildId,
        title: senderName,
        body: messageText,
      },
      android: {
        priority: "high",
        notification: {
          title: senderName,
          body: messageText,
          sound: "default",
          channel_id: "default",
        },
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: senderName,
              body: messageText,
            },
            sound: "default",
            'content-available': 1,
          },
        },
      },
    };

    const message = {
      tokens,
      ...payload,
    };

    try {
      const response = await admin.messaging().sendEachForMulticast(message);
      logger.log("Successfully sent message:", response);
    } catch (error) {
      logger.error("Error sending message:", error);
    }
    } else {
      logger.log("No tokens found for recipients.");
    }
    
    return null;
  }
);

exports.sendScheduledMessages = onSchedule(
  {
    schedule: "every 1 minutes",
    region: "europe-west1",
    timeZone: "Europe/Kiev",
  },
  async (event) => {
    const now = Date.now();
    const db = admin.database();
    const scheduledMessagesRef = db.ref('scheduledMessages');

    logger.log("Running scheduled messages check...");

    const query = scheduledMessagesRef.orderByChild('status').equalTo('pending');
    const snapshot = await query.once('value');

    if (!snapshot.exists()) {
      logger.log("No pending scheduled messages found.");
      return null;
    }

    const promises = [];

    snapshot.forEach(childSnapshot => {
      const messageId = childSnapshot.key;
      const messageData = childSnapshot.val();

      if (messageData.sendAt <= now) {
        logger.log(`Sending message ${messageId} to chat ${messageData.chatId}`);
        const promise = moveMessageToChat(messageId, messageData, db);
        promises.push(promise);
      }
    });

    await Promise.all(promises);
    logger.log("Scheduled messages check finished.");
    return null;
  }
);

async function moveMessageToChat(messageId, messageData, db) {
  const { guildId, chatId, text, senderId } = messageData;

  if (!guildId || !chatId) {
    logger.error(`Missing guildId or chatId for message ${messageId}`);
    return db.ref(`scheduledMessages/${messageId}`).update({ status: 'error', error: 'Missing guildId or chatId' });
  }

  const chatMessagesRef = db.ref(`/guilds/${guildId}/chats/${chatId}/messages`);

  const finalMessage = {
    senderId,
    text,
    status: 'sent',
    timestamp: admin.database.ServerValue.TIMESTAMP,
  };
  
  await chatMessagesRef.push(finalMessage);
  return db.ref(`scheduledMessages/${messageId}`).update({ status: 'sent' });
}

exports.testPushNotification = onRequest(
  { region: "europe-west1" },
  async (req, res) => {
    const token = req.query.token;

    if (!token) {
      logger.error("No token provided in the request.");
      res.status(400).send("Please provide a 'token' query parameter.");
      return;
    }

    logger.log(`Attempting to send a test notification to token: ${token}`);

    const payload = {
      notification: {
        title: "Тест из Cloud Function!",
        body: "Если ты это видишь, значит, все работает!",
        sound: "default",
      },
    };

    try {
      const response = await admin.messaging().sendToDevice(token, payload);
      logger.log("Test notification sent successfully:", response);
      res.status(200).send("Test notification sent successfully!");
    } catch (error) {
      logger.error("FAILED to send test notification:", error);
      res.status(500).send(`Failed to send notification: ${error.message}`);
    }
  }
);

const NOTIFICATION_LEAD_TIME_MINUTES = 2;

function normalizeTimestampToSeconds(rawTimestamp, contextLabel = '') {
  if (rawTimestamp === null || rawTimestamp === undefined) {
    return null;
  }

  const numericValue = Number(rawTimestamp);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  if (numericValue > 1e10) {
    const normalized = Math.floor(numericValue / 1000);
    if (contextLabel) {
      logger.log(`${contextLabel} Normalized millisecond timestamp ${numericValue} -> ${normalized}`);
    }
    return normalized;
  }

  return Math.floor(numericValue);
}

exports.scheduleGbgNotifications = onValueWritten(
  {
    ref: "/guilds/{guildId}/GBG/sectors/{sectorId}",
    region: "europe-west1",
  },
  async (event) => {
    const { guildId, sectorId } = event.params;
    const db = admin.database();

    const queueRef = db.ref('gbgNotificationQueue');
    const oldNotificationsQuery = queueRef.orderByChild('sectorId').equalTo(sectorId);
    const oldNotificationsSnap = await oldNotificationsQuery.once('value');
    if (oldNotificationsSnap.exists()) {
      const updates = {};
      oldNotificationsSnap.forEach(child => {
        updates[child.key] = null;
      });
      await queueRef.update(updates);
      logger.log(`Removed old notifications for sector ${sectorId} of guild ${guildId}`);
    }

    if (!event.data.after.exists()) {
      return null;
    }

    const sectorData = event.data.after.val();
    
    const ownerId = sectorData.owner || sectorData.ownerId;
    const openTime = normalizeTimestampToSeconds(sectorData.openTime, `[${sectorId}]`);

    if (!ownerId || !openTime || ownerId === '0') {
      logger.log(`[${sectorId}] Sector is neutral or has no open time. Skipping.`);
      return null;
    }

    const parts = String(guildId).split('_');
    const shortGuildId = parts.length > 1 ? parts[parts.length - 1] : parts[0];

    if (String(ownerId) === shortGuildId) {
      logger.log(`[${sectorId}] Sector is our own. Skipping.`);
      return null;
    }

    const nowInSeconds = Math.floor(Date.now() / 1000);
    const notificationTime = Math.floor(openTime - (NOTIFICATION_LEAD_TIME_MINUTES * 60));

    if (notificationTime <= nowInSeconds) {
      logger.log(`[${sectorId}] Notification time is in the past. Skipping.`);
      return null;
    }
    
    const newTask = {
      guildId: guildId,
      shortGuildId: shortGuildId,
      sectorId: sectorId,
      targetOpenTime: openTime,
      notificationTime: notificationTime,
      status: 'pending',
    };

    await queueRef.push(newTask);
    logger.log(`[${sectorId}] Scheduled notification for ${new Date(notificationTime * 1000).toISOString()}`);
    
    return null;
  }
);

exports.processGbgNotificationQueue = onSchedule(
  {
    schedule: "every 1 minutes",
    region: "europe-west1",
    timeZone: "Europe/Kiev",
  },
  async (event) => {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const db = admin.database();
    const queueRef = db.ref('gbgNotificationQueue');

    logger.log("Running GBG notifications check...");

    const pendingQuery = queueRef.orderByChild('status').equalTo('pending');
    const snapshot = await pendingQuery.once('value');

    if (!snapshot.exists()) {
      logger.log("No pending GBG notifications to send.");
      return null;
    }

    const normalizationPromises = [];
    const processingPromises = [];

    snapshot.forEach((childSnapshot) => {
      const taskId = childSnapshot.key;
      const rawTaskData = childSnapshot.val() || {};
      const sectorId = rawTaskData.sectorId || 'unknown';

      const normalizedNotificationTime = normalizeTimestampToSeconds(
        rawTaskData.notificationTime,
        `[${sectorId}] notificationTime`
      );

      if (!normalizedNotificationTime) {
        logger.log(`[${sectorId}] Removing task ${taskId} with invalid notification time.`);
        normalizationPromises.push(queueRef.child(taskId).remove());
        return;
      }

      const normalizedTargetOpenTime = normalizeTimestampToSeconds(
        rawTaskData.targetOpenTime,
        `[${sectorId}] targetOpenTime`
      );

      const updates = {};
      if (rawTaskData.notificationTime !== normalizedNotificationTime) {
        updates.notificationTime = normalizedNotificationTime;
      }
      if (
        normalizedTargetOpenTime &&
        rawTaskData.targetOpenTime !== normalizedTargetOpenTime
      ) {
        updates.targetOpenTime = normalizedTargetOpenTime;
      }

      if (Object.keys(updates).length > 0) {
        normalizationPromises.push(queueRef.child(taskId).update(updates));
      }

      if (normalizedNotificationTime > nowInSeconds) {
        logger.log(
          `[${sectorId}] Skipping task ${taskId}; notification scheduled for ${new Date(
            normalizedNotificationTime * 1000
          ).toISOString()}`
        );
        return;
      }

      const normalizedTaskData = {
        ...rawTaskData,
        notificationTime: normalizedNotificationTime,
        targetOpenTime:
          normalizedTargetOpenTime || rawTaskData.targetOpenTime,
      };

      processingPromises.push(
        processSingleGbgNotification(taskId, normalizedTaskData, db)
      );
    });

    if (normalizationPromises.length > 0) {
      await Promise.all(normalizationPromises);
    }

    if (processingPromises.length === 0) {
      logger.log("No GBG notifications due right now.");
      return null;
    }

    await Promise.all(processingPromises);
    logger.log("GBG notifications check finished.");
    return null;
  }
);

async function processSingleGbgNotification(taskId, taskData, db) {
  const { guildId, shortGuildId, sectorId } = taskData;
  logger.log(`Processing task ${taskId} for sector ${sectorId}`);

  await db.ref(`gbgNotificationQueue/${taskId}`).update({ status: 'processing' });
  
  const sectorsSnap = await db.ref(`/guilds/${guildId}/GBG/sectors`).once('value');
  const allSectors = sectorsSnap.val() || {};
  
  const targetSector = allSectors[sectorId];


  const currentOwner = targetSector?.owner || targetSector?.ownerId;
  if (!currentOwner || String(currentOwner) === shortGuildId || String(currentOwner) === '0') {
    logger.log(`[${sectorId}] Abort: Sector is no longer an enemy sector.`);
    return db.ref(`gbgNotificationQueue/${taskId}`).remove();
  }

  const neighbors = getSectorNeighbors(sectorId);
  if (!neighbors || neighbors.length === 0) {
      logger.log(`[${sectorId}] Abort: Cannot determine neighbors for this sector.`);
      return db.ref(`gbgNotificationQueue/${taskId}`).remove();
  }

  const now = Math.floor(Date.now() / 1000);
  const ourOpenAdjacentSectors = neighbors.filter(neighborId => {
      const neighborData = allSectors[neighborId];
      const neighborOwner = neighborData?.owner || neighborData?.ownerId;
      if (String(neighborOwner) !== shortGuildId) {
          return false;
      }
      const neighborOpenTime = normalizeTimestampToSeconds(neighborData?.openTime);
      return neighborOpenTime === null || neighborOpenTime <= now;
  });

  if (ourOpenAdjacentSectors.length === 0) {
      logger.log(`[${sectorId}] Abort: We have no open adjacent sectors.`);
      return db.ref(`gbgNotificationQueue/${taskId}`).remove();
  }
  
  logger.log(`[${sectorId}] All checks passed! Sending notification.`);
  
  const membersSnap = await db.ref(`/guilds/${guildId}/guildUsers`).once('value');
  const members = membersSnap.val() ? Object.keys(membersSnap.val()) : [];

  if (members.length === 0) {
      logger.log(`[${sectorId}] No members in guild ${guildId} to notify.`);
      return db.ref(`gbgNotificationQueue/${taskId}`).remove();
  }

  const tokensPromises = members.map(uid => db.ref(`/users/${uid}/fcmToken`).once("value"));
  const tokensSnapshots = await Promise.all(tokensPromises);
  const tokens = tokensSnapshots.map(snap => snap.val()).filter(Boolean);

  if (tokens.length === 0) {
    logger.log(`[${sectorId}] No FCM tokens available for guild members.`);
    return db.ref(`gbgNotificationQueue/${taskId}`).remove();
  }

  const message = `Відкривається сектор ${sectorId}!`;

  const payload = {
    notification: {
      title: "Поле битви",
      body: message,
      sound: "default",
    },
    data: {
      screen: 'GBG',
      sectorId: sectorId,
    },
  };

  try {
    const response = await admin.messaging().sendEachForMulticast({ tokens, ...payload });
    logger.log(`[${sectorId}] Successfully sent notifications to ${response.successCount} members.`);
  } catch (error) {
    logger.error(`[${sectorId}] Failed to send notifications:`, error);
    await db.ref(`gbgNotificationQueue/${taskId}`).update({ status: 'error', error: error.message || 'send-failed' });
    return null;
  }

  return db.ref(`gbgNotificationQueue/${taskId}`).remove();
}

function getSectorNeighbors(sectorId) {
    const SECTOR_NEIGHBORS = {
      A2A: ['A3A', 'A3B', 'B2A', 'X1X', 'F2A', 'F3B'],
      A3A: ['A4A', 'A4B', 'A3B', 'A2A', 'F3B', 'F4C'],
      A3B: ['A4B', 'A4C', 'B3A', 'B2A', 'A2A', 'A3A'],
      A4A: ['A5A', 'A5B', 'A4B', 'A3A', 'F4C', 'F5D'],
      A4B: ['A5B', 'A5C', 'A4C', 'A3B', 'A3A', 'A4A'],
      A4C: ['A5C', 'A5D', 'B4A', 'B3A', 'A3B', 'A4B'],
      A5A: ['A5B', 'A4A', 'F5D'],
      A5B: ['A5C', 'A4B', 'A4A', 'A5A'],
      A5C: ['A5D', 'A4C', 'A4B', 'A5B'],
      A5D: ['B5A', 'B4A', 'A4C', 'A5C'],
      B2A: ['A3B', 'B3A', 'B3B', 'C2A', 'X1X', 'A2A'],
      B3A: ['A4C', 'B4A', 'B4B', 'B3B', 'B2A', 'A3B'],
      B3B: ['B3A', 'B4B', 'B4C', 'C3A', 'C2A', 'B2A'],
      B4A: ['A5D', 'B5A', 'B5B', 'B4B', 'B3A', 'A4C'],
      B4B: ['B4A', 'B5B', 'B5C', 'B4C', 'B3B', 'B3A'],
      B4C: ['B4B', 'B5C', 'B5D', 'C4A', 'C3A', 'B3B'],
      B5A: ['B5B', 'B4A', 'A5D'],
      B5B: ['B5A', 'B5C', 'B4B', 'B4A'],
      B5C: ['B5B', 'B5D', 'B4C', 'B4B'],
      B5D: ['B5C', 'C5A', 'C4A', 'B4C'],
      C2A: ['B2A', 'B3B', 'C3A', 'C3B', 'D2A', 'X1X'],
      C3A: ['B3B', 'B4C', 'C4A', 'C4B', 'C3B', 'C2A'],
      C3B: ['C2A', 'C3A', 'C4B', 'C4C', 'D3A', 'D2A'],
      C4A: ['B4C', 'B5D', 'C5A', 'C5B', 'C4B', 'C3A'],
      C4B: ['C3A', 'C4A', 'C5B', 'C5C', 'C4C', 'C3B'],
      C4C: ['C3B', 'C4B', 'C5C', 'C5D', 'D4A', 'D3A'],
      C5A: ['B5D', 'C5B', 'C4A'],
      C5B: ['C4A', 'C5A', 'C5C', 'C4B'],
      C5C: ['C4B', 'C5B', 'C5D', 'C4C'],
      C5D: ['C4C', 'C5C', 'D5A', 'D4A'],
      D2A: ['X1X', 'C2A', 'C3B', 'D3A', 'D3B', 'E2A'],
      D3A: ['D2A', 'C3B', 'C4C', 'D4A', 'D4B', 'D3B'],
      D3B: ['E2A', 'D2A', 'D3A', 'D4B', 'D4C', 'E3A'],
      D4A: ['D3A', 'C4C', 'C5D', 'D5A', 'D5B', 'D4B'],
      D4B: ['D3B', 'D3A', 'D4A', 'D5B', 'D5C', 'D4C'],
      D4C: ['E3A', 'D3B', 'D4B', 'D5C', 'D5D', 'E4A'],
      D5A: ['D4A', 'C5D', 'D5B'],
      D5B: ['D4B', 'D4A', 'D5A', 'D5C'],
      D5C: ['D4C', 'D4B', 'D5B', 'D5D'],
      D5D: ['E4A', 'D4C', 'D5C', 'E5A'],
      E2A: ['F2A', 'X1X', 'D2A', 'D3B', 'E3A', 'E3B'],
      E3A: ['E3B', 'E2A', 'D3B', 'D4C', 'E4A', 'E4B'],
      E3B: ['F3A', 'F2A', 'E2A', 'E3A', 'E4B', 'E4C'],
      E4A: ['E4B', 'E3A', 'D4C', 'D5D', 'E5A', 'E5B'],
      E4B: ['E4C', 'E3B', 'E3A', 'E4A', 'E5B', 'E5C'],
      E4C: ['F4A', 'F3A', 'E3B', 'E4B', 'E5C', 'E5D'],
      E5A: ['E5B', 'E4A', 'D5D'],
      E5B: ['E5C', 'E4B', 'E4A', 'E5A'],
      E5C: ['E5D', 'E4C', 'E4B', 'E5B'],
      E5D: ['F5A', 'F4A', 'E4C', 'E5C'],
      F2A: ['F3B', 'A2A', 'X1X', 'E2A', 'E3B', 'F3A'],
      F3A: ['F4B', 'F3B', 'F2A', 'E3B', 'E4C', 'F4A'],
      F3B: ['F4C', 'A3A', 'A2A', 'F2A', 'F3A', 'F4B'],
      F4A: ['F5B', 'F4B', 'F3A', 'E4C', 'E5D', 'F5A'],
      F4B: ['F5C', 'F4C', 'F3B', 'F3A', 'F4A', 'F5B'],
      F4C: ['F5D', 'A4A', 'A3A', 'F3B', 'F4B', 'F5C'],
      F5A: ['F5B', 'F4A', 'E5D'],
      F5B: ['F5C', 'F4B', 'F4A', 'F5A'],
      F5C: ['F5D', 'F4C', 'F4B', 'F5B'],
      F5D: ['A5A', 'A4A', 'F4C', 'F5C'],
      X1X: ['A2A', 'B2A', 'C2A', 'D2A', 'E2A', 'F2A'],
    };
    return SECTOR_NEIGHBORS[sectorId] || [];
}

exports.sendGbgHelpNotification = onCall(
  { region: "europe-west1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.'
      );
    }
    
    const { guildId } = request.data;
    if (!guildId) {
      throw new HttpsError('invalid-argument', 'The function must be called with a "guildId" argument.');
    }

    logger.log(`Received GBG help request for guild: ${guildId}`);

    const membersSnap = await admin.database().ref(`/guilds/${guildId}/guildUsers`).once('value');
    if (!membersSnap.exists()) {
      logger.log(`Guild ${guildId} has no members to notify.`);
      return { success: true, message: "No members found." };
    }
    const members = Object.keys(membersSnap.val());

    const tokensPromises = members.map(uid => 
      admin.database().ref(`/users/${uid}/fcmToken`).once("value")
    );
    const tokensSnapshots = await Promise.all(tokensPromises);
    const tokens = tokensSnapshots.map(snap => snap.val()).filter(Boolean);

    if (tokens.length === 0) {
      logger.log("No FCM tokens found for any guild members.");
      return { success: true, message: "No tokens found." };
    }

    const payload = {
      notification: {
        title: "Поле битви",
        body: "терміново зайдіть на поля",
        sound: "default",
      },
      data: {
        screen: 'GBG',
      },
    };

    try {
      const response = await admin.messaging().sendEachForMulticast({ tokens, ...payload });
      logger.log(`Successfully sent GBG help notifications to ${response.successCount} devices.`);
      return { success: true, sentCount: response.successCount };
    } catch (error) {
      logger.error("Error sending GBG help notification:", error);
      throw new HttpsError('internal', 'Failed to send notifications.');
    }
  }
);