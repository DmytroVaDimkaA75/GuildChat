// components/FoeSync/BonusesModal.js
//
// Попап «Усі бонуси з гри». Відкривається при тапі на аватарку користувача
// в шапці бічного меню. Дані беруться з FoeSyncProvider.

import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useFoeSync } from './FoeSyncProvider';
import { STATS, computeCombat, otherBonusRows } from './foeBonuses';
import FoeIcon, { findFrame } from './FoeIcon';

const COLORS = {
  background: '#0f1115',
  surface: '#152330',
  primary: '#4ea1ff',
  textPrimary: '#f4f7fb',
  textSecondary: '#9aa3b2',
  success: '#54d18c',
  separator: '#36516a',
};

const SHORT = {
  attAttacker: 'Атака (напад)',
  defAttacker: 'Захист (напад)',
  attDefender: 'Атака (оборона)',
  defDefender: 'Захист (оборона)',
};

const STAT_ICON = {
  attAttacker: 'att_boost_attacker',
  defAttacker: 'def_boost_attacker',
  attDefender: 'att_boost_defender',
  defDefender: 'def_boost_defender',
};

const CONTEXTS = [
  ['battleground', 'Поле битви гільдій'],
  ['guild_expedition', 'Експедиція гільдії'],
];

// суфікс іконки бойового бонуса за контекстом
const CTX_SUFFIX = {
  general: '',
  battleground: '_gbg',
  guild_expedition: '_gex',
  quantum: '_gr',
};

function CombatGrid({ values, sheets, context = 'general' }) {
  const suffix = CTX_SUFFIX[context] || '';
  return (
    <View style={styles.combatRow}>
      {STATS.map((k) => (
        <View key={k} style={styles.combatCell}>
          <View style={styles.combatCapRow}>
            <FoeIcon
              sheet={sheets}
              name={STAT_ICON[k] + suffix}
              size={16}
              style={{ marginRight: 5 }}
            />
            <Text style={styles.combatCap}>{SHORT[k]}</Text>
          </View>
          <Text style={styles.combatNum}>{values[k]}%</Text>
        </View>
      ))}
    </View>
  );
}

export default function BonusesModal({ visible, onClose }) {
  const foe = useFoeSync();
  const { found = {}, player, health = { packets: 0 }, iconSheet, goodsSheet } = foe || {};
  const sheets = useMemo(
    () => [iconSheet, goodsSheet].filter(Boolean),
    [iconSheet, goodsSheet]
  );

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
  // Показуємо лише ті бонуси, для яких є ігрова іконка (решта — зайве).
  const others = useMemo(() => {
    const rows = otherBonusRows(sumsAll);
    if (!sheets.length) return rows;
    return rows.filter((r) => findFrame(sheets, r.type));
  }, [sumsAll, sheets]);
  const synced = health.packets > 0 && Object.keys(sumsAll).length > 0;

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Бонуси з гри</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>
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
            <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ paddingBottom: 6 }}>
              <Text style={styles.section}>Бойові бонуси</Text>
              <CombatGrid values={combat.base} sheets={sheets} />

              {CONTEXTS.map(([key, label]) =>
                combat.feat[key] ? (
                  <View key={key} style={styles.ctxBlock}>
                    <Text style={styles.ctxLabel}>{label} (разом із загальними)</Text>
                    <CombatGrid values={combat.contexts[key]} sheets={sheets} context={key} />
                  </View>
                ) : null
              )}
              {combat.quantum ? (
                <View style={styles.ctxBlock}>
                  <Text style={styles.ctxLabel}>Квантові вторгнення (окремі)</Text>
                  <CombatGrid values={combat.quantum} sheets={sheets} context="quantum" />
                </View>
              ) : null}

              {others.length ? (
                <>
                  <Text style={styles.section}>Інші бонуси</Text>
                  {others.map((row) => (
                    <View key={row.type} style={styles.otherRow}>
                      <FoeIcon
                        sheet={sheets}
                        name={row.type}
                        size={18}
                        style={{ marginRight: 8 }}
                      />
                      <Text style={styles.otherLabel}>{row.label}</Text>
                      <Text style={styles.otherVal}>
                        {row.value > 0 ? '+' : ''}
                        {row.value}%
                      </Text>
                    </View>
                  ))}
                </>
              ) : null}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: COLORS.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.separator,
    padding: 16,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '800' },
  close: { color: COLORS.textSecondary, fontSize: 18, fontWeight: '700' },
  sub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 4 },
  waiting: { paddingVertical: 30, alignItems: 'center', gap: 10 },
  section: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 6,
  },
  combatRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 6,
  },
  combatCell: { width: '50%', paddingVertical: 7, paddingHorizontal: 6 },
  combatCapRow: { flexDirection: 'row', alignItems: 'center' },
  combatNum: { color: COLORS.success, fontSize: 18, fontWeight: '800', marginTop: 3 },
  combatCap: { color: COLORS.textSecondary, fontSize: 10, flex: 1 },
  ctxBlock: { marginTop: 10 },
  ctxLabel: { color: COLORS.textSecondary, fontSize: 11, marginBottom: 4 },
  otherRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surface,
  },
  otherLabel: { color: COLORS.textPrimary, fontSize: 13, flex: 1, paddingRight: 10 },
  otherVal: { color: COLORS.success, fontSize: 13, fontWeight: '700' },
});
