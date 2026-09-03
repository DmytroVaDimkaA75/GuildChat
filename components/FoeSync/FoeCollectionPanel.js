// components/FoeSync/FoeCollectionPanel.js
//
// Запланований збір з міста. Кнопки-фільтри (іконки ресурсів) у горизонтальному
// рядку; на кнопці — сумарна кількість із ВЖЕ ЗАВЕРШЕНИХ виробництв, а де є
// бонус виробництва — «база / з бонусом». Для товарів і товарів гільдії під
// фільтрами зʼявляється рядок фільтрів по епохах. Натискання показує таблицю
// «споруда → кількість».

import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { DarkThemeColors as C } from '../../constants/theme';
import FoeIcon from './FoeIcon';
import { goodEra, eraIndex, isSpecialGood, SPECIAL_KEY } from './foeGoods';

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
}) {
  const sheets = [iconSheet, goodsSheet].filter(Boolean);
  const [selected, setSelected] = useState(null);
  const [era, setEra] = useState(null);

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

  // Підфільтри: епохи (товари) або зібрані предмети (фрагменти)
  const subOptions = useMemo(() => {
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
  }, [isGroup, isFrags, selFilter, ready, isGoodKey, resDefs]);

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

  const pick = (id) => {
    setSelected((cur) => (cur === id ? null : id));
    setEra(null);
  };

  const anyTotal = FILTERS.some((f) => totals[f.id]?.base > 0);
  if (!anyTotal) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Запланований збір</Text>
      <Text style={styles.subtitle}>Готові виробництва за ресурсами</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
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

      {subOptions.length ? (
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
              <View
                key={r.key}
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
              </View>
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
  eraTxt: { color: C.textSecondary, fontSize: 12, fontWeight: '600' },
  eraTxtActive: { color: C.primarySoft },
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
});
