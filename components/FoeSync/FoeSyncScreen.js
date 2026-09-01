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

// 4 бойові показники. Ключ бонуса -> у які з них він додається.
// Розбираємо назву типу за складниками (att / def / attacker / defender),
// тому працює для будь-якого набору, а не лише відомих рядків.
const STATS = ['attAttacker', 'defAttacker', 'attDefender', 'defDefender'];
const COMBAT_LABELS = {
  attAttacker: 'Атака — атакуюча армія',
  defAttacker: 'Захист — атакуюча армія',
  attDefender: 'Атака — оборонна армія',
  defDefender: 'Захист — оборонна армія',
};

// Явна таблиця для типів з getAllBoosts (att/def + спільні att_def).
const GETALL_MAP = {
  att_boost_attacker: ['attAttacker'],
  def_boost_attacker: ['defAttacker'],
  att_boost_defender: ['attDefender'],
  def_boost_defender: ['defDefender'],
  att_def_boost_attacker: ['attAttacker', 'defAttacker'],
  att_def_boost_defender: ['attDefender', 'defDefender'],
  att_def_boost_attacker_defender: STATS,
};

// Бонуси Величних споруд (поле bonus кожної ВС) — за ТИПОМ бонуса, не за назвою
// споруди. Значення округлюється вниз. У getAllBoosts цих бонусів немає.
const GB_MAP = {
  military_boost: ['attAttacker', 'defAttacker'],
  fierce_resistance: ['attDefender', 'defDefender'],
  advanced_tactics: STATS,
};
// типи ВС, що НЕ входять у 4 показники (окрема статистика)
const GB_IGNORE = /crit|first_strike|contribution|double_collection|spoils|diplomat|algorithm|missile|tactics_?boost$/i;

const empty = () => ({ attAttacker: 0, defAttacker: 0, attDefender: 0, defDefender: 0 });
const addInto = (dst, keys, v) => keys.forEach((k) => { dst[k] += v; });

// sumsAll: { type: сума } (targetedFeature "all")
// sumsByFeature: { "type | feature": сума }
// cityGBs: [{ id, bonus:{type,value,targetedFeature} }]
function computeCombat(sumsAll, sumsByFeature, cityGBs) {
  const base = empty();
  const feat = {}; // feature -> stats (додатки понад базу)
  const getFeat = (f) => (feat[f] || (feat[f] = empty()));
  const unknown = [];

  // getAllBoosts, режим "all"
  for (const [type, sum] of Object.entries(sumsAll || {})) {
    const keys = GETALL_MAP[type];
    if (keys) addInto(base, keys, sum);
    else if (/(att|def).*(attacker|defender)/i.test(type)) unknown.push(`all:${type}`);
  }
  // getAllBoosts, прицільні режими
  for (const [k, sum] of Object.entries(sumsByFeature || {})) {
    const [type, f] = k.split(' | ');
    const keys = GETALL_MAP[type];
    if (keys) addInto(getFeat(f), keys, sum);
    else if (/(att|def).*(attacker|defender)/i.test(type)) unknown.push(`${f}:${type}`);
  }

  // Величні споруди
  let gbTotal = 0;
  for (const g of cityGBs || []) {
    const b = g.bonus;
    if (!b || b.__class__ !== 'GreatBuildingUnitBonus' || typeof b.value !== 'number') continue;
    const keys = GB_MAP[b.type];
    if (!keys) {
      if (!GB_IGNORE.test(String(b.type || ''))) unknown.push(`ВС ${g.id}:${b.type}`);
      continue;
    }
    const v = Math.floor(b.value);
    const target = b.targetedFeature && b.targetedFeature !== 'all' ? getFeat(b.targetedFeature) : base;
    addInto(target, keys, v);
    if (target === base) gbTotal += v;
  }

  // контекстні підсумки: база + відповідний прицільний набір
  const withFeat = (f) => {
    const o = { ...base };
    const d = feat[f];
    if (d) STATS.forEach((k) => { o[k] += d[k]; });
    return o;
  };
  const contexts = {
    general: base,
    battleground: withFeat('battleground'),
    guild_expedition: withFeat('guild_expedition'),
  };
  // Кванти/рейди — незалежний набір (базу НЕ додаємо)
  const quantum = feat['quantum_incursions'] || feat['guild_raids'] || null;

  return { base, contexts, quantum, feat, unknown, gbTotal };
}

// guildId виду "ru11_17480" -> світ "ru11".
function worldIdFromGuildId(guildId) {
  const world = String(guildId || '').split('_')[0].trim();
  return world || null;
}

// Пряме відкриття гри потрібного світу. За наявності збереженої сесії гра
// відкриється одразу (минаючи вхід і вибір світу). Без сесії гра сама
// перекине на сторінку входу.
function gameUrlFromGuildId(guildId) {
  const world = worldIdFromGuildId(guildId);
  return world ? `https://${world}.forgeofempires.com/game/index?` : null;
}

// Людські назви основних ресурсів. Усе інше вважаємо товаром.
const RES_LABELS = {
  money: 'Монети',
  supplies: 'Припаси',
  medals: 'Медалі',
  premium: 'Діаманти',
  strategy_points: 'Очки Форджа (ВП)',
  total_battlepoints: 'Бойові бали',
  clan_power: 'Сила гільдії',
  icarus_feathers: 'Пір’я Ікара',
  rogue: 'Розбійники',
};

// Форматує карту {ресурс: кількість} у рядки: спершу валюти, потім товари.
function formatResources(map) {
  const entries = Object.entries(map || {}).filter(([, v]) => v);
  if (!entries.length) return '—';
  const known = entries
    .filter(([k]) => RES_LABELS[k])
    .sort((a, b) => Object.keys(RES_LABELS).indexOf(a[0]) - Object.keys(RES_LABELS).indexOf(b[0]));
  const goods = entries.filter(([k]) => !RES_LABELS[k]).sort((a, b) => b[1] - a[1]);
  const line = ([k, v]) => `${RES_LABELS[k] || k}: ${Number(v).toLocaleString('uk')}`;
  const out = known.map(line);
  if (goods.length) {
    out.push('— Товари —');
    out.push(...goods.map(line));
  }
  return out.join('\n');
}

// Виробничі бонуси з getAllBoosts множать базову продукцію певних ресурсів.
// final = floor(base * (1 + boost%/100)). Медалі/діаманти/ВП — без множника.
const PROD_MULT_BY_RES = {
  money: 'coin_production',
  supplies: 'supply_production',
};
const GOODS_BOOST_KEY = 'goods_production';

function applyMultiplier(map, sumsAll) {
  const out = {};
  for (const [res, amt] of Object.entries(map)) {
    let pct = 0;
    if (PROD_MULT_BY_RES[res]) pct = Number(sumsAll[PROD_MULT_BY_RES[res]]) || 0;
    else if (!RES_LABELS[res]) pct = Number(sumsAll[GOODS_BOOST_KEY]) || 0; // товари
    out[res] = pct ? Math.floor(amt * (1 + pct / 100)) : amt;
  }
  return out;
}

// Зводить продукцію будівель у підсумок. buildings: [{id,type,st,ready,det,rnd}]
function computeCollection(buildings, sumsAll) {
  const readyBase = {};
  const pendingBase = {};
  let randomCount = 0;
  for (const b of buildings || []) {
    const det = b.det || {};
    const target = b.ready ? readyBase : pendingBase;
    for (const [k, v] of Object.entries(det)) target[k] = (target[k] || 0) + v;
    if (b.rnd) randomCount += 1;
  }
  return {
    ready: applyMultiplier(readyBase, sumsAll || {}),
    pending: applyMultiplier(pendingBase, sumsAll || {}),
    readyBase,
    randomCount,
  };
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
  const [currentUrl, setCurrentUrl] = useState('');
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

  const gameUrl = useMemo(() => gameUrlFromGuildId(guildId), [guildId]);

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

    if (msg.kind === 'url') {
      setCurrentUrl(String(msg.url || ''));
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
  // Бойові показники: база + контексти (ПБГ, Виправа) + кванти (окремо)
  const combat = useMemo(
    () => computeCombat(sumsAll, sumsByFeature, found.cityGBs),
    [sumsAll, sumsByFeature, found.cityGBs]
  );
  const hasSomething =
    sumsAllEntries.length > 0 || (goods && Object.keys(goods).length > 0);

  const onSave = useCallback(async () => {
    if (!hasSomething) {
      Alert.alert('Ще нема що зберігати', 'Зачекайте, поки гра завантажиться повністю.');
      return;
    }
    setSaving(true);
    try {
      const col = found.prodBuildings ? computeCollection(found.prodBuildings, sumsAll) : null;
      await saveFoeStats(guildId, userId, {
        player,
        boosts: {
          general: combat.base,
          contexts: combat.contexts,
          quantum: combat.quantum,
          featureDeltas: combat.feat,
        },
        goods,
        collection: col ? { ready: col.ready, pending: col.pending } : null,
      });
      if (ToastAndroid?.show) ToastAndroid.show('Збережено у гільдію', ToastAndroid.SHORT);
      else Alert.alert('Готово', 'Дані збережено у гільдію.');
    } catch (e) {
      Alert.alert('Не вдалося зберегти', String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }, [hasSomething, guildId, userId, player, combat, goods, found.prodBuildings]);

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
        onLoadStart={(e) => {
          setStatus('Завантаження гри…');
          if (e?.nativeEvent?.url) setCurrentUrl(e.nativeEvent.url);
        }}
        onNavigationStateChange={(s) => {
          if (s?.url) setCurrentUrl(s.url);
        }}
      />

      <View style={styles.panel}>
        <Text style={styles.status}>{status}  ·  v26</Text>
        <Text style={styles.urlBar} numberOfLines={1} ellipsizeMode="middle">
          {currentUrl || '—'}
        </Text>

        <ScrollView style={styles.panelScroll} contentContainerStyle={{ paddingBottom: 8 }}>
          {player ? (
            <Text style={styles.kv}>
              Гравець: <Text style={styles.kvVal}>{player.name || '—'} (id {player.id})</Text>
            </Text>
          ) : null}

          <Text style={styles.section}>Бонуси — загальні (як у грі)</Text>
          {sumsAllEntries.length ? (
            STATS.map((k) => (
              <Text key={k} style={styles.kv}>
                {COMBAT_LABELS[k]}: <Text style={styles.kvVal}>{combat.base[k]}%</Text>
              </Text>
            ))
          ) : (
            <Text style={styles.kvMuted}>ще не знайдено</Text>
          )}
          <Text style={styles.kvMuted}>з них Величні споруди: +{combat.gbTotal}</Text>
          {combat.unknown.length ? (
            <Text style={styles.kvMuted}>не враховано: {combat.unknown.join(', ')}</Text>
          ) : null}

          {Object.keys(combat.feat).length ? (
            <>
              <Text style={styles.section}>Прицільні режими (додаток до загальних)</Text>
              {Object.entries(combat.feat).map(([f, d]) => (
                <Text key={f} style={styles.diag}>
                  {f}: {STATS.map((k) => `${k}+${d[k]}`).join('  ')}
                </Text>
              ))}
              <Text style={styles.subSection}>ПБГ (battleground):</Text>
              {STATS.map((k) => (
                <Text key={k} style={styles.kv}>
                  {COMBAT_LABELS[k]}: <Text style={styles.kvVal}>{combat.contexts.battleground[k]}%</Text>
                </Text>
              ))}
              <Text style={styles.subSection}>Виправа (guild_expedition):</Text>
              {STATS.map((k) => (
                <Text key={k} style={styles.kv}>
                  {COMBAT_LABELS[k]}: <Text style={styles.kvVal}>{combat.contexts.guild_expedition[k]}%</Text>
                </Text>
              ))}
              {combat.quantum ? (
                <>
                  <Text style={styles.subSection}>Кванти/рейди (окремо, без бази):</Text>
                  {STATS.map((k) => (
                    <Text key={k} style={styles.kv}>
                      {COMBAT_LABELS[k]}: <Text style={styles.kvVal}>{combat.quantum[k]}%</Text>
                    </Text>
                  ))}
                </>
              ) : null}
            </>
          ) : null}

          {found.prodBuildings ? (() => {
            const col = computeCollection(found.prodBuildings, sumsAll);
            const readyLines = formatResources(col.ready);
            const pendingLines = formatResources(col.pending);
            return (
              <>
                <Text style={styles.section}>ЗБІР З МІСТА</Text>
                {readyLines.split('\n').map((ln, i) => (
                  <Text key={i} style={ln.startsWith('—') ? styles.subSection : styles.kv}>
                    {ln.startsWith('—') ? ln : (() => {
                      const [name, val] = ln.split(': ');
                      return <>{name}: <Text style={styles.kvVal}>{val}</Text></>;
                    })()}
                  </Text>
                ))}
                {pendingLines !== '—' ? (
                  <>
                    <Text style={styles.subSection}>ще виробляється (буде пізніше):</Text>
                    <Text style={styles.diag}>{pendingLines}</Text>
                  </>
                ) : null}
                <Text style={styles.subSection}>виробничі бонуси (для множника):</Text>
                <Text style={styles.diag}>
                  {['coin_production', 'supply_production', 'goods_production', 'special_goods_production', 'forge_points_production', 'medal_production']
                    .map((t) => `${t}: ${sumsAll[t] ?? '—'}`)
                    .join('\n')}
                  {'\n'}настрій: {JSON.stringify(found.happiness || {})}
                </Text>
                {Object.keys(found.prodUnknownStates || {}).length ? (
                  <Text style={styles.kvMuted}>
                    не розібрано: {Object.entries(found.prodUnknownStates).map(([s, c]) => `${s}:${c}`).join(' ')}
                  </Text>
                ) : null}
              </>
            );
          })() : null}

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
  status: { color: COLORS.primary, fontSize: 13, marginBottom: 4 },
  urlBar: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontFamily: 'monospace',
    marginBottom: 8,
    backgroundColor: COLORS.background,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
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
