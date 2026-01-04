import messaging from '@react-native-firebase/messaging';
import { Alert } from 'react-native';

const requestUserPermission = async () => {
  const authStatus = await messaging().requestPermission();
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;

  if (enabled) {
    console.log('Authorization status:', authStatus);
    getFCMToken();
  }
};

const getFCMToken = async () => {
  try {
    const token = await messaging().getToken();
    console.log('FCM Token:', token);
    return token;
  } catch (error) {
    console.error('Error getting FCM token:', error);
  }
};

const resolveNotificationContent = (remoteMessage) => {
  const notificationTitle = remoteMessage?.notification?.title;
  const notificationBody = remoteMessage?.notification?.body;

  const dataTitle = remoteMessage?.data?.title;
  const dataBody = remoteMessage?.data?.body;

  const title = notificationTitle || dataTitle || "";
  const body = notificationBody || dataBody || "";

  return { title, body };
};

const initializeForegroundListener = () => {
  const unsubscribe = messaging().onMessage(async remoteMessage => {
    console.log('A new FCM message arrived!', JSON.stringify(remoteMessage));

    const { title, body } = resolveNotificationContent(remoteMessage);
    if (!title && !body) return;

    Alert.alert(title, body);
  });

  return unsubscribe;
};

export const pushNotificationManager = {
  requestUserPermission,
  getFCMToken,
  initializeForegroundListener,
};
