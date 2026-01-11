import messaging from "@react-native-firebase/messaging";
import { AppRegistry, NativeModules } from "react-native";
import App from "./App";
import { name as appName } from "./app.json";

import { processWidgetRemoteMessage } from "./components/GBG/widgetCache";
import { refreshGbgWidgetCacheFromFirebase } from "./components/GBG/gbgWidgetRefresh";

AppRegistry.registerHeadlessTask("GbgWidgetRefreshTask", () => async () => {
  try {
    const bridge = NativeModules?.GbgWidgetBridge;
    let guildId = null;
    if (bridge && typeof bridge.getGuildId === "function") {
      try {
        guildId = await bridge.getGuildId();
      } catch (e) {}
    }
    await refreshGbgWidgetCacheFromFirebase({ guildId, reason: "periodic-worker" });
  } catch (e) {}
});

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
