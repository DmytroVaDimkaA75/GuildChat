import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeModules, Platform } from "react-native";
import { buildGbgMapSvgStringFromState, getDefaultMapKey } from "./gbgSvgBuilder";

const KEYS = {
  next5: "widget_gbg_next5",
  mapState: "widget_gbg_map_state",
  mapXml: "widget_gbg_map_xml",
  updatedAt: "widget_gbg_updated_at",
  lastFcm: "widget_gbg_last_fcm",
};

export const WIDGET_GBG_LAST_FCM_KEY = KEYS.lastFcm;

const getWidgetBridge = () => {
  return (
    NativeModules.GbgWidgetBridge ||
    NativeModules.WidgetBridge ||
    NativeModules.GBGWidgetBridge ||
    null
  );
};

export const requestWidgetRefresh = async () => {
  try {
    if (Platform.OS !== "android") return;
    const bridge = getWidgetBridge();
    if (!bridge) return;

    if (typeof bridge.refreshAll === "function") await bridge.refreshAll();
    else if (typeof bridge.requestUpdate === "function") await bridge.requestUpdate();
    else if (typeof bridge.refresh === "function") await bridge.refresh();
    else if (typeof bridge.update === "function") await bridge.update();
  } catch (e) {}
};

const setUpdatedAt = async () => {
  await AsyncStorage.setItem(KEYS.updatedAt, String(Date.now()));
};

export const writeNext5ToCache = async (list) => {
  const safe = Array.isArray(list) ? list : [];
  const json = JSON.stringify(safe);

  await AsyncStorage.setItem(KEYS.next5, json);
  await setUpdatedAt();

  // ✅ Пишемо і в SharedPreferences (щоб віджет бачив без AsyncStorage)
  try {
    const bridge = getWidgetBridge();
    if (bridge && typeof bridge.setNext5 === "function") {
      await bridge.setNext5(json);
    }
  } catch (e) {}

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

  // ✅ Легкий meta-json для віджета (стабільно, швидко)
  const meta = {
    mapKey: state.mapKey,
    updatedAt: Date.now(),
    sectorsCount: Object.keys(state.sectorColors || {}).length,
    staffCount: Object.values(state.sectorStaff || {}).filter(Boolean).length,
  };

  try {
    const bridge = getWidgetBridge();
    if (bridge && typeof bridge.setMapMeta === "function") {
      await bridge.setMapMeta(JSON.stringify(meta));
    }
    if (bridge && typeof bridge.setMapSvg === "function") {
      await bridge.setMapSvg(xml);
    }
  } catch (e) {}

  await requestWidgetRefresh();
};

export const readWidgetCacheDump = async () => {
  const entries = await AsyncStorage.multiGet([
    KEYS.updatedAt,
    KEYS.next5,
    KEYS.mapState,
    KEYS.mapXml,
    KEYS.lastFcm,
  ]);
  const map = Object.fromEntries(entries);

  let next5 = null;
  let mapState = null;
  let lastFcm = null;

  try { next5 = map[KEYS.next5] ? JSON.parse(map[KEYS.next5]) : null; } catch (e) {}
  try { mapState = map[KEYS.mapState] ? JSON.parse(map[KEYS.mapState]) : null; } catch (e) {}
  try { lastFcm = map[KEYS.lastFcm] ? JSON.parse(map[KEYS.lastFcm]) : null; } catch (e) {}

  const xml = map[KEYS.mapXml] || "";
  const xmlLen = xml.length;
  const xmlHead = xml ? xml.slice(0, 600) : "";

  return {
    updatedAt: map[KEYS.updatedAt] || null,
    next5,
    mapState,
    lastFcm,
    mapXml: { length: xmlLen, head: xmlHead },
  };
};

export const recordWidgetFcmReceipt = async ({ type, scope, data }) => {
  const payload = {
    type: type ? String(type) : "",
    scope: scope ? String(scope) : "",
    receivedAt: Date.now(),
    data: data && typeof data === "object" ? data : null,
  };

  await AsyncStorage.setItem(KEYS.lastFcm, JSON.stringify(payload));
};

/**
 * data-only FCM handler for widgets:
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
      await writeNext5ToCache(Array.isArray(payload) ? payload : []);
      return true;
    }

    if (kind === "widget_gbg_map_full") {
      await writeFullMapToCache(payload || {});
      return true;
    }

    return false;
  } catch (e) {
    return false;
  }
};
