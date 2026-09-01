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

// Військові бонуси: тип у грі -> стабільний ключ + людська назва.
// Гра віддає кожен внесок окремим рядком, тому значення треба ДОДАВАТИ.
const BOOST_TYPES = {
  att_boost_attacker: { key: 'attAttacker', label: 'Атака під час нападу' },
  def_boost_attacker: { key: 'defAttacker', label: 'Захист під час нападу' },
  att_boost_defender: { key: 'attDefender', label: 'Атака під час оборони' },
  def_boost_defender: { key: 'defDefender', label: 'Захист під час оборони' },
};
const BOOST_ORDER = ['attAttacker', 'defAttacker', 'attDefender', 'defDefender'];
const BOOST_LABEL_BY_KEY = Object.fromEntries(
  Object.values(BOOST_TYPES).map((d) => [d.key, d.label])
);

// guildId виду "ru11_17480" -> світ "ru11" -> адреса гри
function worldUrlFromGuildId(guildId) {
  const world = String(guildId || '').split('_')[0].trim();
  if (!world) return null;
  return `https://${world}.forgeofempires.com/`;
}

// Сумуємо військові бонуси з сирих даних BoostService.getAllBoosts.
// Повертає:
//   base    — { attAttacker, defAttacker, ... } сума внесків із targetedFeature = "all"
//   targeted — { "<key> · <feature>": сума } внески, прицільні на окремі режими (GBG, ГЕ тощо)
function parseMilitaryBoosts(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.boosts) ? raw.boosts : [];
  const base = {};
  const targeted = {};
  for (const it of list) {
    if (!it || typeof it.value !== 'number') continue;
    const def = BOOST_TYPES[String(it.type || '')];
    if (!def) continue;
    const feat = it.targetedFeature || 'all';
    if (feat === 'all') {
      base[def.key] = (base[def.key] || 0) + it.value;
    } else {
      const k = `${def.key} · ${feat}`;
      targeted[k] = (targeted[k] || 0) + it.value;
    }
  }
  return { base, targeted };
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

  const boostsRaw = found.boosts || found.boostsStartup || null;
  const goodsRaw = found.goods || null;
  const boosts = useMemo(() => parseMilitaryBoosts(boostsRaw), [boostsRaw]);
  const goods = useMemo(() => parseGoods(goodsRaw), [goodsRaw]);
  const goodsEntries = useMemo(
    () => (goods ? Object.entries(goods).sort((a, b) => a[0].localeCompare(b[0])) : []),
    [goods]
  );
  const hasSomething =
    Object.keys(boosts.base).length > 0 || (goods && Object.keys(goods).length > 0);

  const onSave = useCallback(async () => {
    if (!hasSomething) {
      Alert.alert('Ще нема що зберігати', 'Зачекайте, поки гра завантажиться повністю.');
      return;
    }
    setSaving(true);
    try {
      await saveFoeStats(guildId, userId, {
        player,
        boosts: { ...boosts.base, targeted: boosts.targeted },
        goods,
      });
      if (ToastAndroid?.show) ToastAndroid.show('Збережено у гільдію', ToastAndroid.SHORT);
      else Alert.alert('Готово', 'Дані збережено у гільдію.');
    } catch (e) {
      Alert.alert('Не вдалося зберегти', String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }, [hasSomething, guildId, userId, player, boosts, goods]);

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
        <Text style={styles.status}>{status}</Text>

        <ScrollView style={styles.panelScroll} contentContainerStyle={{ paddingBottom: 8 }}>
          {player ? (
            <Text style={styles.kv}>
              Гравець: <Text style={styles.kvVal}>{player.name || '—'} (id {player.id})</Text>
            </Text>
          ) : null}

          <Text style={styles.section}>Бонуси</Text>
          {Object.keys(boosts.base).length ? (
            BOOST_ORDER.filter((k) => boosts.base[k] != null).map((k) => (
              <Text key={k} style={styles.kv}>
                {BOOST_LABEL_BY_KEY[k]}: <Text style={styles.kvVal}>{boosts.base[k]}%</Text>
              </Text>
            ))
          ) : (
            <Text style={styles.kvMuted}>військові бонуси не розпізнано</Text>
          )}
          {Object.keys(boosts.targeted).length ? (
            <>
              <Text style={styles.subSection}>прицільні (окремі режими)</Text>
              {Object.entries(boosts.targeted).map(([k, v]) => (
                <Text key={k} style={styles.diag}>
                  {k}: {v}%
                </Text>
              ))}
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
