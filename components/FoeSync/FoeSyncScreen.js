// components/FoeSync/FoeSyncScreen.js
//
// Екран "Синхронізація з грою".
//
//  1. Згода (один раз).
//  2. Відкриває веб-версію Forge of Empires у вбудованому вікні.
//  3. "Слухач" (foeInterceptor) ловить потрібні пакети й передає сюди.
//  4. "Зберегти у гільдію" -> числа йдуть у Firebase.
//
// Застосунок НЕ робить власних запитів до сервера гри і НЕ зберігає пароль.

import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';

import { GuildContext } from '../../GuildContext';
import { FOE_INTERCEPTOR_JS } from './foeInterceptor';
import { saveFoeStats } from '../../src/services/foeStats';

const COLORS = {
  background: '#0f1115',
  surface: '#152330',
  surfaceHighlight: '#1b2b3b',
  primary: '#4ea1ff',
  textPrimary: '#f4f7fb',
  textSecondary: '#9aa3b2',
  danger: '#ff5b5b',
  success: '#54d18c',
  separator: '#36516a',
};

const CONSENT_KEY = 'foeSyncConsentV1';

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Гра віддає кожен внесок окремим рядком. 4 підсумкові числа з "Управління
// армією" складаються з кількох типів: є окремі att/def і є СПІЛЬНІ (att_def),
// що додаються і до атаки, і до захисту. Тут — які типи в яке число входять.
const COMBAT_COMPONENTS = {
  attAttacker: ['att_boost_attacker', 'att_def_boost_attacker', 'att_def_boost_attacker_defender'],
  defAttacker: ['def_boost_attacker', 'att_def_boost_attacker', 'att_def_boost_attacker_defender'],
  attDefender: ['att_boost_defender', 'att_def_boost_defender', 'att_def_boost_attacker_defender'],
  defDefender: ['def_boost_defender', 'att_def_boost_defender', 'att_def_boost_attacker_defender'],
};
const COMBAT_LABELS = {
  attAttacker: 'Атака — атакуюча армія',
  defAttacker: 'Захист — атакуюча армія',
  attDefender: 'Атака — оборонна армія',
  defDefender: 'Захист — оборонна армія',
};

// Зводить 4 бойові числа з карти сум по типах (режим "all").
function computeCombat(sumsAll) {
  const out = {};
  const usedTypes = new Set();
  for (const [key, types] of Object.entries(COMBAT_COMPONENTS)) {
    let total = 0;
    for (const t of types) {
      if (typeof sumsAll[t] === 'number') {
        total += sumsAll[t];
        usedTypes.add(t);
      }
    }
    out[key] = total;
  }
  // типи, які схожі на бойові, але не потрапили в жодне число — щоб не проґавити
  const leftover = Object.keys(sumsAll).filter(
    (t) => !usedTypes.has(t) && /(att|def).*(attacker|defender)/i.test(t)
  );
  return { out, leftover };
}

// guildId виду "ru11_17480" -> світ "ru11" -> адреса гри
function worldUrlFromGuildId(guildId) {
  const world = String(guildId || '').split('_')[0].trim();
  if (!world) return null;
  return `https://${world}.forgeofempires.com/`;
}

// Товари гравця: { назва: кількість }
function parseGoods(raw) {
  const map = raw?.resources?.resources || raw?.resources || null;
  return map && typeof map === 'object' && !Array.isArray(map) ? map : null;
}

export default function FoeSyncScreen() {
  const guildContext = useContext(GuildContext);
  const webRef = useRef(null);

  const [phase, setPhase] = useState('checking'); // checking | consent | game
  const [guildId, setGuildId] = useState(guildContext?.guildId || null);
  const [userId, setUserId] = useState(null);
  const [webKey, setWebKey] = useState(0);

  const [status, setStatus] = useState('Завантаження гри…');
  const [seen, setSeen] = useState(() => new Set());
  const [player, setPlayer] = useState(null);
  const [found, setFound] = useState({}); // { boosts, boostsStartup, goods, ... }
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [consent, storedUser, storedGuild] = await Promise.all([
        AsyncStorage.getItem(CONSENT_KEY),
        AsyncStorage.getItem('userId'),
        AsyncStorage.getItem('guildId'),
      ]);
      if (cancelled) return;
      setUserId(String(storedUser || '').trim() || null);
      setGuildId((prev) => prev || String(storedGuild || '').trim() || null);
      setPhase(consent === 'yes' ? 'game' : 'consent');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const gameUrl = useMemo(() => worldUrlFromGuildId(guildId), [guildId]);

  const acceptConsent = useCallback(async () => {
    await AsyncStorage.setItem(CONSENT_KEY, 'yes');
    setPhase('game');
  }, []);

  const onMessage = useCallback((event) => {
    let msg;
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch (_e) {
      return;
    }
    if (!msg || !msg.__foeSync) return;

    if (msg.kind === 'ready') {
      setStatus('Слухач працює. Увійдіть у гру, якщо потрібно…');
      return;
    }

    if (msg.kind === 'domBoosts') {
      setFound((prev) => ({ ...prev, domBoosts: msg }));
      return;
    }

    if (Array.isArray(msg.seen) && msg.seen.length) {
      setSeen((prev) => {
        const next = new Set(prev);
        msg.seen.forEach((s) => next.add(s));
        return next;
      });
    }

    if (msg.kind === 'data') {
      if (msg.player && msg.player.id) setPlayer(msg.player);
      if (msg.found && typeof msg.found === 'object') {
        setFound((prev) => ({ ...prev, ...msg.found }));
      }
      setStatus('Дані отримано. Можна зберегти.');
    }
  }, []);

  const goodsRaw = found.goods || null;
  const agg = found.boostAgg || found.boostStartupAgg || null;
  const goods = useMemo(() => parseGoods(goodsRaw), [goodsRaw]);
  const goodsEntries = useMemo(
    () => (goods ? Object.entries(goods).sort((a, b) => a[0].localeCompare(b[0])) : []),
    [goods]
  );

  // Об'єднуємо суми з усіх джерел бонусів: постійні + тимчасові + активні розхідники.
  const sumsAll = useMemo(() => {
    const merged = {};
    const add = (m) => {
      if (!m) return;
      for (const [k, v] of Object.entries(m)) merged[k] = (merged[k] || 0) + v;
    };
    add(found.boostAgg?.sumsAll);
    add(found.boostLimitedAgg?.sumsAll);
    add(found.boostTimerAgg?.sumsAll);
    if (!found.boostAgg) add(found.boostStartupAgg?.sumsAll);
    return merged;
  }, [found.boostAgg, found.boostLimitedAgg, found.boostTimerAgg, found.boostStartupAgg]);

  // Прицільні бонуси (targetedFeature ≠ all) — окремо, для звірки
  const sumsByFeature = useMemo(() => {
    const merged = {};
    for (const src of [found.boostAgg, found.boostLimitedAgg, found.boostTimerAgg]) {
      if (!src?.sumsByFeature) continue;
      for (const [k, v] of Object.entries(src.sumsByFeature)) merged[k] = (merged[k] || 0) + v;
    }
    return merged;
  }, [found.boostAgg, found.boostLimitedAgg, found.boostTimerAgg]);

  const sumsAllEntries = useMemo(
    () => Object.entries(sumsAll).sort((a, b) => b[1] - a[1]),
    [sumsAll]
  );
  // 4 бойові числа, зведені як у грі
  const combat = useMemo(() => computeCombat(sumsAll), [sumsAll]);
  const hasSomething =
    sumsAllEntries.length > 0 || (goods && Object.keys(goods).length > 0);

  const onSave = useCallback(async () => {
    if (!hasSomething) {
      Alert.alert('Ще нема що зберігати', 'Зачекайте, поки гра завантажиться повністю.');
      return;
    }
    setSaving(true);
    try {
      await saveFoeStats(guildId, userId, {
        player,
        boosts: { combat: combat.out, all: sumsAll, byFeature: agg?.sumsByFeature || {} },
        goods,
      });
      if (ToastAndroid?.show) ToastAndroid.show('Збережено у гільдію', ToastAndroid.SHORT);
      else Alert.alert('Готово', 'Дані збережено у гільдію.');
    } catch (e) {
      Alert.alert('Не вдалося зберегти', String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }, [hasSomething, guildId, userId, player, sumsAll, combat, agg, goods]);

  const onReload = useCallback(() => {
    setStatus('Перезавантаження гри…');
    setFound({});
    setPlayer(null);
    setWebKey((k) => k + 1);
  }, []);

  // --- Рендер ---

  if (phase === 'checking') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!gameUrl) {
    return (
      <View style={styles.centered}>
        <Text style={styles.body}>
          Не вдалося визначити ігровий світ. Переконайтесь, що гільдію обрано у застосунку.
        </Text>
      </View>
    );
  }

  if (phase === 'consent') {
    return (
      <ScrollView contentContainerStyle={styles.consentWrap}>
        <Text style={styles.title}>Синхронізація з грою</Text>
        <Text style={styles.body}>
          Деякі показники гра не віддає нікому, крім самого власника акаунта — це ваші
          бонуси атаки/захисту та вміст скарбниці. Щоб гільдія їх бачила, застосунок
          відкриє Forge of Empires від вашого імені й зчитає саме ці числа.
        </Text>
        <Text style={styles.body}>
          • Застосунок не робить власних запитів до сервера гри — лише читає те, що гра
          й так завантажує.{'\n'}
          • Пароль від гри не зберігається.{'\n'}
          • Дані бачить тільки ваша гільдія.{'\n'}
          • Оновлення відбувається лише коли ви самі відкриваєте цей екран або тиснете
          «Оновити».
        </Text>
        <Text style={styles.bodyMuted}>
          Зверніть увагу: використання сторонніх інструментів формально суперечить
          правилам InnoGames. Ви робите це на власний розсуд.
        </Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={acceptConsent}>
          <Text style={styles.primaryBtnText}>Погоджуюсь, продовжити</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  const seenList = Array.from(seen).sort();

  return (
    <View style={styles.container}>
      <WebView
        key={webKey}
        ref={webRef}
        source={{ uri: gameUrl }}
        style={styles.webview}
        userAgent={DESKTOP_UA}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        mixedContentMode="always"
        injectedJavaScriptBeforeContentLoaded={FOE_INTERCEPTOR_JS}
        injectedJavaScript={FOE_INTERCEPTOR_JS}
        onMessage={onMessage}
        onLoadStart={() => setStatus('Завантаження гри…')}
      />

      <View style={styles.panel}>
        <Text style={styles.status}>{status}  ·  v12</Text>

        <ScrollView style={styles.panelScroll} contentContainerStyle={{ paddingBottom: 8 }}>
          {player ? (
            <Text style={styles.kv}>
              Гравець: <Text style={styles.kvVal}>{player.name || '—'} (id {player.id})</Text>
            </Text>
          ) : null}

          <Text style={styles.section}>Бонуси (як у грі)</Text>
          {sumsAllEntries.length ? (
            Object.keys(COMBAT_COMPONENTS).map((k) => (
              <Text key={k} style={styles.kv}>
                {COMBAT_LABELS[k]}: <Text style={styles.kvVal}>{combat.out[k]}%</Text>
              </Text>
            ))
          ) : (
            <Text style={styles.kvMuted}>ще не знайдено</Text>
          )}
          {combat.leftover.length ? (
            <Text style={styles.kvMuted}>
              не враховано типів: {combat.leftover.join(', ')}
            </Text>
          ) : null}

          {sumsAllEntries.length ? (
            <>
              <Text style={styles.subSection}>складові (сума по типах, режим all):</Text>
              <Text style={styles.diag}>
                {sumsAllEntries.map(([t, v]) => `${t}: ${v}`).join('\n')}
              </Text>
            </>
          ) : null}

          {Object.keys(sumsByFeature).length ? (
            <>
              <Text style={styles.subSection}>ПРИЦІЛЬНІ (targetedFeature ≠ all):</Text>
              <Text style={styles.diag}>
                {Object.entries(sumsByFeature)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, v]) => `${k}: ${v}`)
                  .join('\n')}
              </Text>
            </>
          ) : (
            <Text style={styles.kvMuted}>прицільних бонусів немає</Text>
          )}

          <Text style={styles.subSection}>
            тимч.: {found.boostLimitedAgg?.count ?? 0} · таймер: {found.boostTimerAgg?.count ?? 0}
          </Text>

          {found.startupKeys ? (
            <>
              <Text style={styles.subSection}>StartupService.getData — ключі:</Text>
              <Text style={styles.diag}>{found.startupKeys.join('\n')}</Text>
            </>
          ) : (
            <Text style={styles.kvMuted}>стартовий пакет ще не спіймано</Text>
          )}

          {found.domBoosts ? (
            <>
              <Text style={styles.subSection}>
                з екрана гри (вікно: {found.domBoosts.hasWindow ? 'так' : 'ні'}):
              </Text>
              <Text style={styles.diag}>
                {(found.domBoosts.pct || [])
                  .map((h) => `${h.v}  ← ${h.ctx}`)
                  .join('\n')
                  .slice(0, 1800)}
              </Text>
              {found.domBoosts.winText ? (
                <>
                  <Text style={styles.subSection}>текст вікна:</Text>
                  <Text style={styles.diag}>{found.domBoosts.winText}</Text>
                </>
              ) : null}
            </>
          ) : null}

          {found.cityGBs ? (
            <>
              <Text style={styles.subSection}>Всі ВС міста: {found.cityGBs.length}</Text>
              <Text style={styles.diag}>
                {found.cityGBs
                  .map(
                    (g) =>
                      `${g.id} L${g.level}\n  bonus=${JSON.stringify(g.bonus)}` +
                      (g.bonuses ? `\n  bonuses=${JSON.stringify(g.bonuses)}` : '')
                  )
                  .join('\n')}
              </Text>
            </>
          ) : null}

          {found.gbHint ? (
            <>
              <Text style={styles.subSection}>Величні споруди (з {found.gbHint.from}):</Text>
              <Text style={styles.diag}>
                {JSON.stringify(found.gbHint.sample, null, 1).slice(0, 2000)}
              </Text>
            </>
          ) : null}

          {found.armyInfo ? (
            <>
              <Text style={styles.subSection}>Управління армією ({found.armyInfo.from}):</Text>
              <Text style={styles.diag}>
                {JSON.stringify(found.armyInfo.data, null, 1).slice(0, 2500)}
              </Text>
            </>
          ) : null}

          {agg ? (
            <>
              <Text style={styles.subSection}>
                всього рядків бонусів: {agg.count}
                {found.boostRawLength != null ? ` (у пакеті ${found.boostRawLength})` : ''}
              </Text>
              <Text style={styles.subSection}>джерела:</Text>
              <Text style={styles.diag}>
                {Object.entries(agg.originCounts || {})
                  .map(([o, c]) => `${o}: ${c}`)
                  .join('\n')}
              </Text>
              <Text style={styles.subSection}>типи (кількість рядків):</Text>
              <Text style={styles.diag}>
                {Object.entries(agg.typeCounts || {})
                  .map(([t, c]) => `${t}: ${c}`)
                  .join('\n')}
              </Text>
              {Object.keys(agg.sumsByFeature || {}).length ? (
                <>
                  <Text style={styles.subSection}>прицільні режими:</Text>
                  <Text style={styles.diag}>
                    {Object.entries(agg.sumsByFeature)
                      .map(([k, v]) => `${k}: ${v}%`)
                      .join('\n')}
                  </Text>
                </>
              ) : null}
              <Text style={styles.subSection}>приклади рядків:</Text>
              <Text style={styles.diag}>
                {JSON.stringify(agg.sample || [], null, 1).slice(0, 2500)}
              </Text>
            </>
          ) : null}

          <Text style={styles.section}>Власні товари</Text>
          {goods ? (
            <>
              <Text style={styles.kvMuted}>{goodsEntries.length} позицій</Text>
              {goodsEntries.map(([name, qty]) => (
                <Text key={name} style={styles.kv}>
                  {name}: <Text style={styles.kvVal}>{String(qty)}</Text>
                </Text>
              ))}
            </>
          ) : (
            <Text style={styles.kvMuted}>ще не знайдено</Text>
          )}

          {seenList.length ? (
            <>
              <Text style={styles.section}>Пакети гри (діагностика)</Text>
              <Text style={styles.diag}>{seenList.join('\n')}</Text>
            </>
          ) : null}
        </ScrollView>

        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={onReload}>
            <Text style={styles.secondaryBtnText}>Оновити</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryBtn, (!hasSomething || saving) && styles.btnDisabled]}
            onPress={onSave}
            disabled={!hasSomething || saving}
          >
            <Text style={styles.primaryBtnText}>
              {saving ? 'Збереження…' : 'Зберегти у гільдію'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: COLORS.background,
  },
  webview: { flex: 1 },

  consentWrap: { padding: 20, backgroundColor: COLORS.background, flexGrow: 1 },
  title: { color: COLORS.textPrimary, fontSize: 20, fontWeight: '700', marginBottom: 14 },
  body: { color: COLORS.textPrimary, fontSize: 15, lineHeight: 22, marginBottom: 14 },
  bodyMuted: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 20 },

  panel: {
    maxHeight: 340,
    borderTopWidth: 1,
    borderTopColor: COLORS.separator,
    backgroundColor: COLORS.surface,
    padding: 12,
  },
  panelScroll: { maxHeight: 220 },
  status: { color: COLORS.primary, fontSize: 13, marginBottom: 8 },
  section: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 10,
    marginBottom: 4,
  },
  subSection: { color: COLORS.textSecondary, fontSize: 11, marginTop: 8, marginBottom: 2 },
  kv: { color: COLORS.textPrimary, fontSize: 14, lineHeight: 20 },
  kvVal: { color: COLORS.success, fontWeight: '700' },
  kvMuted: { color: COLORS.textSecondary, fontSize: 13, fontStyle: 'italic' },
  diag: { color: COLORS.textSecondary, fontSize: 11, fontFamily: 'monospace', lineHeight: 15 },

  btnRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  primaryBtn: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#00121f', fontSize: 15, fontWeight: '700' },
  secondaryBtn: {
    paddingHorizontal: 18,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.separator,
  },
  secondaryBtnText: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '600' },
  btnDisabled: { opacity: 0.4 },
});
