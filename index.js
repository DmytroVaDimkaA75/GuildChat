import messaging from "@react-native-firebase/messaging";
import notifee, { EventType } from "@notifee/react-native";
import { AppRegistry, NativeModules } from "react-native";
import App from "./App";
import { name as appName } from "./app.json";

import { processWidgetRemoteMessage, recordWidgetFcmReceipt } from "./components/GBG/widgetCache";
import { refreshGbgWidgetCacheFromFirebase } from "./components/GBG/gbgWidgetRefresh";
import {
  normalizeNotificationRoute,
  savePendingNotificationRoute,
} from "./src/notifications/notificationRouting";

notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type !== EventType.PRESS && type !== EventType.ACTION_PRESS) return;

  const notification = detail?.notification;
  const route = normalizeNotificationRoute({
    ...(notification?.data || {}),
    notificationEventId:
      notification?.data?.notificationEventId ||
      notification?.id ||
      "",
  });
  if (route) {
    await savePendingNotificationRoute(route);
  }
});

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
    const data = remoteMessage?.data || {};
    const recordType = String(data.kind || data.type || "");
    if (recordType) {
      await recordWidgetFcmReceipt({ type: recordType, scope: "background", data });
    }

    // 1) Якщо сервер прислав готові дані для віджетів
    const handled = await processWidgetRemoteMessage(remoteMessage);
    if (handled) return;

    // 2) Якщо сервер прислав лише тригер (підтягнути з Firebase)
    const messageType = String(data.type || "");
    if (messageType === "gbg_widget_refresh") {
      await refreshGbgWidgetCacheFromFirebase({
        guildId: data.guildId ? String(data.guildId) : null,
        reason: "fcm-trigger",
        sectorId: data.sectorId ? String(data.sectorId) : "",
      });
    }
  } catch (e) {}
});

AppRegistry.registerComponent(appName, () => App);
