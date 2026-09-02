// components/FoeSync/AllBonusesScreen.js
//
// Стартовий екран: показує ВСІ бонуси гравця з гри. Відкривається першим при
// запуску застосунку; кнопка «Далі» веде в основний застосунок і більше цей
// екран не показується до наступного запуску (навігації на нього немає).

import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useFoeSync } from './FoeSyncProvider';
import {
  STATS,
  COMBAT_LABELS,
  FEATURE_LABELS,
  computeCombat,
  otherBonusRows,
} from './foeBonuses';

const COLORS = {
  background: '#0f1115',
  surface: '#152330',
  primary: '#4ea1ff',
  textPrimary: '#f4f7fb',
  textSecondary: '#9aa3b2',
  success: '#54d18c',
  separator: '#36516a',
};

const CONTEXTS = [
  ['battleground', 'Поля Гільдій'],
  ['guild_expedition', 'Виправа'],
];

function CombatRow({ values }) {
  return (
    <View style={styles.combatRow}>
      {STATS.map((k) => (
        <View key={k} style={styles.combatCell}>
          <Text style={styles.combatNum}>{values[k]}%</Text>
          <Text style={styles.combatCap}>{SHORT[k]}</Text>
        </View>
      ))}
    </View>
  );
}

const SHORT = {
  attAttacker: 'Атака (напад)',
  defAttacker: 'Захист (напад)',
  attDefender: 'Атака (оборона)',
  defDefender: 'Захист (оборона)',
};

export default function AllBonusesScreen({ onClose }) {
  const foe = useFoeSync();
  const { found = {}, player, health = { packets: 0 } } = foe || {};

  const sumsAll = useMemo(() => {
    const merged = {};
    const add = (mm) =>
      mm && Object.entries(mm).forEach(([k, v]) => { merged[k] = (merged[k] || 0) + v; });
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
  const others = useMemo(() => otherBonusRows(sumsAll), [sumsAll]);

  const synced = health.packets > 0 && Object.keys(sumsAll).length > 0;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Ваші бонуси</Text>
        {player ? (
          <Text style={styles.sub}>
            {player.name} · {String(player.city || '').trim()} · {player.era}
          </Text>
        ) : null}

        {!synced ? (
          <View style={styles.waiting}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.sub}>Синхронізація з грою ще триває…</Text>
          </View>
        ) : (
          <>
            <Text style={styles.section}>Бойові бонуси</Text>
            <CombatRow values={combat.base} />

            {CONTEXTS.map(([key, label]) =>
              combat.feat[key] ? (
                <View key={key} style={styles.ctxBlock}>
                  <Text style={styles.ctxLabel}>{label} (разом із загальними)</Text>
                  <CombatRow values={combat.contexts[key]} />
                </View>
              ) : null
            )}
            {combat.quantum ? (
              <View style={styles.ctxBlock}>
                <Text style={styles.ctxLabel}>Квантові вторгнення (окремі)</Text>
                <CombatRow values={combat.quantum} />
              </View>
            ) : null}

            {others.length ? (
              <>
                <Text style={styles.section}>Інші бонуси</Text>
                {others.map((row) => (
                  <View key={row.type} style={styles.otherRow}>
                    <Text style={styles.otherLabel}>{row.label}</Text>
                    <Text style={styles.otherVal}>
                      {row.value > 0 ? '+' : ''}
                      {row.value}%
                    </Text>
                  </View>
                ))}
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      <TouchableOpacity style={styles.nextBtn} onPress={onClose} activeOpacity={0.85}>
        <Text style={styles.nextBtnText}>Далі →</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: {
    padding: 18,
    paddingTop: (Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 44) + 14,
    paddingBottom: 100,
  },
  title: { color: COLORS.textPrimary, fontSize: 22, fontWeight: '800' },
  sub: { color: COLORS.textSecondary, fontSize: 13, marginTop: 4 },
  waiting: { marginTop: 40, alignItems: 'center', gap: 10 },
  section: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 22,
    marginBottom: 8,
  },
  combatRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 8,
  },
  combatCell: { width: '50%', paddingVertical: 8, paddingHorizontal: 6 },
  combatNum: { color: COLORS.success, fontSize: 20, fontWeight: '800' },
  combatCap: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  ctxBlock: { marginTop: 12 },
  ctxLabel: { color: COLORS.textSecondary, fontSize: 12, marginBottom: 4 },
  otherRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surface,
  },
  otherLabel: { color: COLORS.textPrimary, fontSize: 14, flex: 1, paddingRight: 10 },
  otherVal: { color: COLORS.success, fontSize: 14, fontWeight: '700' },
  nextBtn: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 22,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  nextBtnText: { color: '#00121f', fontSize: 16, fontWeight: '800' },
});
