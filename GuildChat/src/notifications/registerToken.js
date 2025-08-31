import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ref, set } from 'firebase/database';

/**
 * 1) Просимо дозвіл на пуші й кешуємо FCM-токен у AsyncStorage.
 *    Викликайте це тільки ПІСЛЯ того, як показали користувачеві діалог
 *    і він натиснув «Allow».
 */
export async function requestFcmToken() {
  await messaging().requestPermission();
  const token = await messaging().getToken();
  await AsyncStorage.setItem('cachedFcmToken', token);
  return token; // може знадобитися одразу
}

/**
 * 2) Коли вже знаємо userId і під’єднану Firebase-DB,
 *    записуємо токен у Realtime DB → users/<uid>/fcmToken.
 *
 *    Викликайте ОДИН раз після реєстрації / вибору гільдії:
 *      await uploadFcmToken(uid, database);
 */
export async function uploadFcmToken(uid, database) {
  const token = await AsyncStorage.getItem('cachedFcmToken');
  if (!token) return; // ще не дали дозвіл — нічого робити
  await set(ref(database, `users/${uid}/fcmToken`), token);
  console.log('✅ FCM token saved for', uid);
}
