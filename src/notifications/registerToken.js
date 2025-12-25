import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import messaging from '@react-native-firebase/messaging';

export async function cachePushToken() {
  try {
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (enabled) {
      console.log('Authorization status:', authStatus);
      const token = await messaging().getToken();
      console.log('FCM Token obtained:', token);
      await AsyncStorage.setItem('cachedFCMToken', token);
      return token;
    } else {
      console.log('User did not grant permission for notifications.');
      return null;
    }
  } catch (error) {
    console.error("Error getting/caching FCM token:", error);
    return null;
  }
}

export async function uploadPushToken(uid) {
  try {
    let token = await AsyncStorage.getItem('cachedFCMToken');
    if (!token) {
      console.log('No cached FCM token found. Requesting permission and fetching a new one...');
      token = await cachePushToken();
    }

    if (!token) {
      console.log('Unable to obtain an FCM token. Cannot upload.');
      return; 
    }
    
    const tokenRef = database().ref(`users/${uid}/fcmToken`);
    await tokenRef.set(token);
    
    console.log('✅ push-token saved to Firebase for user:', uid);
  } catch (error) {
    console.error("Error uploading FCM token to Firebase:", error);
  }
}
