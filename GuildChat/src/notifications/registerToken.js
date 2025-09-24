import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, PermissionsAndroid } from 'react-native';
import { ref, set, get, update } from 'firebase/database';
import { database } from '../../firebaseConfig';

const INVALID_KEY_REGEX = /[.#$\[\]]/g;

const sanitizeTokenKey = token =>
  (token || '')
    .trim()
    .replace(INVALID_KEY_REGEX, '_');

async function removeTokenFromDatabase(uid, token, db = database) {
  if (!uid || !token) return;

  const sanitizedKey = sanitizeTokenKey(token);
  const updates = {
    [`users/${uid}/fcmTokens/${sanitizedKey}`]: null,
  };

  try {
    const legacySnapshot = await get(ref(db, `users/${uid}/fcmToken`));
    if (!legacySnapshot.exists() || legacySnapshot.val() === token) {
      updates[`users/${uid}/fcmToken`] = null;
    }
  } catch (error) {
    console.log('Не вдалося перевірити legacy FCM-токен:', error);
    updates[`users/${uid}/fcmToken`] = null;
  }

  try {
    await update(ref(db), updates);
  } catch (error) {
    console.log('Не вдалося видалити FCM-токен з бази даних:', error);
  }
}

async function clearCachedToken() {
  try {
    const previousToken = await AsyncStorage.getItem('cachedFcmToken');
    await AsyncStorage.removeItem('cachedFcmToken');

    if (!previousToken) return;

    const userId = await AsyncStorage.getItem('userId');
    if (userId) {
      await removeTokenFromDatabase(userId, previousToken, database);
    }
  } catch (error) {
    console.log('Не вдалося очистити кешований FCM-токен:', error);
  }
}

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
        await clearCachedToken();
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
              await clearCachedToken();
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
      await clearCachedToken();
      return null;
    }

    try {
      const token = await messaging().getToken();
      if (token) {
        await AsyncStorage.setItem('cachedFcmToken', token);
        try {
          const userId = await AsyncStorage.getItem('userId');
          if (userId) {
            await uploadFcmToken(userId, database, token);
          }
        } catch (syncError) {
          console.log('Не вдалося синхронізувати FCM-токен із сервером:', syncError);
        }
        return token; // може знадобитися одразу
      }
    } catch (tokenError) {
      console.log('Помилка отримання FCM-токена:', tokenError);
    }

    await clearCachedToken();
    return null;
  } catch (error) {
    console.log('Непередбачена помилка під час запиту FCM-токена:', error);
    await clearCachedToken();
    return null;
  }
}

/**
 * 2) Коли вже знаємо userId і під’єднану Firebase-DB,
 *    записуємо токен у Realtime DB → users/<uid>/fcmTokens/<tokenHash>.
 *    Легасі-поле users/<uid>/fcmToken зберігаємо для сумісності.
 *
 *    Викликайте ОДИН раз після реєстрації / вибору гільдії:
 *      await uploadFcmToken(uid, database);
 */
export async function uploadFcmToken(uid, db = database, tokenOverride) {
  const token = tokenOverride || (await AsyncStorage.getItem('cachedFcmToken'));
  if (!token) return false; // ще не дали дозвіл — нічого робити
  const sanitizedKey = sanitizeTokenKey(token);
  const tokenRef = ref(db, `users/${uid}/fcmTokens/${sanitizedKey}`);

  try {
    await set(tokenRef, {
      token,
      platform: Platform.OS,
      updatedAt: Date.now(),
    });
    await set(ref(db, `users/${uid}/fcmToken`), token);
    console.log('✅ FCM token saved for', uid);
    return true;
  } catch (error) {
    console.log('Не вдалося зберегти FCM-токен:', error);
    return false;
  }
}

messaging().onTokenRefresh(async newToken => {
  if (!newToken) return;

  try {
    const previousToken = await AsyncStorage.getItem('cachedFcmToken');
    await AsyncStorage.setItem('cachedFcmToken', newToken);
    const userId = await AsyncStorage.getItem('userId');
    if (userId) {
      if (previousToken && previousToken !== newToken) {
        await removeTokenFromDatabase(userId, previousToken, database);
      }
      await uploadFcmToken(userId, database, newToken);
    }
  } catch (error) {
    console.log('Помилка під час оновлення FCM-токена:', error);
  }
});
