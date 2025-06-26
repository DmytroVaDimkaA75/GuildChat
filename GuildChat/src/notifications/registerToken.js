// src/notifications/registerToken.js
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ref, set } from 'firebase/database';
import { database } from '../../firebaseConfig';

/**
 * Просимо дозвіл та кешуємо Expo й FCM токени.
 * Повертає обʼєкт { expo, fcm } або null, якщо дозвіл не надано.
 */
export async function cacheExpoToken() {
  if (!Device.isDevice) return null;
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return null;

  const { data: expo } = await Notifications.getExpoPushTokenAsync({
    projectId: 'guildchat-5d8c1',
  });

  let fcm = null;
  try {
    const { data } = await Notifications.getDevicePushTokenAsync({ type: 'fcm' });
    fcm = data;
  } catch (_) {}

  const tokens = { expo, fcm };
  await AsyncStorage.setItem('cachedExpoToken', JSON.stringify(tokens));
  return tokens;
}

/**
 * Записує збережений токен у Firebase Realtime Database.
 * Викликайте після того, як отримали uid користувача.
 */
export async function uploadExpoToken(uid, db = database) {
  const saved = await AsyncStorage.getItem('cachedExpoToken');
  if (!saved) return;
  const tokens = JSON.parse(saved);
  await set(ref(db, `users/${uid}/pushTokens`), tokens);
  console.log('✅ push-tokens saved for', uid);
}
