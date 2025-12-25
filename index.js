import messaging from '@react-native-firebase/messaging';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

// ✅ Background handler має бути ТІЛЬКИ тут (в entry file)
messaging().setBackgroundMessageHandler(async remoteMessage => {
  try {
    // Тут буде твоя логіка оновлення кешу/віджетів по data-only пушу
    // (поки просто лог для перевірки)
    console.log('Message handled in the background!', remoteMessage?.data || {});
  } catch (e) {
    console.log('Background handler error:', e?.message || String(e));
  }
});

AppRegistry.registerComponent(appName, () => App);
