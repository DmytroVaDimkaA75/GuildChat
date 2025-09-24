import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, PermissionsAndroid } from 'react-native';
import { ref, set } from 'firebase/database';
import { database } from '../../firebaseConfig';

/**
 * 1) Просимо дозвіл на пуші й кешуємо FCM-токен у AsyncStorage.
 *    Викликайте це тільки ПІСЛЯ того, як показали користувачеві діалог
 *    і він натиснув «Allow».
 */
export async function requestFcmToken() {
  try {
    if (Platform.OS === 'ios') {
      try {
        await messaging().registerDeviceForRemoteMessages();
      } catch (error) {
        console.log('Не вдалося зареєструвати iOS-пристрій для віддалених повідомлень:', error);
        await AsyncStorage.removeItem('cachedFcmToken');
        return null;
      }
    }

    if (Platform.OS === 'android') {
      const androidVersion = Number.parseInt(Platform.Version, 10);
      if (!Number.isNaN(androidVersion) && androidVersion >= 33) {
        const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
        if (permission) {
          const alreadyGranted = await PermissionsAndroid.check(permission);
          if (!alreadyGranted) {
            const result = await PermissionsAndroid.request(permission);
            if (result !== PermissionsAndroid.RESULTS.GRANTED) {
              console.log('Користувач не надав дозвіл POST_NOTIFICATIONS.');
              await AsyncStorage.removeItem('cachedFcmToken');
              return null;
            }
          }
        }
      }
    }

    const authorizationStatus = await messaging().requestPermission();
    const isAuthorized =
      authorizationStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authorizationStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (!isAuthorized) {
      console.log('Користувач не дозволив push-сповіщення.');
      await AsyncStorage.removeItem('cachedFcmToken');
      return null;
    }

    try {
      const token = await messaging().getToken();
      if (token) {
        await AsyncStorage.setItem('cachedFcmToken', token);
                try {
          const userId = await AsyncStorage.getItem('userId');
          if (userId) {
            await uploadFcmToken(userId);
          }
        } catch (syncError) {
          console.log('Не вдалося синхронізувати FCM-токен із сервером:', syncError);
        }
        return token; // може знадобитися одразу
      }
    } catch (tokenError) {
      console.log('Помилка отримання FCM-токена:', tokenError);
    }

    await AsyncStorage.removeItem('cachedFcmToken');
    return null;
  } catch (error) {
    console.log('Непередбачена помилка під час запиту FCM-токена:', error);
    await AsyncStorage.removeItem('cachedFcmToken');
    return null;
  }
}

/**
 * 2) Коли вже знаємо userId і під’єднану Firebase-DB,
 *    записуємо токен у Realtime DB → users/<uid>/fcmToken.
 *
 *    Викликайте ОДИН раз після реєстрації / вибору гільдії:
 *      await uploadFcmToken(uid, database);
 */
export async function uploadFcmToken(uid, db = database) {
  const token = await AsyncStorage.getItem('cachedFcmToken');
  if (!token) return false; // ще не дали дозвіл — нічого робити
  await set(ref(db, `users/${uid}/fcmToken`), token);
  console.log('✅ FCM token saved for', uid);
  return true;
}

messaging().onTokenRefresh(async newToken => {
  if (!newToken) return;

  try {
    await AsyncStorage.setItem('cachedFcmToken', newToken);
    const userId = await AsyncStorage.getItem('userId');
    if (userId) {
      await uploadFcmToken(userId, database);
    }
  } catch (error) {
    console.log('Помилка під час оновлення FCM-токена:', error);
  }
});
