import messaging from "@react-native-firebase/messaging";
import { AppRegistry } from "react-native";
import App from "./App";
import { name as appName } from "./app.json";
import { processWidgetRemoteMessage } from "./components/GBG/widgetCache";

messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  // ✅ Тут приймаємо data-only і оновлюємо кеш віджетів
  const handled = await processWidgetRemoteMessage(remoteMessage);

  // Якщо це не widget_* — просто нічого не робимо
  if (!handled) {
    // console.log("Background message (non-widget):", remoteMessage);
  }
});

AppRegistry.registerComponent(appName, () => App);
