import messaging from '@react-native-firebase/messaging';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

import { syncGbgWidgetCacheFromFirebase } from './components/GBG/widgetCache';

// ✅ Фоновий handler має бути ТУТ (entry point), щоб працював у headless режимі
messaging().setBackgroundMessageHandler(async remoteMessage => {
  try {
    await syncGbgWidgetCacheFromFirebase(remoteMessage);
  } catch (e) {
    // не ламаємо запуск у фоні
  }
});

AppRegistry.registerComponent(appName, () => App);
