import messaging from '@react-native-firebase/messaging';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { registerGbgWidgetBackgroundHandler } from './components/GBG/widgetGbgPush';

// ✅ Background handler має бути оголошений ОДИН раз — тут, в entry-файлі
registerGbgWidgetBackgroundHandler();

AppRegistry.registerComponent(appName, () => App);
