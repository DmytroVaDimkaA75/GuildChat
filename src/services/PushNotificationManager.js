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

const initializeForegroundListener = () => {
  const unsubscribe = messaging().onMessage(async remoteMessage => {
    console.log('A new FCM message arrived!', JSON.stringify(remoteMessage));
    Alert.alert(
      remoteMessage.notification.title,
      remoteMessage.notification.body
    );
  });

  return unsubscribe;
};

export const pushNotificationManager = {
  requestUserPermission,
  getFCMToken,
  initializeForegroundListener,
};