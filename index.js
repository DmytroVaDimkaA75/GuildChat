import messaging from '@react-native-firebase/messaging';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { handleGbgWidgetMessage } from './components/GBG/widgetGbgPush';
import { processWidgetRemoteMessage } from './components/GBG/widgetCache';
import { refreshGbgWidgetCacheFromFirebase } from './components/GBG/gbgWidgetRefresh';

// ✅ Background handler має бути ТІЛЬКИ тут (в entry file)
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  try {
    const handledPush = await handleGbgWidgetMessage(remoteMessage);
    const handledCache = await processWidgetRemoteMessage(remoteMessage);

    const kind = String(remoteMessage?.data?.kind || remoteMessage?.data?.type || '').trim();
    if (!handledPush && !handledCache && kind === 'widget_gbg_refresh') {
      // Повний рефреш з Firebase, навіть якщо апка не відкрита
      await refreshGbgWidgetCacheFromFirebase({ reason: 'push_refresh' });
    }
  } catch (e) {
    console.log('Background handler error:', e?.message || String(e));
  }
});

AppRegistry.registerComponent(appName, () => App);
