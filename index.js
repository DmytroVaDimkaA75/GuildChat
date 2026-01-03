import messaging from "@react-native-firebase/messaging";
import { AppRegistry } from "react-native";
import App from "./App";
import { name as appName } from "./app.json";

import { processWidgetRemoteMessage } from "./components/GBG/widgetCache";
import { refreshGbgWidgetCacheFromFirebase } from "./components/GBG/gbgWidgetRefresh";

messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  try {
    // 1) Якщо сервер прислав готові дані для віджетів
    const handled = await processWidgetRemoteMessage(remoteMessage);
    if (handled) return;

    // 2) Якщо сервер прислав лише тригер (підтягнути з Firebase)
    const data = remoteMessage?.data || {};
    if (String(data.type || "") === "gbg_refresh_widget") {
      await refreshGbgWidgetCacheFromFirebase({
        guildId: data.guildId ? String(data.guildId) : null,
        reason: "fcm-trigger",
        sectorId: data.sectorId ? String(data.sectorId) : "",
      });
    }
  } catch (e) {}
});

AppRegistry.registerComponent(appName, () => App);
