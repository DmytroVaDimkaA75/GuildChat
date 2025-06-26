// src/notifications/registerToken.js
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { ref, set } from 'firebase/database';
import { database } from '../../firebaseConfig';

export async function registerFcmToken(uid) {
  if (!Device.isDevice) return;

  // права
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;

  // 1. Expo-токен (про всяк випадок)
  const { data: expoToken } = await Notifications.getExpoPushTokenAsync({
    projectId: 'guildchat-5d8c1',
  });

  // 2. Нативний FCM-токен
  const { data: fcmToken } =
        await Notifications.getDevicePushTokenAsync({ type: 'fcm' });

  // 3. Пишемо обидва
  await set(ref(database, `users/${uid}/pushTokens`), {
    expo: expoToken,
    fcm : fcmToken,
  });
  console.log('✅ tokens saved', { expoToken, fcmToken });
}
