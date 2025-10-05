// src/notifications/registerToken.js
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { ref, set } from 'firebase/database';

const STORAGE_KEY = 'cachedFcmToken';

/**
 * 1) Просимо дозвіл і кешуємо «рідний» FCM push-token у AsyncStorage.
 *    Викликайте це тільки ПІСЛЯ того, як показали користувачеві діалог
 *    і він натиснув «Allow».
 */
export async function cacheFcmToken() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId ||
    Constants.manifest?.extra?.eas?.projectId ||
    process.env.EXPO_PROJECT_ID ||
    null;

  const { data: token, type } = await Notifications.getDevicePushTokenAsync(
    projectId ? { projectId } : undefined,
  );

  if (!token) return null;

  if (type !== 'fcm') {
    console.warn(
      `Отримано push-token типу "${type}". Очікувався тип "fcm" — не зберігаємо.`,
    );
    return null;
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
