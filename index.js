import 'expo/build/Expo.fx';

import messaging from '@react-native-firebase/messaging';
import { AppRegistry, Platform } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

// ✅ Реєструємо handler віджетів максимально рано, але без ризику завалити старт
if (Platform.OS === 'android') {
  try {
    const { registerWidgetTaskHandler } = require('react-native-android-widget');
    const widgetTaskHandler = require('./widgetTaskHandler').default;

    if (typeof registerWidgetTaskHandler === 'function') {
      registerWidgetTaskHandler(widgetTaskHandler);
    }
  } catch (e) {
    // Не валимо старт застосунку через віджети
  }
}

messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('Message handled in the background!', remoteMessage);
});

AppRegistry.registerComponent(appName, () => App);
