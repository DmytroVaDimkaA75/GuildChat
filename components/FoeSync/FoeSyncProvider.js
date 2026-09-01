// components/FoeSync/FoeSyncProvider.js
//
// Єдиний "двигун" синхронізації з грою. Тримає прихований WebView з Forge of
// Empires, слухач (foeInterceptor) ловить пакети, тут же збираються всі дані
// (бонуси, збір, мапа, іконки). Монтується один раз високо в дереві
// (MainContent), тож працює у фоні на всіх екранах.
//
// Вікно гри показується ("webVisible") лише коли треба руками увійти в гру
// (автоперехід не впорався). Зазвичай — невидиме.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';

import { GuildContext } from '../../GuildContext';
import { FOE_INTERCEPTOR_JS } from './foeInterceptor';
import { FOE_CONSENT_KEY } from './foeConsent';
import { saveFoeStats } from '../../src/services/foeStats';
import { loadCachedIconSheet, fetchIconSheet } from './FoeIcon';
import { getBuildingDefs } from '../../src/services/foeBuildings';

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const worldIdFromGuildId = (g) => String(g || '').split('_')[0].trim() || null;
const gameUrlFromGuildId = (g) => {
  const w = worldIdFromGuildId(g);
  return w ? `https://${w}.forgeofempires.com/game/index?` : null;
};

const Ctx = createContext(null);
export const useFoeSync = () => useContext(Ctx);

export function FoeSyncProvider({ children }) {
  const guildContext = useContext(GuildContext);

  const [guildId, setGuildId] = useState(guildContext?.guildId || null);
  const [userId, setUserId] = useState(null);
  const [consent, setConsent] = useState(null); // null | 'yes' | 'no'
  const [webKey, setWebKey] = useState(0);
  const [webVisible, setWebVisible] = useState(false);

  const [currentUrl, setCurrentUrl] = useState('');
  const [health, setHealth] = useState({ ready: false, packets: 0, lastAt: 0 });
  const [player, setPlayer] = useState(null);
  const [found, setFound] = useState({});
  const [seen, setSeen] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [iconSheet, setIconSheet] = useState(null);
  const [buildingDefs, setBuildingDefs] = useState(null);
  const [defsProgress, setDefsProgress] = useState(null);

  const iconSheetUrlsRef = useRef(null);
  const defsLoadingRef = useRef(false);
  const healthRef = useRef(health);
  healthRef.current = health;
  const currentUrlRef = useRef(currentUrl);
  currentUrlRef.current = currentUrl;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [c, u, g, sheet] = await Promise.all([
        AsyncStorage.getItem(FOE_CONSENT_KEY),
        AsyncStorage.getItem('userId'),
        AsyncStorage.getItem('guildId'),
        loadCachedIconSheet(),
      ]);
      if (cancelled) return;
      setConsent(c === 'yes' ? 'yes' : 'no');
      setUserId(String(u || '').trim() || null);
      setGuildId((prev) => prev || String(g || '').trim() || null);
      if (sheet) setIconSheet(sheet);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // GuildContext може оновитись пізніше
  useEffect(() => {
    if (guildContext?.guildId) setGuildId(guildContext.guildId);
  }, [guildContext?.guildId]);

  const gameUrl = useMemo(() => gameUrlFromGuildId(guildId), [guildId]);
  const injectedJs =
    `window.__FOE_WORLD=${JSON.stringify(worldIdFromGuildId(guildId) || '')};\n${FOE_INTERCEPTOR_JS}`;

  const acceptConsent = useCallback(async () => {
    try {
      await AsyncStorage.setItem(FOE_CONSENT_KEY, 'yes');
    } catch (_e) {
      /* не критично */
    }
    setConsent('yes');
  }, []);

  const reload = useCallback(() => {
    setFound({});
    setPlayer(null);
    setSeen(new Set());
    setHealth({ ready: false, packets: 0, lastAt: 0 });
    setWebKey((k) => k + 1);
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
      setHealth((h) => ({ ...h, ready: true }));
      return;
    }
    if (msg.kind === 'packet') {
      setHealth((h) => ({ ...h, ready: true, packets: msg.n, lastAt: Date.now() }));
      return;
    }
    if (msg.kind === 'url') {
      setCurrentUrl(String(msg.url || ''));
      return;
    }
    if (msg.kind === 'domBoosts') {
      setFound((p) => ({ ...p, domBoosts: msg }));
      return;
    }
    if (msg.kind === 'worldSelectDump') {
      setFound((p) => ({ ...p, worldSelectDump: msg }));
      return;
    }
    if (msg.kind === 'buildingLookup' && msg.url) {
      setFound((p) => ({ ...p, buildingLookupUrl: msg.url, metaExample: msg.metaExample }));
      return;
    }
    if (msg.kind === 'goodsSheet' && msg.png && msg.json) {
      setFound((p) => ({ ...p, goodsSheet: { png: msg.png, json: msg.json } }));
      return;
    }
    if (msg.kind === 'iconSheet' && msg.png && msg.json) {
      const key = msg.png + '|' + msg.json;
      if (iconSheetUrlsRef.current !== key) {
        iconSheetUrlsRef.current = key;
        fetchIconSheet(msg.png, msg.json).then(setIconSheet).catch(() => {});
      }
      return;
    }
    if (msg.kind === 'assets' && Array.isArray(msg.urls)) {
      setFound((p) => ({
        ...p,
        assetUrls: Array.from(new Set([...(p.assetUrls || []), ...msg.urls])),
      }));
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
    }
  }, []);

  // Довантаження визначень будівель для мапи
  useEffect(() => {
    const cids = found.cityMap?.entities?.map((e) => e.cid).filter(Boolean);
    if (!cids || !cids.length || defsLoadingRef.current) return;
    defsLoadingRef.current = true;
    getBuildingDefs(cids, found.buildingLookupUrl, (d, t) => setDefsProgress(`${d} / ${t}`))
      .then((d) => {
        setBuildingDefs(d);
        setDefsProgress(null);
      })
      .catch(() => setDefsProgress('помилка'))
      .finally(() => {
        defsLoadingRef.current = false;
      });
  }, [found.cityMap, found.buildingLookupUrl]);

  // Якщо застрягли на сторінці входу порталу — показати вікно для ручного входу
  useEffect(() => {
    if (health.packets > 0) {
      setWebVisible(false);
      return;
    }
    if (!/forgeofempires\.com\/(page|game)/.test(currentUrl || '')) return;
    const t = setTimeout(() => {
      if (healthRef.current.packets === 0 && /\/page/.test(currentUrlRef.current || '')) {
        setWebVisible(true);
      }
    }, 15000);
    return () => clearTimeout(t);
  }, [currentUrl, health.packets]);

  const saveToGuild = useCallback(
    async (payload) => {
      setSaving(true);
      try {
        await saveFoeStats(guildId, userId, payload);
        return true;
      } finally {
        setSaving(false);
      }
    },
    [guildId, userId]
  );

  const value = {
    guildId,
    userId,
    consent,
    acceptConsent,
    reload,
    webVisible,
    setWebVisible,
    currentUrl,
    health,
    synced: health.packets > 0,
    player,
    found,
    seen,
    iconSheet,
    buildingDefs,
    defsProgress,
    saving,
    saveToGuild,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {consent === 'yes' && gameUrl ? (
        <View
          pointerEvents={webVisible ? 'auto' : 'none'}
          style={
            webVisible
              ? {
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 9999,
                  backgroundColor: '#0f1115',
                }
              : { position: 'absolute', width: 1, height: 1, opacity: 0, top: -10 }
          }
        >
          {webVisible ? (
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingHorizontal: 14,
                paddingVertical: 10,
                backgroundColor: '#152330',
              }}
            >
              <Text style={{ color: '#f4f7fb', fontWeight: '700' }}>Вхід у гру</Text>
              <TouchableOpacity onPress={() => setWebVisible(false)}>
                <Text style={{ color: '#4ea1ff', fontWeight: '700' }}>Готово</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <WebView
            key={webKey}
            source={{ uri: gameUrl }}
            style={{ flex: 1 }}
            userAgent={DESKTOP_UA}
            javaScriptEnabled
            domStorageEnabled
            thirdPartyCookiesEnabled
            sharedCookiesEnabled
            mixedContentMode="always"
            injectedJavaScriptBeforeContentLoaded={injectedJs}
            injectedJavaScript={injectedJs}
            onMessage={onMessage}
          />
        </View>
      ) : null}
    </Ctx.Provider>
  );
}
