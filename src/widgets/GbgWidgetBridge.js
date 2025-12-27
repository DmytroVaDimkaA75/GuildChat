import { NativeModules } from 'react-native';

const { GbgWidgetBridge } = NativeModules;

const KEYS = ['widget_gbg_next5', 'widget_gbg_map_state', 'widget_gbg_map_xml'];

export async function setWidgetCache(key, value) {
  if (!GbgWidgetBridge?.setCache) return false;
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  return await GbgWidgetBridge.setCache(key, str);
}

export async function updateAllWidgets() {
  if (!GbgWidgetBridge?.updateAllWidgets) return false;
  return await GbgWidgetBridge.updateAllWidgets();
}

export async function handleWidgetPush(remoteMessage) {
  try {
    const data = remoteMessage?.data || {};
    let changed = false;

    for (const k of KEYS) {
      if (typeof data[k] === 'string' && data[k].length) {
        await setWidgetCache(k, data[k]);
        changed = true;
      }
    }

    if (changed) {
      await updateAllWidgets();
    }
  } catch (e) {
    // навмисно мовчимо — фонова задача не має валити процес
  }
}
