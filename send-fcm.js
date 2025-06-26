const admin = require('firebase-admin');
const sa    = require('./fcm-service-account.json');   // ваш ключ

admin.initializeApp({ credential: admin.credential.cert(sa) });

// токен витягніть з RTDB або вставте вручну
const fcmToken =
  'e1gAZtyoSW2o18s2Lw.....';   // НЕ ExponentPushToken, а нативний!

admin.messaging().send({
  token: fcmToken,
  notification: {
    title: 'FCM v1 🎉',
    body : 'Привіт із GuildChat (без Expo service)!',
  },
})
.then(res => console.log('✅ FCM id', res))
.catch(err => console.error('⛔', err));