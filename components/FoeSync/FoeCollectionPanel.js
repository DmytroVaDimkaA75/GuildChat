// components/FoeSync/FoeCollectionPanel.js
//
// Запланований збір з міста. Кнопки-фільтри (іконки ресурсів) у горизонтальному
// рядку; на кнопці — сумарна кількість із ВЖЕ ЗАВЕРШЕНИХ виробництв, а де є
// бонус виробництва — «база / з бонусом». Для товарів і товарів гільдії під
// фільтрами зʼявляється рядок фільтрів по епохах. Натискання показує таблицю
// «споруда → кількість».

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import FoeIcon from './FoeIcon';

const COLORS = {
  surface: '#152330',
  surfaceHi: '#1b2b3b',
  primary: '#4ea1ff',
  textPrimary: '#f4f7fb',
  textSecondary: '#9aa3b2',
  success: '#54d18c',
  separator: '#36516a',
};

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
  { id: 'strategy_points', label: 'ВП', icon: 'strategy_points', boost: null },
  { id: 'money', label: 'Монети', icon: 'money', boost: 'coin_production' },
  { id: 'supplies', label: 'Ресурси', icon: 'supplies', boost: 'supply_production' },
  { id: 'premium', label: 'Діаманти', icon: 'premium', boost: null },
  { id: 'medals', label: 'Медалі', icon: 'medals', boost: null },
  { id: 'goods', label: 'Товари', mat: 'inventory-2', boost: 'goods_production', group: 'det' },
  {
    id: 'guildGoods',
    label: 'Товари гільдії',
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
};
const eraLabel = (e) => ERA_LABELS[e] || e;
const withBonus = (base, pct) => (pct ? Math.floor(base * (1 + pct / 100)) : base);
const fmt = (n) => Number(n || 0).toLocaleString('uk');

export default function FoeCollectionPanel({ prodBuildings, cityBuildings, sumsAll, resDefs, iconSheet }) {
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

  const goodName = (k) => resDefs?.[k]?.name || k;
  const isGoodKey = (k) => !CORE_KEYS.has(k) && (resDefs?.[k]?.era || /^[a-z][a-z0-9_]*$/.test(k));
  const bInfo = (b) => infoByIid[String(b.iid)] || { name: nameByCid[b.id] || b.id, era: null };

  // Сума по кожному фільтру (з уже завершених виробництв)
  const totals = useMemo(() => {
    const out = {};
    for (const f of FILTERS) {
      let base = 0;
      for (const b of ready) {
        if (f.group) {
          const det = b[f.group] || {};
          for (const [k, v] of Object.entries(det)) if (isGoodKey(k)) base += Number(v) || 0;
        } else {
          base += Number((b.det || {})[f.id]) || 0;
        }
      }
      const pct = f.boost ? Number(sumsAll?.[f.boost]) || 0 : 0;
      out[f.id] = { base, boosted: withBonus(base, pct), pct };
    }
    return out;
  }, [ready, sumsAll, resDefs]);

  const selFilter = FILTERS.find((f) => f.id === selected) || null;
  const isGroup = !!selFilter?.group;

  // Епохи для підфільтра (лише для товарних фільтрів)
  const eras = useMemo(() => {
    if (!isGroup) return [];
    const set = new Set();
    for (const b of ready) {
      const det = b[selFilter.group] || {};
      if (!Object.keys(det).some(isGoodKey)) continue;
      const e = bInfo(b).era;
      if (e) set.add(e);
    }
    return Array.from(set).sort();
  }, [isGroup, selFilter, ready, infoByIid]);

  // Рядки таблиці для вибраного фільтра
  const rows = useMemo(() => {
    if (!selFilter) return [];
    const pct = selFilter.boost ? Number(sumsAll?.[selFilter.boost]) || 0 : 0;
    const list = [];
    for (const b of ready) {
      const info = bInfo(b);
      if (isGroup) {
        if (era && info.era !== era) continue;
        const det = b[selFilter.group] || {};
        for (const [k, v] of Object.entries(det)) {
          if (!isGoodKey(k) || !v) continue;
          list.push({
            key: `${b.iid || b.id}:${k}`,
            name: info.name,
            sub: goodName(k) + (info.era ? ` · ${eraLabel(info.era)}` : ''),
            base: Number(v),
            boosted: withBonus(Number(v), pct),
          });
        }
      } else {
        const v = Number((b.det || {})[selFilter.id]) || 0;
        if (!v) continue;
        list.push({
          key: String(b.iid || b.id) + ':' + selFilter.id,
          name: info.name,
          sub: null,
          base: v,
          boosted: withBonus(v, pct),
        });
      }
    }
    return list.sort((a, b) => b.base - a.base);
  }, [selFilter, isGroup, era, ready, sumsAll, resDefs]);

  const pick = (id) => {
    setSelected((cur) => (cur === id ? null : id));
    setEra(null);
  };

  const anyTotal = FILTERS.some((f) => totals[f.id]?.base > 0);
  if (!anyTotal) return null;

  return (
    <View>
      <Text style={styles.section}>Запланований збір</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
        {FILTERS.map((f) => {
          const t = totals[f.id] || { base: 0, boosted: 0, pct: 0 };
          const active = selected === f.id;
          const frame = f.icon && iconSheet?.frames?.[f.icon];
          return (
            <TouchableOpacity
              key={f.id}
              style={[styles.filterBtn, active && styles.filterBtnActive]}
              onPress={() => pick(f.id)}
              activeOpacity={0.8}
            >
              {frame ? (
                <FoeIcon sheet={iconSheet} name={f.icon} size={22} />
              ) : (
                <MaterialIcons
                  name={f.mat || 'inventory'}
                  size={20}
                  color={active ? COLORS.primary : COLORS.textSecondary}
                />
              )}
              <Text style={[styles.filterVal, active && { color: COLORS.primary }]}>
                {t.pct ? `${fmt(t.base)} / ${fmt(t.boosted)}` : fmt(t.base)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {isGroup && eras.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.eraRow}>
          <TouchableOpacity
            style={[styles.eraBtn, !era && styles.eraBtnActive]}
            onPress={() => setEra(null)}
          >
            <Text style={[styles.eraTxt, !era && { color: COLORS.primary }]}>усі епохи</Text>
          </TouchableOpacity>
          {eras.map((e) => (
            <TouchableOpacity
              key={e}
              style={[styles.eraBtn, era === e && styles.eraBtnActive]}
              onPress={() => setEra((cur) => (cur === e ? null : e))}
            >
              <Text style={[styles.eraTxt, era === e && { color: COLORS.primary }]}>{eraLabel(e)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      {selFilter ? (
        rows.length ? (
          <View style={styles.table}>
            {rows.map((r) => (
              <View key={r.key} style={styles.tr}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tdName}>{r.name}</Text>
                  {r.sub ? <Text style={styles.tdSub}>{r.sub}</Text> : null}
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
          <Text style={styles.empty}>Немає завершених виробництв цього ресурсу.</Text>
        )
      ) : (
        <Text style={styles.empty}>Оберіть фільтр, щоб побачити список споруд.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8,
  },
  filtersRow: { gap: 8, paddingRight: 8 },
  filterBtn: {
    minWidth: 66,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.separator,
    backgroundColor: COLORS.surface,
  },
  filterBtnActive: { borderColor: COLORS.primary, backgroundColor: COLORS.surfaceHi },
  filterVal: { color: COLORS.textPrimary, fontSize: 11, fontWeight: '700', marginTop: 4 },
  eraRow: { gap: 6, paddingRight: 8, marginTop: 8 },
  eraBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.separator,
  },
  eraBtnActive: { borderColor: COLORS.primary, backgroundColor: COLORS.surfaceHi },
  eraTxt: { color: COLORS.textSecondary, fontSize: 11 },
  table: { marginTop: 10, borderTopWidth: 1, borderTopColor: COLORS.surface },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surface,
  },
  tdName: { color: COLORS.textPrimary, fontSize: 13 },
  tdSub: { color: COLORS.textSecondary, fontSize: 11, marginTop: 1 },
  tdVal: { color: COLORS.success, fontSize: 13, fontWeight: '700', marginLeft: 8 },
  empty: { color: COLORS.textSecondary, fontSize: 12, fontStyle: 'italic', marginTop: 10 },
});
