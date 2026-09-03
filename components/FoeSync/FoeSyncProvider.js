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
import { useTranslation } from 'react-i18next';
import { WebView } from 'react-native-webview';

import { GuildContext } from '../../GuildContext';
import { FOE_INTERCEPTOR_JS } from './foeInterceptor';
import { FOE_CONSENT_KEY } from './foeConsent';
import {
  loadCachedIconSheet,
  fetchIconSheet,
  loadCachedGoodsSheet,
  fetchGoodsSheet,
} from './FoeIcon';
import { getBuildingDefs } from '../../src/services/foeBuildings';

const {
  normalizeEra,
  normalizeLocale,
  resolveRequestedBuildingEra,
} = require('../../src/services/foeBuildingMetadata');

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
  const { i18n } = useTranslation();

  const [guildId, setGuildId] = useState(guildContext?.guildId || null);
  const [userId, setUserId] = useState(null);
  const [consent, setConsent] = useState(null); // null | 'yes' | 'no'
  const [webKey, setWebKey] = useState(0);
  const [webVisible, setWebVisible] = useState(false);
  // Коли вікно гри відкрив користувач вручну — не згортати його автоматично
  // після першого пакета (треба встигнути зробити щось у грі).
  const [keepWebOpen, setKeepWebOpen] = useState(false);
  const keepWebOpenRef = useRef(false);
  keepWebOpenRef.current = keepWebOpen;
  const openGameWindow = useCallback(() => { setKeepWebOpen(true); setWebVisible(true); }, []);
  const closeGameWindow = useCallback(() => { setKeepWebOpen(false); setWebVisible(false); }, []);

  const [currentUrl, setCurrentUrl] = useState('');
  const [health, setHealth] = useState({ ready: false, packets: 0, lastAt: 0 });
  const [player, setPlayer] = useState(null);
  const [found, setFound] = useState({});
  const [seen, setSeen] = useState(() => new Set());
  const [iconSheet, setIconSheet] = useState(null);
  const [goodsSheet, setGoodsSheet] = useState(null);
  const [buildingDefs, setBuildingDefs] = useState(null);
  const [defsProgress, setDefsProgress] = useState(null);

  const iconSheetUrlsRef = useRef(null);
  const goodsSheetUrlsRef = useRef(null);
  const guildIdRef = useRef(guildContext?.guildId || null);
  const defsRequestRef = useRef(0);
  const defsScopeRef = useRef(null);
  const relevantDirectUrlsRef = useRef({ signature: '', map: {} });
  const healthRef = useRef(health);
  healthRef.current = health;
  const currentUrlRef = useRef(currentUrl);
  currentUrlRef.current = currentUrl;

  const clearCapturedState = useCallback(() => {
    defsRequestRef.current += 1;
    defsScopeRef.current = null;
    setCurrentUrl('');
    setHealth({ ready: false, packets: 0, lastAt: 0 });
    setPlayer(null);
    setFound({});
    setSeen(new Set());
    setBuildingDefs(null);
    setDefsProgress(null);
    setWebVisible(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [c, u, g, sheet, gSheet] = await Promise.all([
        AsyncStorage.getItem(FOE_CONSENT_KEY),
        AsyncStorage.getItem('userId'),
        AsyncStorage.getItem('guildId'),
        loadCachedIconSheet(),
        loadCachedGoodsSheet(),
      ]);
      if (cancelled) return;
      setConsent(c === 'yes' ? 'yes' : 'no');
      setUserId(String(u || '').trim() || null);
      const storedGuildId = String(g || '').trim() || null;
      if (!guildIdRef.current && storedGuildId) {
        guildIdRef.current = storedGuildId;
        setGuildId(storedGuildId);
      }
      if (sheet) setIconSheet(sheet);
      if (gSheet) setGoodsSheet(gSheet);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // GuildContext може оновитись пізніше
  useEffect(() => {
    const nextGuildId = String(guildContext?.guildId || '').trim() || null;
    if (!nextGuildId || nextGuildId === guildIdRef.current) return;
    const hadPreviousGuild = !!guildIdRef.current;
    guildIdRef.current = nextGuildId;
    setGuildId(nextGuildId);
    if (hadPreviousGuild) {
      clearCapturedState();
      setWebKey((key) => key + 1);
    }
  }, [clearCapturedState, guildContext?.guildId]);

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
    clearCapturedState();
    setWebKey((k) => k + 1);
  }, [clearCapturedState]);

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
    if (msg.kind === 'buildingUrls' && msg.map && typeof msg.map === 'object') {
      setFound((p) => ({ ...p, buildingUrls: { ...(p.buildingUrls || {}), ...msg.map } }));
      return;
    }
    if (msg.kind === 'goodsSheet' && msg.png && msg.json) {
      const key = msg.png + '|' + msg.json;
      if (goodsSheetUrlsRef.current !== key) {
        goodsSheetUrlsRef.current = key;
        fetchGoodsSheet(msg.png, msg.json).then(setGoodsSheet).catch(() => {});
      }
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

  const playerEra = normalizeEra(player?.era);
  const activeLocale = normalizeLocale(i18n.resolvedLanguage || i18n.language);
  const cityEntityIds = useMemo(
    () => Array.from(new Set(
      (found.cityMap?.entities || []).map((entity) => entity?.cid).filter(Boolean)
    )),
    [found.cityMap]
  );
  const cityDefinitionRequests = useMemo(() => {
    const requests = new Map();
    for (const entity of found.cityMap?.entities || []) {
      const entityId = String(entity?.cid || '').trim();
      if (!entityId) continue;
      const era = resolveRequestedBuildingEra(entityId, entity?.era, playerEra);
      const key = `${entityId}@${era || 'unknown'}`;
      requests.set(key, { entityId, era, key });
    }
    return Array.from(requests.values());
  }, [found.cityMap, playerEra]);
  const cityDefinitionSignature = cityDefinitionRequests
    .map((request) => request.key)
    .join('|');
  const relevantDirectUrlSignature = useMemo(
    () => cityEntityIds.map((id) => `${id}=${found.buildingUrls?.[id] || ''}`).join('|'),
    [cityEntityIds, found.buildingUrls]
  );
  if (relevantDirectUrlsRef.current.signature !== relevantDirectUrlSignature) {
    relevantDirectUrlsRef.current = {
      signature: relevantDirectUrlSignature,
      map: Object.fromEntries(
        cityEntityIds
          .filter((id) => !!found.buildingUrls?.[id])
          .map((id) => [id, found.buildingUrls[id]])
      ),
    };
  }
  const relevantDirectUrls = relevantDirectUrlsRef.current.map;

  // Довантаження визначень будівель для мапи. Кожна зміна списку, епохи,
  // локалі або CDN-версії створює нове покоління запиту; старе ігнорується.
  useEffect(() => {
    const requestId = defsRequestRef.current + 1;
    defsRequestRef.current = requestId;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let active = true;

    if (!cityDefinitionRequests.length) {
      setBuildingDefs(null);
      setDefsProgress(null);
      return () => {
        active = false;
        controller?.abort();
      };
    }

    const haveDirectUrls = cityEntityIds.some((id) => !!relevantDirectUrls[id]);
    if (!haveDirectUrls && !found.buildingLookupUrl) {
      setDefsProgress('очікування метаданих');
      return () => {
        active = false;
        controller?.abort();
      };
    }

    const firstDirectUrl = cityEntityIds
      .map((id) => relevantDirectUrls[id])
      .find(Boolean);
    const sourceScope = found.buildingLookupUrl || String(firstDirectUrl || '').split('?')[0];
    const scopeKey = [guildId, cityDefinitionSignature, activeLocale, sourceScope].join('::');
    if (defsScopeRef.current !== scopeKey) {
      defsScopeRef.current = scopeKey;
      setBuildingDefs(null);
    }
    setDefsProgress(`0 / ${cityDefinitionRequests.length}`);

    getBuildingDefs(
      cityDefinitionRequests,
      found.buildingLookupUrl,
      (done, total) => {
        if (active && defsRequestRef.current === requestId) {
          setDefsProgress(`${done} / ${total}`);
        }
      },
      relevantDirectUrls,
      {
        playerEra,
        locale: activeLocale,
        signal: controller?.signal,
      }
    )
      .then((definitions) => {
        if (!active || defsRequestRef.current !== requestId) return;
        setBuildingDefs(definitions);
        const resolved = Object.values(definitions).filter(
          (definition) => definition?.resolved && definition.width && definition.length
        ).length;
        setDefsProgress(
          resolved === cityDefinitionRequests.length
            ? null
            : `${resolved} / ${cityDefinitionRequests.length}`
        );
      })
      .catch((error) => {
        if (!active || defsRequestRef.current !== requestId || error?.name === 'AbortError') return;
        setDefsProgress('помилка метаданих');
      });

    return () => {
      active = false;
      controller?.abort();
    };
  }, [
    activeLocale,
    cityDefinitionRequests,
    cityDefinitionSignature,
    cityEntityIds,
    guildId,
    playerEra,
    found.buildingLookupUrl,
    relevantDirectUrls,
    relevantDirectUrlSignature,
  ]);

  // Якщо застрягли на сторінці входу порталу — показати вікно для ручного входу
  useEffect(() => {
    if (health.packets > 0) {
      if (!keepWebOpenRef.current) setWebVisible(false);
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

  // Єдина модель списку міських будівель для мапи та подальших екранів.
  // Інстанс із city_map лишається окремим від спільного визначення каталогу.
  const cityBuildings = useMemo(
    () => (found.cityMap?.entities || []).map((entity, index) => {
      const entityId = String(entity?.cid || '').trim();
      const requestedEra = resolveRequestedBuildingEra(entityId, entity?.era, playerEra);
      const definitionKey = `${entityId}@${requestedEra || 'unknown'}`;
      const definition = entityId ? buildingDefs?.[definitionKey] || null : null;
      const width = Number(definition?.width);
      const length = Number(definition?.length);
      const staticBonuses = Array.isArray(definition?.bonuses) ? definition.bonuses : [];
      const runtimeBonuses = Array.isArray(entity?.runtimeBonuses) ? entity.runtimeBonuses : [];
      const bonusIdentity = (bonus) => [
        bonus?.type,
        bonus?.targetedFeature || 'all',
        bonus?.onlyWhenMotivated === true,
      ].join('|');
      const runtimeBonusKeys = new Set(runtimeBonuses.map(bonusIdentity));
      const bonuses = [
        ...staticBonuses.filter((bonus) => !runtimeBonusKeys.has(bonusIdentity(bonus))),
        ...runtimeBonuses,
      ].filter((bonus, bonusIndex, list) =>
        list.findIndex((item) =>
          item?.type === bonus?.type &&
          item?.value === bonus?.value &&
          item?.targetedFeature === bonus?.targetedFeature &&
          item?.onlyWhenMotivated === bonus?.onlyWhenMotivated &&
          item?.condition === bonus?.condition
        ) === bonusIndex
      );
      return {
        ...entity,
        instanceId: String(
          entity?.id ?? `${entityId || 'unknown'}:${entity?.x ?? '?'}:${entity?.y ?? '?'}:${index}`
        ),
        entityId,
        definitionKey,
        name: definition?.name || entityId,
        era: definition?.era || requestedEra,
        footprint: {
          width: Number.isFinite(width) && width > 0 ? width : null,
          length: Number.isFinite(length) && length > 0 ? length : null,
        },
        bonuses,
        definition,
        definitionStatus: definition?.resolved ? 'resolved' : definition?.error || 'loading',
      };
    }),
    [buildingDefs, found.cityMap, playerEra]
  );

  const value = {
    guildId,
    userId,
    consent,
    acceptConsent,
    reload,
    webVisible,
    setWebVisible,
    openGameWindow,
    closeGameWindow,
    currentUrl,
    health,
    synced: health.packets > 0,
    player,
    found,
    seen,
    iconSheet,
    goodsSheet,
    buildingDefs,
    cityBuildings,
    defsProgress,
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
              <TouchableOpacity onPress={closeGameWindow}>
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
