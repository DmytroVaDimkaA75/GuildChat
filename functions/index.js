const { onValueCreated, onValueWritten } = require("firebase-functions/v2/database");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.sendChatNotification = onValueCreated(
  {
    ref: "/guilds/{guildId}/chats/{chatId}/messages/{messageId}",
    region: "europe-west1",
  },
  async (event) => {
    const { guildId, chatId, messageId } = event.params;
    const messageData = event.data.val();
    if (!messageData) return null;
    
    const senderId = messageData.senderId;
    const messageText = messageData.text || "Отправлено изображение";
    
    const chatRef = admin.database().ref(`/guilds/${guildId}/chats/${chatId}`);
    const chatSnapshot = await chatRef.once("value");
    const chatData = chatSnapshot.val();
    if (!chatData || !chatData.members) return null;
    
    const members = Object.keys(chatData.members);
    const senderProfile = await admin.database().ref(`/users/${senderId}`).once("value");
    const senderName = senderProfile.val()?.userName || "Новое сообщение";
    
    const tokensPromises = members.filter(m => m !== senderId).map(m => admin.database().ref(`/users/${m}/fcmToken`).once("value"));
    const tokensSnapshots = await Promise.all(tokensPromises);
    const tokens = tokensSnapshots.map(snap => snap.val()).filter(Boolean);
    
    if (tokens.length > 0) {
        const payload = {
            data: { chatId, guildId, title: senderName, body: messageText },
            android: { priority: "high", notification: { title: senderName, body: messageText, sound: "default", channel_id: "default" } },
            apns: { payload: { aps: { alert: { title: senderName, body: messageText }, sound: "default", 'content-available': 1 } } }
        };
        try { await admin.messaging().sendEachForMulticast({ tokens, ...payload }); } catch(e) { logger.error(e); }
    }
    return null;
  }
);

exports.sendScheduledMessages = onSchedule(
  { schedule: "every 1 minutes", region: "europe-west1", timeZone: "Europe/Kiev" },
  async (event) => {
    const now = Date.now();
    const db = admin.database();
    const scheduledMessagesRef = db.ref('scheduledMessages');
    const query = scheduledMessagesRef.orderByChild('status').equalTo('pending');
    const snapshot = await query.once('value');
    if (!snapshot.exists()) return null;
    const promises = [];
    snapshot.forEach(childSnapshot => {
      const messageId = childSnapshot.key;
      const messageData = childSnapshot.val();
      if (messageData.sendAt <= now) {
        promises.push(moveMessageToChat(messageId, messageData, db));
      }
    });
    await Promise.all(promises);
    return null;
  }
);

async function moveMessageToChat(messageId, messageData, db) {
  const { guildId, chatId, text, senderId } = messageData;
  if (!guildId || !chatId) return db.ref(`scheduledMessages/${messageId}`).update({ status: 'error' });
  const chatMessagesRef = db.ref(`/guilds/${guildId}/chats/${chatId}/messages`);
  const finalMessage = { senderId, text, status: 'sent', timestamp: admin.database.ServerValue.TIMESTAMP };
  await chatMessagesRef.push(finalMessage);
  return db.ref(`scheduledMessages/${messageId}`).update({ status: 'sent' });
}

exports.syncGbgNotifications = onValueWritten(
  {
    ref: "/guilds/{guildId}/GBG/sectors/{sectorId}",
    region: "europe-west1",
  },
  async (event) => {
    const triggeredGuildId = event.params.guildId;
    if (triggeredGuildId && !String(triggeredGuildId).includes("10821")) {
        return null; 
    }

    const guildId = "ru11_10821";
    const shortGuildId = "10821";

    const db = admin.database();
    const LEAD_TIME_SECONDS = 120;
    const TIME_TOLERANCE = 120;

    const mapNameSnap = await db.ref(`/guilds/${guildId}/GBG/map`).once('value');
    const mapName = mapNameSnap.exists() ? mapNameSnap.val() : "volcano_archipelago";

    const [allSectorsSnap, mapTopologySnap, currentQueueSnap] = await Promise.all([
        db.ref(`/guilds/${guildId}/GBG/sectors`).once('value'),
        db.ref(`maps/${mapName}`).once('value'),
        db.ref('gbgNotificationQueue').orderByChild('guildId').equalTo(guildId).once('value')
    ]);

    if (!allSectorsSnap.exists() || !mapTopologySnap.exists()) return null;

    const allSectors = allSectorsSnap.val();
    const mapTopology = mapTopologySnap.val();
    const currentQueue = currentQueueSnap.exists() ? currentQueueSnap.val() : {};

    const mySectors = [];
    Object.keys(allSectors).forEach(key => {
        const sec = allSectors[key];
        const owner = String(sec.owner || sec.ownerId || "0");
        if (owner === shortGuildId) mySectors.push(key);
    });

    const targetSet = new Set();
    
    mySectors.forEach(mySectorId => {
        let neighborList = [];
        const rawNeighbors = mapTopology[mySectorId];
        
        if (rawNeighbors) {
            if (Array.isArray(rawNeighbors)) {
                neighborList = rawNeighbors;
            } else if (typeof rawNeighbors === 'object') {
                neighborList = Object.values(rawNeighbors);
            }
        }

        neighborList.forEach(neighborId => {
            if (neighborId && allSectors[neighborId]) {
                targetSet.add(neighborId);
            }
        });
    });

    const nowInSeconds = Math.floor(Date.now() / 1000);
    const updates = {};
    const processedTaskIds = new Set();

    for (const targetId of targetSet) {
        const sec = allSectors[targetId];
        const owner = String(sec.owner || sec.ownerId || "0");
        const openTime = Number(sec.openTime);
        const armyRaw = String(sec.army || '').toLowerCase();
        const armyType = (armyRaw === 'attack') ? 'attack' : 'defense';

        if (owner !== shortGuildId && !isNaN(openTime) && openTime > 0) {
            if (openTime < (nowInSeconds - 300)) continue;

            const taskId = `${guildId}_${targetId}`;
            processedTaskIds.add(taskId);
            
            if (currentQueue[taskId]) {
                const existingTask = currentQueue[taskId];
                
                if (existingTask.status === 'processing') continue;

                if (existingTask.status === 'sent') {
                    if (Math.abs(existingTask.openTime - openTime) < TIME_TOLERANCE) {
                        continue; 
                    }
                }
            }

            const idealNotifyTime = openTime - LEAD_TIME_SECONDS;
            let finalNotifyTime = idealNotifyTime;

            if (idealNotifyTime < nowInSeconds) {
                if (openTime > nowInSeconds) {
                    finalNotifyTime = nowInSeconds;
                } else {
                    continue;
                }
            }

            updates[`gbgNotificationQueue/${taskId}`] = {
                guildId: String(guildId),
                shortGuildId: shortGuildId,
                sectorId: String(targetId),
                openTime: openTime,
                notificationTime: finalNotifyTime,
                army: armyType,
                status: 'pending'
            };
        }
    }

    Object.keys(currentQueue).forEach(taskId => {
        if (!processedTaskIds.has(taskId)) {
            const task = currentQueue[taskId];
            if (task.status === 'pending') {
                updates[`gbgNotificationQueue/${taskId}`] = null;
            } else if (task.status === 'sent') {
                if (task.openTime < (nowInSeconds - 21600)) {
                    updates[`gbgNotificationQueue/${taskId}`] = null;
                }
            }
        }
    });

    if (Object.keys(updates).length > 0) {
        await db.ref().update(updates);
    }

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

    const query = queueRef.orderByChild('notificationTime').endAt(nowInSeconds);
    const snapshot = await query.once('value');

    if (!snapshot.exists()) return null;

    const promises = [];
    snapshot.forEach(child => {
      const task = child.val();
      const key = child.key;

      if (task.status === 'pending') {
          promises.push(sendPushAndMarkSent(key, task, db));
      }
    });

    await Promise.all(promises);
    return null;
  }
);

async function sendPushAndMarkSent(taskId, task, db) {
    const { guildId, sectorId, army, openTime } = task;
    const nowInSeconds = Math.floor(Date.now() / 1000);

    if (openTime > (nowInSeconds + 180)) {
        logger.warn(`[EARLY DETECTED] Task ${taskId} triggered too early. OpenTime: ${openTime}, Now: ${nowInSeconds}. Rescheduling.`);
        
        const correctNotifyTime = openTime - 120;
        
        return db.ref(`gbgNotificationQueue/${taskId}`).update({
            notificationTime: correctNotifyTime,
            status: 'pending'
        });
    }

    await db.ref(`gbgNotificationQueue/${taskId}`).update({ status: 'processing' });

    const membersSnap = await db.ref(`/guilds/${guildId}/guildUsers`).once('value');
    if (!membersSnap.exists()) {
        return db.ref(`gbgNotificationQueue/${taskId}`).remove();
    }

    const memberIds = Object.keys(membersSnap.val());
    const tokensPromises = memberIds.map(uid => db.ref(`/users/${uid}/fcmToken`).once("value"));
    const tokensSnaps = await Promise.all(tokensPromises);
    const tokens = tokensSnaps.map(s => s.val()).filter(Boolean);

    if (tokens.length > 0) {
        const isAttack = (army === 'attack');
        const icon = isAttack ? '⚔️' : '🛡️';
        const actionText = isAttack ? 'Атака!' : 'Захист!';
        
        const titleText = `${icon} Поле битви`;
        const messageText = `${icon} Сектор ${sectorId} скоро відкриється! (${actionText})`;
        
        const payload = {
            data: { screen: 'GBG', sectorId: String(sectorId), title: titleText, body: messageText },
            android: { priority: "high", notification: { title: titleText, body: messageText, sound: "default", channel_id: "default" } },
            apns: { payload: { aps: { alert: { title: titleText, body: messageText }, sound: "default", 'content-available': 1 } } }
        };

        try {
            await admin.messaging().sendEachForMulticast({ tokens, ...payload });
            logger.log(`[PUSH SENT] ${sectorId} sent to ${tokens.length} users.`);
        } catch(e) {
            logger.error(e);
        }
    }

    return db.ref(`gbgNotificationQueue/${taskId}`).update({ 
        status: 'sent', 
        sentAt: admin.database.ServerValue.TIMESTAMP 
    });
}

exports.sendGbgHelpNotification = onCall({ region: "europe-west1" }, async (request) => {
    const { guildId } = request.data;
    if (!guildId) return { success: false };

    const db = admin.database();
    const membersSnap = await db.ref(`/guilds/${guildId}/guildUsers`).once('value');
    if (!membersSnap.exists()) return { success: false };

    const memberIds = Object.keys(membersSnap.val());
    const tokensPromises = memberIds.map(uid => db.ref(`/users/${uid}/fcmToken`).once("value"));
    const tokensSnaps = await Promise.all(tokensPromises);
    const tokens = tokensSnaps.map(s => s.val()).filter(Boolean);

    if (tokens.length > 0) {
        const titleText = "🆘 Потрібна допомога!";
        const messageText = "Терміново потрібна допомога на полях битв!";
        
        const payload = {
            data: { screen: 'GBG', title: titleText, body: messageText },
            android: { priority: "high", notification: { title: titleText, body: messageText, sound: "default", channel_id: "default" } },
            apns: { payload: { aps: { alert: { title: titleText, body: messageText }, sound: "default", 'content-available': 1 } } }
        };
        try { await admin.messaging().sendEachForMulticast({ tokens, ...payload }); } catch(e) { logger.error(e); }
    }
    return { success: true };
});