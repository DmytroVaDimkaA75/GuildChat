// components/FoeSync/FoeSyncScreen.js
//
// Екран "Синхронізація з грою" в меню — лише ПЕРЕГЛЯД зібраних даних.
// Саме вікно гри й слухач живуть у FoeSyncProvider (фон), тут їх немає.
// Керування синхронізацією (згода / вхід) — у блоці профілю.

import React, { useCallback, useMemo, useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { DarkThemeColors as C } from '../../constants/theme';
import { useFoeSync } from './FoeSyncProvider';
import FoeCityMap from './FoeCityMap';
import FoeLoadingRing from './FoeLoadingRing';
import { computeCombat } from './foeBonuses';
import FoeCollectionPanel from './FoeCollectionPanel';
import { FOE_CONSENT_BODY, FOE_CONSENT_BULLETS, FOE_CONSENT_NOTE } from './foeConsent';

const RES_LABELS = {
  money: 'Монети',
  supplies: 'Припаси',
  medals: 'Медалі',
  premium: 'Діаманти',
  strategy_points: 'Очки Форджа (ВП)',
  total_battlepoints: 'Бойові бали',
  clan_power: 'Сила гільдії',
};
const PROD_MULT_BY_RES = { money: 'coin_production', supplies: 'supply_production' };
const GOODS_BOOST_KEY = 'goods_production';

function applyMultiplier(map, sumsAll) {
  const out = {};
  for (const [res, amt] of Object.entries(map)) {
    let pct = 0;
    if (PROD_MULT_BY_RES[res]) pct = Number(sumsAll[PROD_MULT_BY_RES[res]]) || 0;
    else if (!RES_LABELS[res]) pct = Number(sumsAll[GOODS_BOOST_KEY]) || 0;
    out[res] = pct ? Math.floor(amt * (1 + pct / 100)) : amt;
  }
  return out;
}
function computeCollection(buildings, sumsAll) {
  const readyBase = {};
  const pendingBase = {};
  for (const b of buildings || []) {
    const det = b.det || {};
    const target = b.ready ? readyBase : pendingBase;
    for (const [k, v] of Object.entries(det)) target[k] = (target[k] || 0) + v;
  }
  return {
    ready: applyMultiplier(readyBase, sumsAll || {}),
    pending: applyMultiplier(pendingBase, sumsAll || {}),
  };
}
function resourceRows(map, resDefs) {
  const entries = Object.entries(map || {}).filter(([, v]) => v);
  const name = (k) => resDefs?.[k]?.name || RES_LABELS[k] || k;
  const known = entries
    .filter(([k]) => RES_LABELS[k])
    .sort((a, b) => Object.keys(RES_LABELS).indexOf(a[0]) - Object.keys(RES_LABELS).indexOf(b[0]));
  const goods = entries.filter(([k]) => !RES_LABELS[k]).sort((a, b) => b[1] - a[1]);
  const rows = known.map(([k, v]) => ({ key: k, label: name(k), value: v }));
  if (goods.length) {
    rows.push({ header: 'Товари' });
    goods.forEach(([k, v]) => rows.push({ key: k, label: name(k), value: v }));
  }
  return rows;
}
function parseGoods(raw) {
  const map = raw?.resources?.resources || raw?.resources || null;
  return map && typeof map === 'object' && !Array.isArray(map) ? map : null;
}

const PROD_STATUS = [
  [/Finished|Produced|Ready|Collect/i, 'готово до збору'],
  [/Producing/i, 'виробляється'],
  [/Idle/i, 'виробництво не запущено'],
  [/Construction/i, 'будується'],
  [/Unconnected/i, 'немає дороги'],
];
function prodStatusLabel(st) {
  for (const [re, label] of PROD_STATUS) if (re.test(String(st || ''))) return label;
  return String(st || '').replace(/State$/, '') || '—';
}
const pad2 = (n) => String(n).padStart(2, '0');
function formatWhen(unixSec) {
  if (!unixSec) return null;
  const d = new Date(Number(unixSec) * 1000);
  if (Number.isNaN(d.getTime())) return null;
  const diffMin = Math.round((d.getTime() - Date.now()) / 60000);
  let rel = '';
  if (diffMin > 0) {
    if (diffMin < 60) rel = ` (через ${diffMin} хв)`;
    else if (diffMin < 60 * 24) rel = ` (через ${Math.round(diffMin / 60)} год)`;
    else rel = ` (через ${Math.round(diffMin / 1440)} дн)`;
  }
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}${rel}`;
}

export default function FoeSyncScreen() {
  const { width: screenWidth, fontScale } = useWindowDimensions();
  const foe = useFoeSync();
  const {
    found = {},
    player,
    userId,
    health = { packets: 0 },
    currentUrl,
    seen,
    consent,
    iconSheet,
    goodsSheet,
    buildingDefs,
    cityBuildings,
    defsProgress,
    saving,
    saveToGuild,
    setWebVisible,
    acceptConsent,
  } = foe || {};

  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Споруди, підсвічені поточним фільтром «Запланованого збору», — для мапи.
  const [highlightIds, setHighlightIds] = useState(null);
  const [focusReq, setFocusReq] = useState(null);
  const focusBuilding = useCallback((id) => setFocusReq({ id, n: Date.now() }), []);

  const resDefs = useMemo(() => {
    const arr = found.resourceDefs;
    if (!Array.isArray(arr)) return null;
    const m = {};
    for (const r of arr) if (r?.id) m[r.id] = r;
    return m;
  }, [found.resourceDefs]);

  const goods = useMemo(() => parseGoods(found.goods), [found.goods]);

  const sumsAll = useMemo(() => {
    const merged = {};
    const add = (mm) => mm && Object.entries(mm).forEach(([k, v]) => { merged[k] = (merged[k] || 0) + v; });
    add(found.boostAgg?.sumsAll);
    add(found.boostLimitedAgg?.sumsAll);
    add(found.boostTimerAgg?.sumsAll);
    if (!found.boostAgg) add(found.boostStartupAgg?.sumsAll);
    return merged;
  }, [found.boostAgg, found.boostLimitedAgg, found.boostTimerAgg, found.boostStartupAgg]);

  const sumsByFeature = useMemo(() => {
    const merged = {};
    for (const src of [found.boostAgg, found.boostLimitedAgg, found.boostTimerAgg]) {
      if (!src?.sumsByFeature) continue;
      for (const [k, v] of Object.entries(src.sumsByFeature)) merged[k] = (merged[k] || 0) + v;
    }
    return merged;
  }, [found.boostAgg, found.boostLimitedAgg, found.boostTimerAgg]);

  const combat = useMemo(
    () => computeCombat(sumsAll, sumsByFeature, found.cityGBs),
    [sumsAll, sumsByFeature, found.cityGBs]
  );
  const collection = useMemo(
    () => (found.prodBuildings ? computeCollection(found.prodBuildings, sumsAll) : null),
    [found.prodBuildings, sumsAll]
  );

  // Збір / стан / час завершення по кожній будівлі — для панелі деталей на мапі.
  // Ключі: id інстансу (точно) і cityentity_id (запасний, за типом).
  const collectInfo = useMemo(() => {
    const byKey = {};
    for (const b of found.prodBuildings || []) {
      const scaled = b.det ? applyMultiplier(b.det, sumsAll) : {};
      const info = {
        rows: resourceRows(scaled, resDefs),
        rnd: !!b.rnd,
        status: prodStatusLabel(b.st),
        ready: !!b.ready,
        whenText: b.ready ? null : formatWhen(b.readyAt),
      };
      if (b.iid != null) byKey[String(b.iid)] = info;
      if (b.id && !byKey[b.id]) byKey[b.id] = info;
    }
    return byKey;
  }, [found.prodBuildings, sumsAll, resDefs]);

  const hasData = Object.keys(sumsAll).length > 0 || (goods && Object.keys(goods).length);

  const onSave = useCallback(async () => {
    if (!hasData) {
      Alert.alert('Ще нема що зберігати', 'Синхронізація ще не завершилась.');
      return;
    }
    try {
      await saveToGuild({
        player,
        boosts: {
          general: combat.base,
          contexts: combat.contexts,
          quantum: combat.quantum,
          featureDeltas: combat.feat,
        },
        goods,
        collection: collection ? { ready: collection.ready, pending: collection.pending } : null,
      });
      if (ToastAndroid?.show) ToastAndroid.show('Збережено у гільдію', ToastAndroid.SHORT);
      else Alert.alert('Готово', 'Дані збережено у гільдію.');
    } catch (e) {
      Alert.alert('Не вдалося зберегти', String(e?.message || e));
    }
  }, [hasData, saveToGuild, player, combat, goods, collection]);

  const onCopy = useCallback(async () => {
    // Компактний дамп — без важких масивів, щоб телефон не завис.
    const collectKeys = new Set();
    for (const b of found.prodBuildings || []) {
      for (const k of Object.keys(b.det || {})) collectKeys.add(k);
      for (const k of Object.keys(b.guildDet || {})) collectKeys.add('guild:' + k);
    }
    const goodDefs = Array.isArray(found.resourceDefs)
      ? found.resourceDefs
          .filter((r) => r && (r.era || /good/i.test(String(r.__class__ || ''))))
          .map((r) => ({ id: r.id, name: r.name, era: r.era }))
          .slice(0, 160)
      : null;

    // повні визначення товарів, зібраних у місті (abilities — лише ключі)
    const rawGoodDefs = (() => {
      const arr = found.resourceDefs;
      if (!Array.isArray(arr)) return null;
      const want = new Set(Array.from(collectKeys).map((k) => k.replace(/^guild:/, '')));
      return arr
        .filter((r) => r && want.has(r.id))
        .map((r) => {
          const o = {};
          for (const [k, v] of Object.entries(r)) {
            o[k] = v && typeof v === 'object' ? Object.keys(v) : v;
          }
          return o;
        });
    })();

    const dump = {
      v: 'v91',
      url: currentUrl,
      player,
      defsProgress: defsProgress || null,
      counts: {
        cityEntities: found.cityMap?.entities?.length || 0,
        prodBuildings: (found.prodBuildings || []).length,
        buildingDefs: buildingDefs ? Object.keys(buildingDefs).length : 0,
        resourceDefs: Array.isArray(found.resourceDefs) ? found.resourceDefs.length : 0,
      },
      boosts: found.boostAgg?.sumsAll || found.boostStartupAgg?.sumsAll || null,
      collectKeys: Array.from(collectKeys),
      collectGoodEras: (() => {
        const arr = found.resourceDefs;
        const m = {};
        if (Array.isArray(arr)) for (const r of arr) if (r?.id) m[r.id] = r;
        return Array.from(collectKeys)
          .map((k) => k.replace(/^guild:/, ''))
          .filter((k, i, a) => a.indexOf(k) === i)
          .map((k) => ({ key: k, name: m[k]?.name || null, era: m[k]?.era || null }));
      })(),
      rawGoodDefs,
      prodStateCounts: found.prodStateCounts || null,
      prodProductClasses: found.prodProductClasses || null,
      prodProductSamples: found.prodProductSamples || null,
      resourceDefsWithFragment: Array.isArray(found.resourceDefs)
        ? found.resourceDefs
            .filter((r) => /frag/i.test(String(r?.id || '')) || /фрагмент/i.test(String(r?.name || '')))
            .map((r) => ({ id: r.id, name: r.name }))
            .slice(0, 40)
        : null,
      goodDefs,
      iconSheet: iconSheet
        ? { pngUrl: iconSheet.pngUrl, frames: Object.keys(iconSheet.frames || {}) }
        : null,
      goodsSheet: goodsSheet
        ? { pngUrl: goodsSheet.pngUrl, frames: Object.keys(goodsSheet.frames || {}) }
        : null,
      sampleBuildings: (cityBuildings || []).slice(0, 6).map((b) => ({
        name: b.name,
        entityId: b.entityId,
        era: b.era,
      })),
    };
    const text = JSON.stringify(dump);
    try {
      await Clipboard.setStringAsync(text);
      if (ToastAndroid?.show) ToastAndroid.show(`Скопійовано (${text.length})`, ToastAndroid.SHORT);
    } catch (e) {
      Alert.alert('Помилка', String(e?.message || e));
    }
  }, [currentUrl, player, found, buildingDefs, cityBuildings, defsProgress, iconSheet, goodsSheet]);

  const packets = health.packets || 0;

  const dp = String(defsProgress || '');
  const dpMatch = dp.match(/(\d+)\s*\/\s*(\d+)/);
  const dpDone = dpMatch ? Number(dpMatch[1]) : 0;
  const dpTotal = dpMatch ? Number(dpMatch[2]) : 0;
  const mapLoading =
    !!found.cityMap &&
    dp !== 'помилка метаданих' &&
    (dp === 'очікування метаданих' ||
      (dpMatch && dpDone < dpTotal) ||
      (!dpMatch && !buildingDefs));
  const mapPct = dpTotal ? (dpDone / dpTotal) * 100 : 0;
  const synced = packets > 0;
  const syncEnabled = consent === 'yes';
  const stackActions = screenWidth < 360 || fontScale > 1.2;

  return (
    <View style={styles.container}>
      {/* Мапа — зверху, фіксована, з прокруткою пальцем */}
      {found.cityMap ? (
        <View style={styles.mapTop}>
          <View style={styles.mapCard}>
            {mapLoading ? (
              <FoeLoadingRing
                pct={mapPct}
                label={
                  dpTotal
                    ? `Завантаження споруд: ${dpDone} / ${dpTotal}`
                    : 'Завантаження мапи…'
                }
              />
            ) : (
              <FoeCityMap
                cityMap={found.cityMap}
                defs={buildingDefs}
                buildings={cityBuildings}
                collect={collectInfo}
                highlightIds={highlightIds}
                focusId={focusReq}
                horizontalInset={46}
              />
            )}
          </View>
        </View>
      ) : null}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {!syncEnabled ? (
          <View style={styles.consentCard}>
            <Text style={styles.consentBody}>{FOE_CONSENT_BODY}</Text>
            {FOE_CONSENT_BULLETS.map((b, i) => (
              <Text key={i} style={styles.consentBullet}>{'•  '}{b}</Text>
            ))}
            <Text style={styles.consentNote}>{FOE_CONSENT_NOTE}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.85}
              style={styles.consentBtn}
              onPress={() => acceptConsent?.()}
            >
              <Text style={styles.consentBtnText}>Погоджуюсь, продовжити</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!synced && syncEnabled ? (
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <MaterialIcons name="info-outline" size={20} color={C.primarySoft} />
              <Text style={styles.infoText}>
                Вікно гри вантажиться у фоні. Якщо дані довго не зʼявляються, відкрийте його для входу.
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.8}
              style={styles.openGameButton}
              onPress={() => setWebVisible?.(true)}
            >
              <MaterialIcons name="open-in-new" size={18} color={C.primary} />
              <Text style={styles.openGameButtonText}>Показати вікно гри</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {found.prodBuildings ? (
          <FoeCollectionPanel
            prodBuildings={found.prodBuildings}
            cityBuildings={cityBuildings}
            sumsAll={sumsAll}
            resDefs={resDefs}
            iconSheet={iconSheet}
            goodsSheet={goodsSheet}
            userId={userId}
            onHighlight={setHighlightIds}
            onFocusBuilding={focusBuilding}
          />
        ) : null}

        <View style={[styles.btnRow, stackActions && styles.btnRowStacked]}>
          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.8}
            style={[styles.secondaryBtn, stackActions && styles.fullWidthBtn]}
            onPress={onCopy}
          >
            <MaterialIcons name="content-copy" size={18} color={C.primary} />
            <Text style={styles.secondaryBtnText}>Копіювати</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ disabled: !hasData || saving, busy: saving }}
            activeOpacity={0.8}
            style={[
              styles.primaryBtn,
              stackActions && styles.fullWidthBtn,
              (!hasData || saving) && styles.disabledBtn,
            ]}
            onPress={onSave}
            disabled={!hasData || saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialIcons name="cloud-upload" size={19} color="#fff" />
            )}
            <Text style={styles.primaryBtnText}>
              {saving ? 'Збереження…' : 'Зберегти у гільдію'}
            </Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  mapTop: {
    paddingHorizontal: 12,
    paddingTop: 12,
    backgroundColor: C.background,
  },
  mapCard: {
    padding: 10,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
  },
  scroll: { flex: 1 },
  content: { padding: 14, paddingBottom: 28 },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
  },
  statusIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCopy: { flex: 1, marginLeft: 12 },
  statusTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
  statusMeta: { color: C.textSecondary, fontSize: 13, marginTop: 3 },
  infoCard: {
    padding: 14,
    marginTop: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
  },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start' },
  infoText: { flex: 1, color: C.textSecondary, fontSize: 13, lineHeight: 19, marginLeft: 9 },
  openGameButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingHorizontal: 14,
    backgroundColor: `${C.primary}18`,
    borderWidth: 1,
    borderColor: C.primary,
    borderRadius: 10,
  },
  openGameButtonText: { color: C.primary, fontSize: 14, fontWeight: '700', marginLeft: 8 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btnRowStacked: { flexDirection: 'column' },
  fullWidthBtn: { flex: 0, width: '100%' },
  primaryBtn: {
    flex: 1.35,
    minHeight: 46,
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: C.primary,
    borderRadius: 10,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  primaryBtnText: {
    flexShrink: 1,
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 8,
    textAlign: 'center',
  },
  secondaryBtn: {
    flex: 0.85,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.primary,
    backgroundColor: `${C.primary}18`,
  },
  secondaryBtnText: {
    flexShrink: 1,
    color: C.primary,
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 7,
    textAlign: 'center',
  },
  disabledBtn: { opacity: 0.4 },
  consentCard: {
    padding: 14,
    marginTop: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
  },
  consentBody: { color: C.text, fontSize: 14, lineHeight: 21, marginBottom: 10 },
  consentBullet: { color: C.text, fontSize: 13, lineHeight: 20, marginBottom: 4 },
  consentNote: {
    color: C.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    marginTop: 8,
  },
  consentBtn: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    paddingHorizontal: 14,
    backgroundColor: C.primary,
    borderRadius: 10,
  },
  consentBtnText: { color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
