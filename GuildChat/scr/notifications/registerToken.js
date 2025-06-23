// src/notifications/registerToken.js
import * as Notifications from 'expo-notifications';
import AsyncStorage        from '@react-native-async-storage/async-storage';
import { ref, set }        from 'firebase/database';

/**
 * 1) Просимо дозвіл і кешуємо Expo push-token у AsyncStorage.
 *    Викликайте це тільки ПІСЛЯ того, як показали користувачеві діалог
 *    і він натиснув «Allow».
 */
export async function cacheExpoToken() {
  const { data: token } = await Notifications.getExpoPushTokenAsync({
    projectId: 'guildchat-5d8c1',          // ваш projectId
  });
  await AsyncStorage.setItem('cachedExpoToken', token);
  return token;                            // може знадобитися одразу
}

/**
 * 2) Коли вже знаємо userId і під’єднану Firebase-DB,
 *    записуємо токен у Realtime DB → users/<uid>/fcmToken.
 *
 *    Викликайте ОДИН раз після реєстрації / вибору гільдії:
 *      await uploadExpoToken(uid, database);
 */
export async function uploadExpoToken(uid, database) {
  const token = await AsyncStorage.getItem('cachedExpoToken');
  if (!token) return;                      // ще не дали дозвіл — нічого робити
  await set(ref(database, `users/${uid}/fcmToken`), token);
  console.log('✅ push-token saved for', uid);
}
