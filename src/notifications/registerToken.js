import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import messaging from '@react-native-firebase/messaging';

const CACHED_FCM_TOKEN_KEY = 'cachedFCMToken';

async function ensureDeviceRegistration() {
  try {
    await messaging().registerDeviceForRemoteMessages();
  } catch (error) {
    console.error('Не вдалося зареєструвати пристрій для віддалених повідомлень:', error);
  }
}

async function ensureNotificationPermission() {
  try {
    const currentStatus = await messaging().hasPermission?.();
    const isAuthorized =
      currentStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      currentStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (isAuthorized) {
      return true;
    }

    const requestedStatus = await messaging().requestPermission();
    return (
      requestedStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      requestedStatus === messaging.AuthorizationStatus.PROVISIONAL
    );
  } catch (error) {
    console.error('Не вдалося отримати дозвіл на сповіщення:', error);
    return false;
  }
}

export async function cachePushToken() {
  try {
    await ensureDeviceRegistration();

    const permissionGranted = await ensureNotificationPermission();
    if (!permissionGranted) {
      console.log('Користувач не надав дозвіл на отримання push-сповіщень.');
      return null;
    }

    const token = await messaging().getToken();
    if (!token) {
      console.log('Firebase не повернув FCM токен.');
      return null;
    }

    await AsyncStorage.setItem(CACHED_FCM_TOKEN_KEY, token);
    console.log('FCM токен отримано та кешовано.');
    return token;
  } catch (error) {
    console.error('Помилка під час отримання/кешування FCM токена:', error);
    return null;
  }
}

export async function uploadPushToken(uid, providedToken) {
  if (!uid) {
    console.log('Не вдалося завантажити FCM токен: відсутній uid користувача.');
    return null;
  }

  try {
    let token = providedToken;

    if (!token) {
      token = await AsyncStorage.getItem(CACHED_FCM_TOKEN_KEY);
    }

    if (!token) {
      console.log('Кешований FCM токен відсутній. Спроба оновити токен...');
      token = await cachePushToken();
    }

    if (!token) {
      console.log('FCM токен недоступний. Завантаження пропущено.');
      return null;
    }

    const tokenRef = database().ref(`users/${uid}/fcmToken`);
    await tokenRef.set(token);
    console.log('✅ Push-токен збережено у Firebase для користувача:', uid);
    return token;
  } catch (error) {
    console.error('Помилка під час завантаження FCM токена до Firebase:', error);
    return null;
  }
}

export async function getCachedPushToken() {
  try {
    return await AsyncStorage.getItem(CACHED_FCM_TOKEN_KEY);
  } catch (error) {
    console.error('Не вдалося отримати кешований FCM токен:', error);
    return null;
  }
}
