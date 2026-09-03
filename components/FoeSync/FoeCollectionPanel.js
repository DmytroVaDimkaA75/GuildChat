// components/FoeSync/FoeCollectionPanel.js
//
// Запланований збір з міста. Кнопки-фільтри (іконки ресурсів) у горизонтальному
// рядку; на кнопці — сумарна кількість із ВЖЕ ЗАВЕРШЕНИХ виробництв, а де є
// бонус виробництва — «база / з бонусом». Для товарів і товарів гільдії під
// фільтрами зʼявляється рядок фільтрів по епохах. Натискання показує таблицю
// «споруда → кількість».

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { DarkThemeColors as C } from '../../constants/theme';
import FoeIcon from './FoeIcon';
import { goodEra, eraIndex, isSpecialGood, SPECIAL_KEY } from './foeGoods';
import { subscribeFoeFilters, saveFoeFilter, deleteFoeFilter } from '../../src/services/foeFilters';

const SAVED_KEY = '__saved__';

const CORE_KEYS = new Set([
  'money',
  'supplies',
  'medals',
  'premium',
  'strategy_points',
  'total_battlepoints',
  'clan_power',
  'population',
  'all_age',
]);

const FILTERS = [
  { id: 'strategy_points', label: 'СО', icon: 'strategy_points', boost: null },
  { id: 'money', label: 'Монети', icon: 'money', boost: 'coin_production' },
  { id: 'supplies', label: 'Ресурси', icon: 'supplies', boost: 'supply_production' },
  { id: 'premium', label: 'Діаманти', icon: 'premium', boost: null },
  { id: 'medals', label: 'Медалі', icon: 'medals', boost: null },
  { id: 'fragments', label: 'Фрагменти', icon: 'icon_fragment', mat: 'extension', boost: null, frags: true },
  {
    id: 'goods',
    label: 'Товари',
    icon: 'goods',
    mat: 'inventory-2',
    boost: 'goods_production',
    group: 'det',
  },
  {
    id: 'guildGoods',
    label: 'Товари гільдії',
    icon: 'treasury_goods',
    mat: 'account-balance',
    boost: 'goods_production',
    group: 'guildDet',
  },
];

const ERA_LABELS = {
  BronzeAge: 'Бронзова доба',
  IronAge: 'Залізна доба',
  EarlyMiddleAge: 'Раннє Середньовіччя',
  HighMiddleAge: 'Високе Середньовіччя',
  LateMiddleAge: 'Пізнє Середньовіччя',
  ColonialAge: 'Колоніальна доба',
  IndustrialAge: 'Індустріальна доба',
  ProgressiveEra: 'Епоха прогресу',
  ModernEra: 'Епоха модерну',
  PostModernEra: 'Постмодерн',
  ContemporaryEra: 'Новітня епоха',
  TomorrowEra: 'Епоха майбутнього',
  FutureEra: 'Майбутнє',
  ArcticFuture: 'Арктичне майбутнє',
  OceanicFuture: 'Океанічне майбутнє',
  VirtualFuture: 'Віртуальне майбутнє',
  SpaceAgeMars: 'Космос: Марс',
  SpaceAgeAsteroidBelt: 'Космос: Пояс астероїдів',
  SpaceAgeVenus: 'Космос: Венера',
  SpaceAgeJupiterMoon: 'Космос: Супутник Юпітера',
  SpaceAgeTitan: 'Космос: Титан',
  SpaceAgeSpaceHub: 'Космос: Космічний вузол',
  StellarAgeDiscovery: 'Зоряна ера: Відкриття',
  StellarAgeColonization: 'Зоряна ера: Колонізація',
};
const eraLabel = (e) => ERA_LABELS[e] || e;
const withBonus = (base, pct) => (pct ? Math.floor(base * (1 + pct / 100)) : base);
const fmt = (n) => Number(n || 0).toLocaleString('uk');

export default function FoeCollectionPanel({
  prodBuildings,
  cityBuildings,
  sumsAll,
  resDefs,
  iconSheet,
  goodsSheet,
  userId,
  onHighlight,
  onFocusBuilding,
}) {
  const sheets = [iconSheet, goodsSheet].filter(Boolean);
  const [selected, setSelected] = useState(null);
  const [era, setEra] = useState(null);
  const [savedFilters, setSavedFilters] = useState([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) return undefined;
    return subscribeFoeFilters(userId, setSavedFilters);
  }, [userId]);

  const ready = useMemo(
    () => (prodBuildings || []).filter((b) => b && b.ready),
    [prodBuildings]
  );

  const infoByIid = useMemo(() => {
    const m = {};
    for (const cb of cityBuildings || []) {
      if (cb?.id != null) m[String(cb.id)] = { name: cb.name || cb.entityId, era: cb.era };
    }
    return m;
  }, [cityBuildings]);
  const nameByCid = useMemo(() => {
    const m = {};
    for (const cb of cityBuildings || []) {
      if (cb?.entityId && !m[cb.entityId]) m[cb.entityId] = cb.name || cb.entityId;
    }
    return m;
  }, [cityBuildings]);

  const goodName = useCallback((key) => resDefs?.[key]?.name || key, [resDefs]);
  const isGoodKey = useCallback(
    (key) => !CORE_KEYS.has(key) && (resDefs?.[key]?.era || /^[a-z][a-z0-9_]*$/.test(key)),
    [resDefs]
  );
  const bInfo = useCallback(
    (building) =>
      infoByIid[String(building.iid)] || {
        name: nameByCid[building.id] || building.id,
        era: null,
      },
    [infoByIid, nameByCid]
  );

  // Сума по кожному фільтру (з уже завершених виробництв)
  const totals = useMemo(() => {
    const out = {};
    for (const f of FILTERS) {
      let base = 0;
      for (const b of ready) {
        if (f.frags) {
          for (const fr of b.frags || []) base += Number(fr.amount) || 0;
        } else if (f.group) {
          const det = b[f.group] || {};
          for (const [k, v] of Object.entries(det)) if (isGoodKey(k)) base += Number(v) || 0;
        } else {
          for (const key of f.keys || [f.id]) base += Number((b.det || {})[key]) || 0;
        }
      }
      const pct = f.boost ? Number(sumsAll?.[f.boost]) || 0 : 0;
      out[f.id] = { base, boosted: withBonus(base, pct), pct };
    }
    return out;
  }, [ready, sumsAll, isGoodKey]);

  const selFilter = FILTERS.find((f) => f.id === selected && totals[f.id]?.base) || null;
  const isGroup = !!selFilter?.group;
  const isFrags = !!selFilter?.frags;

  // Підфільтри: збережені фільтри / епохи (товари) / зібрані предмети (фрагменти)
  const subOptions = useMemo(() => {
    if (selected === SAVED_KEY) {
      return savedFilters.map((sf) => ({
        key: sf.id,
        label: sf.name,
        saved: sf,
        enabled: !!totals[sf.filterId]?.base,
      }));
    }
    if (isGroup) {
      const set = new Set();
      let hasSpecial = false;
      for (const b of ready) {
        const det = b[selFilter.group] || {};
        for (const k of Object.keys(det)) {
          if (!isGoodKey(k) || !det[k]) continue;
          if (isSpecialGood(k, resDefs)) hasSpecial = true;
          const e = goodEra(k, resDefs);
          if (e) set.add(e);
        }
      }
      const eraChips = Array.from(set)
        .sort((a, z) => eraIndex(a) - eraIndex(z))
        .map((e) => ({ key: e, label: eraLabel(e) }));
      return hasSpecial
        ? [{ key: SPECIAL_KEY, label: 'Спеціальні ресурси' }, ...eraChips]
        : eraChips;
    }
    if (isFrags) {
      const map = new Map();
      for (const b of ready) {
        for (const fr of b.frags || []) {
          if (fr.asmName && !map.has(fr.asmName)) map.set(fr.asmName, fr.asmName);
        }
      }
      return Array.from(map.keys()).sort().map((n) => ({ key: n, label: n }));
    }
    return [];
  }, [selected, savedFilters, totals, isGroup, isFrags, selFilter, ready, isGoodKey, resDefs]);

  // Рядки таблиці для вибраного фільтра
  const rows = useMemo(() => {
    if (!selFilter) return [];
    const pct = selFilter.boost ? Number(sumsAll?.[selFilter.boost]) || 0 : 0;
    const list = [];
    for (const b of ready) {
      const info = bInfo(b);
      if (isFrags) {
        for (const fr of b.frags || []) {
          if (!fr.amount) continue;
          if (era && fr.asmName !== era) continue;
          list.push({
            key: `${b.iid || b.id}:${fr.id || fr.asmId}`,
            resKey: [fr.asmIcon, 'icon_fragment'],
            name: info.name,
            sub:
              (fr.asmName ? `→ ${fr.asmName}` : '') +
              (fr.reqd ? ` (потрібно ${fr.reqd})` : '') +
              (fr.motiv ? ' · за мотивації' : ''),
            base: Number(fr.amount),
            boosted: Number(fr.amount),
          });
        }
      } else if (isGroup) {
        const det = b[selFilter.group] || {};
        for (const [k, v] of Object.entries(det)) {
          if (!isGoodKey(k) || !v) continue;
          const gEra = goodEra(k, resDefs);
          const special = isSpecialGood(k, resDefs);
          if (era === SPECIAL_KEY ? !special : era && gEra !== era) continue;
          list.push({
            key: `${b.iid || b.id}:${k}`,
            resKey: k,
            name: info.name,
            sub: goodName(k) + (gEra ? ` · ${eraLabel(gEra)}` : ''),
            special,
            base: Number(v),
            boosted: withBonus(Number(v), pct),
          });
        }
      } else {
        let v = 0;
        let hitKey = selFilter.id;
        for (const key of selFilter.keys || [selFilter.id]) {
          const kv = Number((b.det || {})[key]) || 0;
          if (kv) {
            v += kv;
            hitKey = key;
          }
        }
        if (!v) continue;
        list.push({
          key: String(b.iid || b.id) + ':' + selFilter.id,
          resKey: hitKey,
          name: info.name,
          sub: null,
          base: v,
          boosted: withBonus(v, pct),
        });
      }
    }
    return list.sort((a, b) => b.base - a.base);
  }, [selFilter, isGroup, isFrags, era, ready, sumsAll, bInfo, goodName, isGoodKey, resDefs]);

  // Ідентифікатори споруд, що потрапляють у поточний фільтр/підфільтр —
  // для підсвічування на мапі (у порядку рядків таблиці: найбільше — першим).
  const matchIds = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const r of rows) {
      const id = String(r.key).split(':')[0];
      if (id && !seen.has(id)) {
        seen.add(id);
        list.push(id);
      }
    }
    return list;
  }, [rows]);
  useEffect(() => {
    onHighlight?.(matchIds);
  }, [matchIds, onHighlight]);
  useEffect(() => () => onHighlight?.([]), [onHighlight]);

  const pick = (id) => {
    setSelected((cur) => (cur === id ? null : id));
    setEra(null);
  };
  const applySaved = (sf) => {
    setSelected(sf.filterId);
    setEra(sf.subKey || null);
  };
  const resetFilter = () => {
    setSelected(null);
    setEra(null);
  };
  const hasSelection = !!selFilter;

  const doSave = async () => {
    const name = saveName.trim();
    if (!name || !selFilter) return;
    setBusy(true);
    try {
      await saveFoeFilter(userId, { name, filterId: selected, subKey: era });
      setSaveOpen(false);
    } catch (e) {
      Alert.alert('Не вдалося зберегти', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };
  const removeSaved = (sf) => {
    Alert.alert('Видалити фільтр?', sf.name, [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Видалити',
        style: 'destructive',
        onPress: () => deleteFoeFilter(userId, sf.id).catch(() => {}),
      },
    ]);
  };

  const anyTotal = FILTERS.some((f) => totals[f.id]?.base > 0);
  if (!anyTotal) return null;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Запланований збір</Text>
          <Text style={styles.subtitle}>Готові виробництва за ресурсами</Text>
        </View>
        <TouchableOpacity
          style={[styles.hdrBtn, !hasSelection && styles.hdrBtnOff]}
          disabled={!hasSelection}
          onPress={resetFilter}
          accessibilityRole="button"
          accessibilityLabel="Скинути фільтр"
        >
          <MaterialIcons
            name="filter-alt-off"
            size={20}
            color={hasSelection ? C.primary : C.textSecondary}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.hdrBtn, !hasSelection && styles.hdrBtnOff]}
          disabled={!hasSelection || !userId}
          onPress={() => {
            setSaveName('');
            setSaveOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Зберегти фільтр"
        >
          <MaterialIcons
            name="bookmark-add"
            size={20}
            color={hasSelection && userId ? C.primary : C.textSecondary}
          />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
        {savedFilters.length ? (
          <TouchableOpacity
            style={[styles.filterBtn, selected === SAVED_KEY && styles.filterBtnActive]}
            onPress={() => pick(SAVED_KEY)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Мої фільтри"
            accessibilityState={{ selected: selected === SAVED_KEY }}
          >
            <View style={styles.filterHeading}>
              {sheets.some((s) => s?.frames?.icon_favorite || s?.frames?.stars) ? (
                <FoeIcon sheet={sheets} name={['icon_favorite', 'stars']} size={22} />
              ) : (
                <MaterialIcons
                  name="bookmark"
                  size={20}
                  color={selected === SAVED_KEY ? C.primary : C.textSecondary}
                />
              )}
              <Text
                numberOfLines={2}
                style={[styles.filterLabel, selected === SAVED_KEY && styles.filterLabelActive]}
              >
                Мої фільтри
              </Text>
            </View>
            <Text
              style={[styles.filterVal, selected === SAVED_KEY && styles.filterValActive]}
            >
              {savedFilters.length}
            </Text>
          </TouchableOpacity>
        ) : null}
        {FILTERS.map((f) => {
          const t = totals[f.id] || { base: 0, boosted: 0, pct: 0 };
          if (!t.base) return null; // ресурс не збирається — кнопку не показуємо
          const active = selected === f.id;
          const frame =
            f.icon && sheets.some((s) => s?.frames?.[f.icon]);
          return (
            <TouchableOpacity
              key={f.id}
              style={[styles.filterBtn, active && styles.filterBtnActive]}
              onPress={() => pick(f.id)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`${f.label}: ${
                t.pct ? `${fmt(t.base)} з бази, ${fmt(t.boosted)} з бонусом` : fmt(t.base)
              }`}
              accessibilityState={{ selected: active }}
            >
              <View style={styles.filterHeading}>
                {frame ? (
                  <FoeIcon sheet={sheets} name={f.icon} size={22} />
                ) : (
                  <MaterialIcons
                    name={f.mat || 'inventory'}
                    size={20}
                    color={active ? C.primary : C.textSecondary}
                  />
                )}
                <Text
                  numberOfLines={2}
                  style={[styles.filterLabel, active && styles.filterLabelActive]}
                >
                  {f.label}
                </Text>
              </View>
              <Text style={[styles.filterVal, active && styles.filterValActive]}>
                {t.pct ? `${fmt(t.base)} / ${fmt(t.boosted)}` : fmt(t.base)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {selected === SAVED_KEY ? (
        savedFilters.length === 0 ? (
          <Text style={styles.savedHint}>Немає збережених фільтрів.</Text>
        ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.eraRow}
            >
              {subOptions.map((o) => (
                <View key={o.key} style={[styles.savedChip, !o.enabled && styles.eraBtnOff]}>
                  <TouchableOpacity
                    style={styles.savedChipBody}
                    disabled={!o.enabled}
                    onPress={() => applySaved(o.saved)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`Увімкнути фільтр ${o.label}`}
                  >
                    <Text style={[styles.eraTxt, !o.enabled && styles.eraTxtOff]}>{o.label}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.savedChipX}
                    onPress={() => removeSaved(o.saved)}
                    hitSlop={{ top: 10, bottom: 10, left: 4, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Видалити фільтр ${o.label}`}
                  >
                    <MaterialIcons name="close" size={16} color={C.danger} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
        )
      ) : subOptions.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.eraRow}>
          <TouchableOpacity
            style={[styles.eraBtn, !era && styles.eraBtnActive]}
            onPress={() => setEra(null)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected: !era }}
          >
            <Text style={[styles.eraTxt, !era && styles.eraTxtActive]}>
              {isFrags ? 'усі' : 'усі епохи'}
            </Text>
          </TouchableOpacity>
          {subOptions.map((o) => (
            <TouchableOpacity
              key={o.key}
              style={[styles.eraBtn, era === o.key && styles.eraBtnActive]}
              onPress={() => setEra((cur) => (cur === o.key ? null : o.key))}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: era === o.key }}
            >
              <Text style={[styles.eraTxt, era === o.key && styles.eraTxtActive]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      {selFilter ? (
        rows.length ? (
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={styles.tableTitle}>{selFilter.label}</Text>
              {selFilter.boost && totals[selFilter.id]?.pct ? (
                <Text style={styles.boostBadge}>+{fmt(totals[selFilter.id].pct)}%</Text>
              ) : null}
            </View>
            {rows.map((r, index) => (
              <TouchableOpacity
                key={r.key}
                activeOpacity={0.6}
                onPress={() => onFocusBuilding?.(String(r.key).split(':')[0])}
                style={[
                  styles.tr,
                  index === rows.length - 1 && styles.trLast,
                  r.special && styles.trSpecial,
                ]}
              >
                <FoeIcon sheet={sheets} name={r.resKey} size={20} style={{ marginRight: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.tdName, r.special && styles.tdNameSpecial]}>{r.name}</Text>
                  {r.sub ? (
                    <Text style={[styles.tdSub, r.special && styles.tdSubSpecial]}>{r.sub}</Text>
                  ) : null}
                </View>
                <Text style={styles.tdVal}>
                  {selFilter.boost && totals[selFilter.id]?.pct
                    ? `${fmt(r.base)} / ${fmt(r.boosted)}`
                    : fmt(r.base)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.emptyBox}>
            <Text style={styles.empty}>Немає завершених виробництв цього ресурсу.</Text>
          </View>
        )
      ) : (
        <View style={styles.emptyBox}>
          <Text style={styles.empty}>Оберіть ресурс, щоб побачити список споруд.</Text>
        </View>
      )}

      <Modal
        visible={saveOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSaveOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setSaveOpen(false)}>
          <Pressable style={styles.saveCard} onPress={() => {}}>
            <Text style={styles.saveTitle}>Назва фільтру</Text>
            <TextInput
              style={styles.saveInput}
              value={saveName}
              onChangeText={setSaveName}
              placeholder="Напр. Товари Зоряної ери"
              placeholderTextColor={C.textSecondary}
              autoFocus
              maxLength={40}
            />
            <View style={styles.saveActions}>
              <TouchableOpacity onPress={() => setSaveOpen(false)}>
                <Text style={styles.saveCancel}>Скасувати</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={busy || !saveName.trim()}
                onPress={doSave}
                style={[styles.saveOk, (busy || !saveName.trim()) && { opacity: 0.4 }]}
              >
                <Text style={styles.saveOkTxt}>{busy ? '…' : 'Зберегти'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    padding: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
  },
  title: {
    color: C.primarySoft,
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: { color: C.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 3, marginBottom: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  hdrBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  hdrBtnOff: { opacity: 0.4 },
  savedHint: { color: C.textSecondary, fontSize: 12, fontStyle: 'italic', paddingVertical: 8 },
  filtersRow: { gap: 8, paddingRight: 8 },
  filterBtn: {
    minWidth: 100,
    minHeight: 66,
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceElevated,
  },
  filterBtnActive: { borderColor: C.primary, backgroundColor: `${C.primary}18` },
  filterHeading: { flexDirection: 'row', alignItems: 'center' },
  filterLabel: {
    flexShrink: 1,
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
    marginLeft: 6,
  },
  filterLabelActive: { color: C.text },
  filterVal: { color: C.text, fontSize: 13, fontWeight: '700', marginTop: 7 },
  filterValActive: { color: C.primarySoft },
  eraRow: { gap: 7, paddingRight: 8, marginTop: 10 },
  eraBtn: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceElevated,
  },
  eraBtnActive: { borderColor: C.primary, backgroundColor: `${C.primary}18` },
  eraBtnOff: { opacity: 0.4 },
  savedChip: {
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceElevated,
    overflow: 'hidden',
  },
  savedChipBody: { paddingLeft: 12, paddingRight: 8, alignSelf: 'stretch', justifyContent: 'center' },
  savedChipX: {
    paddingHorizontal: 9,
    alignSelf: 'stretch',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: C.border,
  },
  eraTxt: { color: C.textSecondary, fontSize: 12, fontWeight: '600' },
  eraTxtActive: { color: C.primarySoft },
  eraTxtOff: { color: C.textSecondary },
  table: {
    marginTop: 12,
    overflow: 'hidden',
    backgroundColor: C.surfaceElevated,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
  },
  tableHeader: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tableTitle: { color: C.text, fontSize: 13, fontWeight: '700' },
  boostBadge: {
    color: C.success,
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: `${C.success}70`,
    backgroundColor: `${C.success}12`,
  },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  trLast: { borderBottomWidth: 0 },
  trSpecial: {
    backgroundColor: `${C.success}14`,
    borderLeftWidth: 3,
    borderLeftColor: C.success,
  },
  tdName: { color: C.text, fontSize: 13, lineHeight: 18 },
  tdNameSpecial: { color: C.success, fontWeight: '700' },
  tdSub: { color: C.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 },
  tdSubSpecial: { color: `${C.success}cc` },
  tdVal: { color: C.success, fontSize: 13, fontWeight: '700', marginLeft: 8 },
  emptyBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: C.surfaceElevated,
    borderRadius: 10,
  },
  empty: { color: C.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 22,
  },
  saveCard: {
    backgroundColor: C.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
  },
  saveTitle: { color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 10 },
  saveInput: {
    color: C.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: C.surface,
  },
  saveActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 14,
    gap: 16,
  },
  saveCancel: { color: C.textSecondary, fontSize: 14, fontWeight: '600' },
  saveOk: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  saveOkTxt: { color: '#00121f', fontSize: 14, fontWeight: '800' },
});
