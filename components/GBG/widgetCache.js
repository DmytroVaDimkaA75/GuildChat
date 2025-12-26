import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeModules } from "react-native";

const { GbgWidgetBridge } = NativeModules;

// ✅ Ключі — як у тебе в дебаг-вікні
const KEY_UPDATED_AT = "widget_gbg_updated_at";
const KEY_NEXT5 = "widget_gbg_next5";
const KEY_MAP_STATE = "widget_gbg_map_state";
const KEY_MAP_XML = "widget_gbg_map_xml";

// -------------------------
// helpers
// -------------------------
const nowMs = () => String(Date.now());

const safeJsonStringify = (obj) => {
  try {
    return JSON.stringify(obj);
  } catch (e) {
    return null;
  }
};

const safeJsonParse = (raw) => {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

const prefsSet = async (key, value) => {
  if (!GbgWidgetBridge?.setString) return;
  try {
    await GbgWidgetBridge.setString(key, value);
  } catch (e) {}
};

const prefsGet = async (key) => {
  if (!GbgWidgetBridge?.getString) return null;
  try {
    const v = await GbgWidgetBridge.getString(key);
    return v == null ? null : String(v);
  } catch (e) {
    return null;
  }
};

const requestWidgetUpdate = async () => {
  if (!GbgWidgetBridge?.requestWidgetUpdate) return;
  try {
    await GbgWidgetBridge.requestWidgetUpdate();
  } catch (e) {}
};

// -------------------------
// public API
// -------------------------
export const writeNext5ToCache = async (next5) => {
  const json = safeJsonStringify(Array.isArray(next5) ? next5 : []);
  if (!json) return;

  const updatedAt = nowMs();

  // 1) AsyncStorage (для додатка/дебага)
  await AsyncStorage.setItem(KEY_NEXT5, json);
  await AsyncStorage.setItem(KEY_UPDATED_AT, updatedAt);

  // 2) SharedPreferences (для віджета)
  await prefsSet(KEY_NEXT5, json);
  await prefsSet(KEY_UPDATED_AT, updatedAt);

  // 3) Форс-оновлення віджета
  await requestWidgetUpdate();
};

export const writeFullMapToCache = async ({ mapKey, sectorColors, sectorStaff, mapXml }) => {
  const mapState = {
    mapKey: mapKey || "volcanic_archipelago",
    sectorColors: sectorColors || {},
    sectorStaff: sectorStaff || {},
  };

  const mapStateJson = safeJsonStringify(mapState);
  if (!mapStateJson) return;

  const xml = typeof mapXml === "string" ? mapXml : "";
  const updatedAt = nowMs();

  // 1) AsyncStorage
  await AsyncStorage.setItem(KEY_MAP_STATE, mapStateJson);
  await AsyncStorage.setItem(KEY_MAP_XML, xml);
  await AsyncStorage.setItem(KEY_UPDATED_AT, updatedAt);

  // 2) SharedPreferences
  await prefsSet(KEY_MAP_STATE, mapStateJson);
  await prefsSet(KEY_MAP_XML, xml);
  await prefsSet(KEY_UPDATED_AT, updatedAt);

  // 3) Форс-оновлення віджета
  await requestWidgetUpdate();
};

export const readWidgetCacheDump = async () => {
  // AsyncStorage
  const [aUpdatedAt, aNext5, aMapState, aMapXml] = await Promise.all([
    AsyncStorage.getItem(KEY_UPDATED_AT),
    AsyncStorage.getItem(KEY_NEXT5),
    AsyncStorage.getItem(KEY_MAP_STATE),
    AsyncStorage.getItem(KEY_MAP_XML),
  ]);

  // SharedPrefs
  const [pUpdatedAt, pNext5, pMapState, pMapXml] = await Promise.all([
    prefsGet(KEY_UPDATED_AT),
    prefsGet(KEY_NEXT5),
    prefsGet(KEY_MAP_STATE),
    prefsGet(KEY_MAP_XML),
  ]);

  const asyncStorage = {
    updatedAt: aUpdatedAt || null,
    next5: safeJsonParse(aNext5),
    mapState: safeJsonParse(aMapState),
    mapXml: aMapXml ? { length: aMapXml.length, head: aMapXml.slice(0, 600) } : null,
  };

  const sharedPrefs = {
    updatedAt: pUpdatedAt || null,
    next5: safeJsonParse(pNext5),
    mapState: safeJsonParse(pMapState),
    mapXml: pMapXml ? { length: pMapXml.length, head: pMapXml.slice(0, 600) } : null,
  };

  // ✅ щоб твій існуючий UI не ламати — вертаємо старі поля теж
  return {
    updatedAt: asyncStorage.updatedAt,
    next5: asyncStorage.next5,
    mapState: asyncStorage.mapState,
    mapXml: asyncStorage.mapXml,
    sharedPrefs, // додатково: для перевірки, що віджет бачить ті ж дані
  };
};
