// src/notifications/registerToken.js
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ref, set } from 'firebase/database';

const STORAGE_KEY = 'cachedFcmToken';

/**
 * 1) Просимо дозвіл і кешуємо «рідний» FCM/APNs push-token у AsyncStorage.
 *    Викликайте це тільки ПІСЛЯ того, як показали користувачеві діалог
 *    і він натиснув «Allow».
 */
export async function cacheFcmToken() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return null;

  const { data: token, type } = await Notifications.getDevicePushTokenAsync();
  if (!token) return null;

  if (type !== 'fcm') {
    console.warn(`Отримано push-token типу "${type}". Зберігаємо як є.`);
  }

  await AsyncStorage.setItem(STORAGE_KEY, token);
  await AsyncStorage.removeItem('cachedExpoToken'); // очищаємо застаріле значення
  return token;
}

/**
 * 2) Коли вже знаємо userId і під’єднану Firebase-DB,
 *    записуємо токен у Realtime DB → users/<uid>/fcmToken.
 *
 *    Викликайте ОДИН раз після реєстрації / вибору гільдії:
 *      await uploadFcmToken(uid, database);
 */
export async function uploadFcmToken(uid, database) {
  const token = await AsyncStorage.getItem(STORAGE_KEY);
  if (!token) return; // ще не дали дозвіл — нічого робити
  await set(ref(database, `users/${uid}/fcmToken`), token);
  console.log('✅ FCM token saved for', uid);
}
