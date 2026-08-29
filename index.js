import AsyncStorage from "@react-native-async-storage/async-storage";
import messaging from "@react-native-firebase/messaging";
import notifee, { EventType } from "@notifee/react-native";
import { registerRootComponent } from "expo";
import { AppRegistry, NativeModules } from "react-native";
import App from "./App";

import { processWidgetRemoteMessage, recordWidgetFcmReceipt } from "./components/GBG/widgetCache";
import { refreshGbgWidgetCacheFromFirebase } from "./components/GBG/gbgWidgetRefresh";
import {
  normalizeNotificationRoute,
  savePendingNotificationRoute,
} from "./src/notifications/notificationRouting";

const normalizeGuildId = (value) => String(value || "").trim();

const getPersistedWidgetGuildId = async () => {
  const bridge = NativeModules?.GbgWidgetBridge;
  if (!bridge || typeof bridge.getGuildId !== "function") return "";

  try {
    return normalizeGuildId(await bridge.getGuildId());
  } catch (_error) {
    return "";
  }
};

const enqueueNativeWidgetRefresh = async () => {
  const bridge = NativeModules?.GbgWidgetBridge;
  if (!bridge || typeof bridge.enqueueRefresh !== "function") return false;

  try {
    await bridge.enqueueRefresh();
    return true;
  } catch (_error) {
    return false;
  }
};

const getRemoteMessageGuildId = (data) => {
  const directGuildId = normalizeGuildId(data?.guildId);
  if (directGuildId) return directGuildId;

  const payloadRaw = data?.payload || data?.json;
  if (!payloadRaw) return "";

  try {
    const payload =
      typeof payloadRaw === "string" ? JSON.parse(payloadRaw) : payloadRaw;
    return normalizeGuildId(payload?.guildId);
  } catch (_error) {
    return "";
  }
};

const resolveWidgetMessageTarget = async (data) => {
  const persistedGuildId = await getPersistedWidgetGuildId();
  const messageGuildId = getRemoteMessageGuildId(data);

  if (!persistedGuildId) {
    return { allowed: false, guildId: null };
  }

  if (
    messageGuildId &&
    persistedGuildId !== messageGuildId
  ) {
    return { allowed: false, guildId: persistedGuildId };
  }

  return {
    allowed: true,
    guildId: persistedGuildId,
  };
};

notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type !== EventType.PRESS && type !== EventType.ACTION_PRESS) return;
  if (!await AsyncStorage.getItem("userId")) return;

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
    const [userId, persistedGuildId] = await Promise.all([
      AsyncStorage.getItem("userId"),
      getPersistedWidgetGuildId(),
    ]);
    if (!userId || !persistedGuildId) return;
    const guildId = persistedGuildId;
    await refreshGbgWidgetCacheFromFirebase({ guildId, reason: "periodic-worker" });
  } catch (_error) {}
});

messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  try {
    if (!await AsyncStorage.getItem("userId")) return;

    const data = remoteMessage?.data || {};
    const recordType = String(data.kind || data.type || "");
    const isWidgetMessage =
      recordType.startsWith("widget_") || recordType === "gbg_widget_refresh";
    const widgetTarget = isWidgetMessage
      ? await resolveWidgetMessageTarget(data)
      : { allowed: true, guildId: null };
    if (!widgetTarget.allowed) return;

    if (recordType) {
      await recordWidgetFcmReceipt({ type: recordType, scope: "background", data });
    }

    // 1) Якщо сервер прислав готові дані для віджетів
    const handled = await processWidgetRemoteMessage(remoteMessage);
    if (handled) return;

    // 2) Якщо сервер прислав лише тригер (підтягнути з Firebase)
    const messageType = String(data.type || "");
    if (messageType === "gbg_widget_refresh") {
      const enqueuedNatively = await enqueueNativeWidgetRefresh();
      if (!enqueuedNatively) {
        await refreshGbgWidgetCacheFromFirebase({
          guildId: widgetTarget.guildId,
          reason: "fcm-trigger",
          sectorId: data.sectorId ? String(data.sectorId) : "",
        });
      }
    }
  } catch (_error) {}
});

registerRootComponent(App);
