import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeModules } from "react-native";
import { buildGbgMapSvgStringFromState, getDefaultMapKey } from "./gbgSvgBuilder";

const KEYS = {
  next5: "widget_gbg_next5",
  mapState: "widget_gbg_map_state",
  mapXml: "widget_gbg_map_xml",
  updatedAt: "widget_gbg_updated_at",
};

const getWidgetBridge = () => {
  // Якщо у тебе вже є нативний модуль для оновлення віджета — він підхопиться тут.
  return (
    NativeModules.GbgWidgetBridge ||
    NativeModules.WidgetBridge ||
    NativeModules.GBGWidgetBridge ||
    null
  );
};

export const requestWidgetRefresh = async () => {
  try {
    const bridge = getWidgetBridge();
    if (!bridge) return;

    // Під різні назви методів (підхопимо те, що існує)
    if (typeof bridge.requestUpdate === "function") await bridge.requestUpdate();
    else if (typeof bridge.refresh === "function") await bridge.refresh();
    else if (typeof bridge.update === "function") await bridge.update();
  } catch (e) {
    // Тихо ігноруємо — це не критично
  }
};

const setUpdatedAt = async () => {
  await AsyncStorage.setItem(KEYS.updatedAt, String(Date.now()));
};

export const writeNext5ToCache = async (list) => {
  const safe = Array.isArray(list) ? list : [];
  await AsyncStorage.setItem(KEYS.next5, JSON.stringify(safe));
  await setUpdatedAt();
  await requestWidgetRefresh();
};

export const writeFullMapToCache = async ({ mapKey, sectorColors, sectorStaff }) => {
  const state = {
    mapKey: mapKey || getDefaultMapKey(),
    sectorColors: sectorColors && typeof sectorColors === "object" ? sectorColors : {},
    sectorStaff: sectorStaff && typeof sectorStaff === "object" ? sectorStaff : {},
  };

  const xml = buildGbgMapSvgStringFromState({
    mapKey: state.mapKey,
    sectorColors: state.sectorColors,
    sectorStaff: state.sectorStaff,
  });

  await AsyncStorage.setItem(KEYS.mapState, JSON.stringify(state));
  await AsyncStorage.setItem(KEYS.mapXml, xml);
  await setUpdatedAt();
  await requestWidgetRefresh();
};

export const readWidgetCacheDump = async () => {
  const entries = await AsyncStorage.multiGet([KEYS.updatedAt, KEYS.next5, KEYS.mapState, KEYS.mapXml]);
  const map = Object.fromEntries(entries);

  let next5 = null;
  let mapState = null;

  try { next5 = map[KEYS.next5] ? JSON.parse(map[KEYS.next5]) : null; } catch (e) {}
  try { mapState = map[KEYS.mapState] ? JSON.parse(map[KEYS.mapState]) : null; } catch (e) {}

  const xml = map[KEYS.mapXml] || "";
  const xmlLen = xml.length;
  const xmlHead = xml ? xml.slice(0, 600) : "";

  return {
    updatedAt: map[KEYS.updatedAt] || null,
    next5,
    mapState,
    mapXml: { length: xmlLen, head: xmlHead },
  };
};

/**
 * Обробник data-only FCM для віджетів.
 * Очікуваний формат:
 * remoteMessage.data.kind = 'widget_gbg_next5' | 'widget_gbg_map_full'
 * remoteMessage.data.payload = JSON.stringify(...)
 */
export const processWidgetRemoteMessage = async (remoteMessage) => {
  try {
    const data = remoteMessage?.data || {};
    const kind = String(data.kind || data.type || "").trim();

    if (!kind.startsWith("widget_")) return false;

    const payloadRaw = data.payload || data.json || "";
    let payload = null;
    try { payload = payloadRaw ? JSON.parse(payloadRaw) : null; } catch (e) { payload = null; }

    if (kind === "widget_gbg_next5") {
      // payload: [{sectorId, openTime, army, bonusValue, bonusReadyAt}, ...]
      await writeNext5ToCache(Array.isArray(payload) ? payload : []);
      return true;
    }

    if (kind === "widget_gbg_map_full") {
      // payload: { mapKey, sectorColors, sectorStaff }
      await writeFullMapToCache(payload || {});
      return true;
    }

    return false;
  } catch (e) {
    return false;
  }
};
