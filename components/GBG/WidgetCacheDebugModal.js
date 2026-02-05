import React, { useEffect, useMemo, useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "@react-native-community/blur";

import {
  handleGbgWidgetMessage,
  WIDGET_GBG_MAP_PNG_URI_KEY,
  WIDGET_GBG_MAP_META_KEY,
  WIDGET_GBG_NEXT5_KEY,
  WIDGET_GBG_NEXT5_META_KEY,
} from "./widgetGbgPush";
import { WIDGET_GBG_LAST_FCM_KEY } from "./widgetCache";

/** ✅ Красивий друк JSON/строки */
const pretty = (value) => {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch (e) {
    return String(value);
  }
};

const safeParse = (raw, fallback) => {
  try {
    if (typeof raw !== "string") return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
};

const WidgetCacheDebugModal = ({
  visible,
  onClose,
  mapKey,
  onManualRefresh, // твій існуючий "Оновити" (png + next5 з Firebase)
}) => {
  const [cache, setCache] = useState({
    mapPngUri: null,
    mapMeta: null,
    next5: null,
    next5Meta: null,
    lastFcm: null,
  });

  const keys = useMemo(
    () => [
      WIDGET_GBG_MAP_PNG_URI_KEY,
      WIDGET_GBG_MAP_META_KEY,
      WIDGET_GBG_NEXT5_KEY,
      WIDGET_GBG_NEXT5_META_KEY,
      WIDGET_GBG_LAST_FCM_KEY,
    ],
    []
  );

  const readCache = async () => {
    const pairs = await AsyncStorage.multiGet(keys);
    const dict = {};
    pairs.forEach(([k, v]) => (dict[k] = v));

    setCache({
      mapPngUri: dict[WIDGET_GBG_MAP_PNG_URI_KEY] ?? null,
      mapMeta: safeParse(dict[WIDGET_GBG_MAP_META_KEY], null),
      next5: safeParse(dict[WIDGET_GBG_NEXT5_KEY], null),
      next5Meta: safeParse(dict[WIDGET_GBG_NEXT5_META_KEY], null),
      lastFcm: safeParse(dict[WIDGET_GBG_LAST_FCM_KEY], null),
    });
  };

  useEffect(() => {
    if (!visible) return;
    readCache().catch(() => {});
  }, [visible]);

  const simulateDataOnlyPush = async () => {
    // ✅ Робимо фейковий data-only payload як прийде з Firebase
    const fakeNext5 = [
      { sectorId: "B4G", openTime: Math.floor(Date.now() / 1000) + 900, army: "defense", bonusValue: 20, bonusReadyAt: 0 },
      { sectorId: "D3Z", openTime: Math.floor(Date.now() / 1000) + 1200, army: "attack", bonusValue: 20, bonusReadyAt: 0 },
      { sectorId: "D4D", openTime: Math.floor(Date.now() / 1000) + 1500, army: "defense", bonusValue: 20, bonusReadyAt: 0 },
      { sectorId: "A2S", openTime: Math.floor(Date.now() / 1000) + 1800, army: "attack", bonusValue: 20, bonusReadyAt: 0 },
      { sectorId: "C4C", openTime: Math.floor(Date.now() / 1000) + 2100, army: "defense", bonusValue: 20, bonusReadyAt: 0 },
    ];

    const remoteMessageLike = {
      data: {
        type: "gbg_widget_update",
        mapKey: mapKey || "volcanic_archipelago",
        next5: JSON.stringify(fakeNext5), // як в реальному data-only
      },
    };

    await handleGbgWidgetMessage(remoteMessageLike);
    await readCache();
  };

  const handleManualRefreshPress = async () => {
    if (typeof onManualRefresh === "function") {
      await onManualRefresh();
    }
    await readCache();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <BlurView style={StyleSheet.absoluteFill} blurType="dark" blurAmount={6} />

        <View style={styles.modal}>
          <Text style={styles.title}>Widget cache (AsyncStorage)</Text>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.key}>widget_gbg_map_png_uri:</Text>
            <Text style={styles.value}>{pretty(cache.mapPngUri)}</Text>

            <Text style={styles.key}>widget_gbg_map_meta:</Text>
            <Text style={styles.value}>{pretty(cache.mapMeta)}</Text>

            <Text style={styles.key}>widget_gbg_next5:</Text>
            <Text style={styles.value}>{pretty(cache.next5)}</Text>

            <Text style={styles.key}>widget_gbg_next5_meta:</Text>
            <Text style={styles.value}>{pretty(cache.next5Meta)}</Text>

            <Text style={styles.key}>widget_gbg_last_fcm:</Text>
            <Text style={styles.value}>{pretty(cache.lastFcm)}</Text>
          </ScrollView>

          <View style={styles.buttonsRow}>
            <TouchableOpacity style={styles.btnPrimary} onPress={handleManualRefreshPress}>
              <Text style={styles.btnText}>Оновити</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.btnSecondary} onPress={simulateDataOnlyPush}>
              <Text style={styles.btnText}>Тест data-only</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.btnClose} onPress={onClose}>
              <Text style={styles.btnText}>Закрити</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: "center", justifyContent: "center" },

  modal: {
    width: "88%",
    maxHeight: "70%",
    backgroundColor: "rgba(20,20,20,0.92)",
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },

  title: { fontSize: 22, fontWeight: "800", color: "#fff", textAlign: "center", marginBottom: 12 },

  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: 8 },

  key: { marginTop: 14, color: "#64b5f6", fontSize: 16, fontWeight: "700" },
  value: { marginTop: 6, color: "#eaeaea", fontSize: 14, fontFamily: "monospace" },

  buttonsRow: { marginTop: 14, flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 10 },

  btnPrimary: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#2e86de",
    borderRadius: 18,
    flexGrow: 1,
    alignItems: "center",
  },
  btnSecondary: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#3a3a3a",
    borderRadius: 18,
    flexGrow: 1,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  btnClose: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#2e86de",
    borderRadius: 18,
    flexGrow: 1,
    alignItems: "center",
  },

  btnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});

export default WidgetCacheDebugModal;
