// components/FoeSync/FoeSyncScreen.js
//
// Екран "Синхронізація з грою" в меню — лише ПЕРЕГЛЯД зібраних даних.
// Саме вікно гри й слухач живуть у FoeSyncProvider (фон), тут їх немає.
// Керування синхронізацією (згода / вхід) — у блоці профілю.

import React, { useCallback, useMemo, useState, useEffect } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { useFoeSync } from './FoeSyncProvider';
import FoeIcon from './FoeIcon';
import FoeCityMap from './FoeCityMap';

const COLORS = {
  background: '#0f1115',
  surface: '#152330',
  primary: '#4ea1ff',
  textPrimary: '#f4f7fb',
  textSecondary: '#9aa3b2',
  danger: '#ff5b5b',
  success: '#54d18c',
  separator: '#36516a',
};

const STATS = ['attAttacker', 'defAttacker', 'attDefender', 'defDefender'];
const COMBAT_LABELS = {
  attAttacker: 'Атака — атакуюча армія',
  defAttacker: 'Захист — атакуюча армія',
  attDefender: 'Атака — оборонна армія',
  defDefender: 'Захист — оборонна армія',
};
const GETALL_MAP = {
  att_boost_attacker: ['attAttacker'],
  def_boost_attacker: ['defAttacker'],
  att_boost_defender: ['attDefender'],
  def_boost_defender: ['defDefender'],
  att_def_boost_attacker: ['attAttacker', 'defAttacker'],
  att_def_boost_defender: ['attDefender', 'defDefender'],
  att_def_boost_attacker_defender: STATS,
};
const GB_MAP = {
  military_boost: ['attAttacker', 'defAttacker'],
  fierce_resistance: ['attDefender', 'defDefender'],
  advanced_tactics: STATS,
};

const empty = () => ({ attAttacker: 0, defAttacker: 0, attDefender: 0, defDefender: 0 });
const addInto = (dst, keys, v) => keys.forEach((k) => { dst[k] += v; });

function computeCombat(sumsAll, sumsByFeature, cityGBs) {
  const base = empty();
  const feat = {};
  const getFeat = (f) => (feat[f] || (feat[f] = empty()));
  for (const [type, sum] of Object.entries(sumsAll || {})) {
    const keys = GETALL_MAP[type];
    if (keys) addInto(base, keys, sum);
  }
  for (const [k, sum] of Object.entries(sumsByFeature || {})) {
    const [type, f] = k.split(' | ');
    const keys = GETALL_MAP[type];
    if (keys) addInto(getFeat(f), keys, sum);
  }
  let gbTotal = 0;
  for (const g of cityGBs || []) {
    const b = g.bonus;
    if (!b || b.__class__ !== 'GreatBuildingUnitBonus' || typeof b.value !== 'number') continue;
    const keys = GB_MAP[b.type];
    if (!keys) continue;
    const v = Math.floor(b.value);
    const target = b.targetedFeature && b.targetedFeature !== 'all' ? getFeat(b.targetedFeature) : base;
    addInto(target, keys, v);
    if (target === base) gbTotal += v;
  }
  const withFeat = (f) => {
    const o = { ...base };
    if (feat[f]) STATS.forEach((k) => { o[k] += feat[f][k]; });
    return o;
  };
  return {
    base,
    contexts: {
      general: base,
      battleground: withFeat('battleground'),
      guild_expedition: withFeat('guild_expedition'),
    },
    quantum: feat.quantum_incursions || feat.guild_raids || null,
    feat,
    gbTotal,
  };
}

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

export default function FoeSyncScreen() {
  const foe = useFoeSync();
  const {
    found = {},
    player,
    health = { packets: 0 },
    currentUrl,
    seen,
    consent,
    iconSheet,
    buildingDefs,
    defsProgress,
    saving,
    saveToGuild,
    setWebVisible,
  } = foe || {};

  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

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
    const text = JSON.stringify(
      { url: currentUrl, player, seen: seen ? Array.from(seen).sort() : [], found },
      null,
      1
    );
    try {
      await Clipboard.setStringAsync(text);
      if (ToastAndroid?.show) ToastAndroid.show(`Скопійовано (${text.length})`, ToastAndroid.SHORT);
    } catch (e) {
      Alert.alert('Помилка', String(e?.message || e));
    }
  }, [currentUrl, player, seen, found]);

  const packets = health.packets || 0;
  const readyRows = collection ? resourceRows(collection.ready, resDefs) : [];

  return (
    <View style={styles.container}>
      {/* Мапа — зверху, фіксована, з прокруткою пальцем */}
      {found.cityMap ? (
        <View style={styles.mapTop}>
          <Text style={styles.mapTitle}>
            Мапа міста{defsProgress ? ` · будівлі ${defsProgress}` : ''}
          </Text>
          <FoeCityMap cityMap={found.cityMap} defs={buildingDefs} />
        </View>
      ) : null}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14 }}>
      <Text style={styles.status}>
        {packets > 0 ? `✅ синхронізовано · пакетів: ${packets} · v62` : '⏳ синхронізація ще триває… · v62'}
      </Text>
      {player ? (
        <Text style={styles.muted}>
          {player.name} · {player.city?.trim()} · {player.era}
        </Text>
      ) : null}

      {packets === 0 ? (
        <View style={styles.hintBox}>
          <Text style={styles.muted}>
            Вікно гри вантажиться у фоні. Якщо довго нічого — відкрийте його для входу:
          </Text>
          <TouchableOpacity style={styles.smallBtn} onPress={() => setWebVisible?.(true)}>
            <Text style={styles.smallBtnText}>Показати вікно гри</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {Object.keys(sumsAll).length ? (
        <>
          <Text style={styles.section}>Бонуси армії</Text>
          {STATS.map((k) => (
            <Text key={k} style={styles.kv}>
              {COMBAT_LABELS[k]}: <Text style={styles.kvVal}>{combat.base[k]}%</Text>
            </Text>
          ))}
          {combat.feat.battleground ? (
            <Text style={styles.muted}>
              ПБГ: {STATS.map((k) => `${combat.contexts.battleground[k]}`).join(' / ')}
            </Text>
          ) : null}
          {combat.feat.guild_expedition ? (
            <Text style={styles.muted}>
              Виправа: {STATS.map((k) => `${combat.contexts.guild_expedition[k]}`).join(' / ')}
            </Text>
          ) : null}
        </>
      ) : null}

      {readyRows.length ? (
        <>
          <Text style={styles.section}>Збір з міста</Text>
          {readyRows.map((r, i) =>
            r.header ? (
              <Text key={i} style={styles.subSection}>— {r.header} —</Text>
            ) : (
              <View key={i} style={styles.resRow}>
                <FoeIcon sheet={iconSheet} name={r.key} size={18} style={{ marginRight: 6 }} />
                <Text style={styles.kv}>
                  {r.label}: <Text style={styles.kvVal}>{Number(r.value).toLocaleString('uk')}</Text>
                </Text>
              </View>
            )
          )}
        </>
      ) : null}

      <View style={styles.btnRow}>
        <TouchableOpacity style={styles.secondaryBtn} onPress={onCopy}>
          <Text style={styles.secondaryBtnText}>Копіювати</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryBtn, (!hasData || saving) && { opacity: 0.4 }]}
          onPress={onSave}
          disabled={!hasData || saving}
        >
          <Text style={styles.primaryBtnText}>{saving ? '…' : 'Зберегти у гільдію'}</Text>
        </TouchableOpacity>
      </View>

      {consent !== 'yes' ? (
        <Text style={styles.muted}>
          Синхронізацію ще не увімкнено. Відкрийте профіль → «Синхронізація з грою».
        </Text>
      ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  mapTop: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.separator,
    backgroundColor: COLORS.surface,
  },
  mapTitle: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  status: { color: COLORS.primary, fontSize: 14, marginBottom: 4 },
  muted: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18, marginBottom: 4 },
  hintBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: 10,
    marginVertical: 8,
  },
  section: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 6,
  },
  subSection: { color: COLORS.textSecondary, fontSize: 11, marginTop: 6, marginBottom: 2 },
  kv: { color: COLORS.textPrimary, fontSize: 14, lineHeight: 21 },
  kvVal: { color: COLORS.success, fontWeight: '700' },
  resRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  primaryBtn: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#00121f', fontSize: 15, fontWeight: '700' },
  secondaryBtn: {
    paddingHorizontal: 16,
    borderRadius: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.separator,
  },
  secondaryBtnText: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '600' },
  smallBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: COLORS.separator,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  smallBtnText: { color: COLORS.primary, fontSize: 13 },
});
