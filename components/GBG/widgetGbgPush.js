import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging from '@react-native-firebase/messaging';
import { NativeModules, Platform } from 'react-native';

// ===== AsyncStorage keys (як у твоєму debug-вікні) =====
export const WIDGET_GBG_MAP_PNG_URI_KEY = 'widget_gbg_map_png_uri';
export const WIDGET_GBG_MAP_META_KEY = 'widget_gbg_map_meta';

export const WIDGET_GBG_NEXT5_KEY = 'widget_gbg_next5';
export const WIDGET_GBG_NEXT5_META_KEY = 'widget_gbg_next5_meta';

// ✅ Безпечний JSON parse
const safeJsonParse = (value, fallback) => {
  try {
    if (typeof value !== 'string') return fallback;
    return JSON.parse(value);
  } catch (e) {
    return fallback;
  }
};

// (Опційно) тригер оновлення нативного віджета, якщо у тебе є нативний модуль.
// Якщо модуля нема — просто no-op без помилок.
const tryTriggerNativeWidgetRefresh = async () => {
  try {
    if (Platform.OS !== 'android') return;

    // Назву модуля підставиш, якщо він у тебе існує.
    // Напр.: NativeModules.GbgWidgetUpdater?.refreshAll()
    const mod = NativeModules?.GbgWidgetUpdater;
    if (mod && typeof mod.refreshAll === 'function') {
      await mod.refreshAll();
    }
  } catch (e) {
    // нічого
  }
};

/**
 * ✅ Обробник data-only пуша для віджета.
 * Очікуємо payload:
 * remoteMessage.data = {
 *   type: "gbg_widget_update",
 *   mapKey: "volcanic_archipelago",
 *   next5: "[{...},{...}]"   // JSON-string
 *   // опційно:
 *   mapPngUri: "file://...",
 * }
 */
export const handleGbgWidgetMessage = async (remoteMessage) => {
  const data = remoteMessage?.data || {};
  const type = String(data.type || '');

  if (type !== 'gbg_widget_update') return;

  const mapKey = data.mapKey ? String(data.mapKey) : null;

  // next5 може прилетіти як JSON-string
  const next5Raw = data.next5;
  const next5 = Array.isArray(next5Raw)
    ? next5Raw
    : safeJsonParse(next5Raw, []);

  // map png (опційно — якщо ти колись будеш пушити шлях/оновлювати його сервером)
  const mapPngUri = data.mapPngUri ? String(data.mapPngUri) : null;

  const updatedAt = Date.now();

  // ✅ Записуємо next5
  await AsyncStorage.setItem(WIDGET_GBG_NEXT5_KEY, JSON.stringify(next5));

  // ✅ meta для next5
  await AsyncStorage.setItem(
    WIDGET_GBG_NEXT5_META_KEY,
    JSON.stringify({
      updatedAt,
      mapKey: mapKey || null,
      count: Array.isArray(next5) ? next5.length : 0,
    })
  );

  // ✅ Якщо прилетів png uri — збережемо
  if (mapPngUri) {
    await AsyncStorage.setItem(WIDGET_GBG_MAP_PNG_URI_KEY, mapPngUri);
    await AsyncStorage.setItem(
      WIDGET_GBG_MAP_META_KEY,
      JSON.stringify({
        updatedAt,
        mapKey: mapKey || null,
        pngError: null,
      })
    );
  }

  // ✅ Спроба оновити нативний віджет (якщо є модуль)
  await tryTriggerNativeWidgetRefresh();
};

/**
 * ✅ Реєстрація background handler (викликається з index.js)
 */
export const registerGbgWidgetBackgroundHandler = () => {
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    // ВАЖЛИВО: тут НЕ показуємо нотифікації — тільки оновлюємо кеш
    await handleGbgWidgetMessage(remoteMessage);
  });
};
