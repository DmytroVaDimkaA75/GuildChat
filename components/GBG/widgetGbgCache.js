import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Ключі кешу віджета (AsyncStorage)
 */
export const WIDGET_GBG_MAP_PNG_URI_KEY = "widget_gbg_map_png_uri";
export const WIDGET_GBG_MAP_META_KEY = "widget_gbg_map_meta";
export const WIDGET_GBG_NEXT5_KEY = "widget_gbg_next5";
export const WIDGET_GBG_NEXT5_META_KEY = "widget_gbg_next5_meta";

/**
 * Безпечний JSON.parse
 * @param {any} v
 */
const safeParse = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};

/**
 * Прочитати кеш (для debug)
 */
export async function readWidgetCache() {
  const keys = [
    WIDGET_GBG_MAP_PNG_URI_KEY,
    WIDGET_GBG_MAP_META_KEY,
    WIDGET_GBG_NEXT5_KEY,
    WIDGET_GBG_NEXT5_META_KEY,
  ];

  const pairs = await AsyncStorage.multiGet(keys);
  const obj = {};
  pairs.forEach(([k, v]) => {
    obj[k] = safeParse(v);
  });
  return obj;
}

/**
 * Записати кеш карти (png uri + meta)
 * @param {{pngUri: string|null, meta: object}} args
 */
export async function writeWidgetMapCache({ pngUri, meta }) {
  const pairs = [
    [WIDGET_GBG_MAP_PNG_URI_KEY, pngUri ? String(pngUri) : "null"],
    [WIDGET_GBG_MAP_META_KEY, JSON.stringify(meta ?? null)],
  ];
  await AsyncStorage.multiSet(pairs);
}

/**
 * Записати кеш next5 (масив + meta)
 * @param {{items: Array, meta: object}} args
 */
export async function writeWidgetNext5Cache({ items, meta }) {
  const pairs = [
    [WIDGET_GBG_NEXT5_KEY, JSON.stringify(Array.isArray(items) ? items : [])],
    [WIDGET_GBG_NEXT5_META_KEY, JSON.stringify(meta ?? null)],
  ];
  await AsyncStorage.multiSet(pairs);
}
