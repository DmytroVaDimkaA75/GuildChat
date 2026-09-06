// components/FoeSync/FoeSyncProvider.js
//
// Єдиний "двигун" синхронізації з грою. Тримає прихований WebView з Forge of
// Empires, слухач (foeInterceptor) ловить пакети, тут же збираються всі дані
// (бонуси, збір, мапа, іконки). Провайдер монтується високо в дереві
// (MainContent), але сам WebView живе НЕ постійно.
//
// Щоб не садити батарею, приховане вікно гри вантажиться лише тоді, коли
// відкритий екран, якому потрібні свіжі дані (Синхронізація з грою, Профіль,
// попап бонусів). Такий екран "замовляє" синхронізацію через useFoeSyncActive().
// Коли останній замовник зникає, WebView живе ще SYNC_LINGER_MS (доробити збір)
// і згортається. Зібрані дані лишаються в пам'яті — екран одразу показує
// останнє відоме, поки підвантажується свіже.
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
import { ActivityIndicator, NativeModules, Platform, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  parseAtlas,
} from './FoeIcon';
import { getBuildingDefs } from '../../src/services/foeBuildings';

const {
  normalizeEra,
  normalizeLocale,
  resolveRequestedBuildingEra,
} = require('../../src/services/foeBuildingMetadata');
const {
  SHIP_REFERENCE_CANVAS_WIDTH,
  SHIP_DRAG_X_RATIO,
  createAutoAimPlan,
  sameAutoAimGeometry,
} = require('../../src/services/foeAutoAim');

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Категорія споруди культурного поселення (без ВС і культури; є дипломатичні).
// Спершу за стабільним префіксом cityentity_id, потім за типом із метаданих.
const SETTLEMENT_PREFIX_TYPE = {
  H: 'main_building',
  R: 'residential',
  J: 'diplomacy',
  I: 'impediment',
  B: 'production',
  G: 'production',
  D: 'decoration',
};
function settlementCategory(cid, rawType) {
  const prefix = String(cid || '').split('_')[0];
  if (SETTLEMENT_PREFIX_TYPE[prefix]) return SETTLEMENT_PREFIX_TYPE[prefix];
  const type = String(rawType || '');
  if (/greatbuilding/i.test(type)) return 'generic_building';
  if (/culture/i.test(type)) return 'diplomacy';
  return type || 'unknown';
}

// Геометрія наведення — у foeAutoAim: X нормовано до еталонного canvas 1024,
// Y зберігає перевірений overdrive до межі. UA не фіксує CSS-ширину гри.

const worldIdFromGuildId = (g) => String(g || '').split('_')[0].trim() || null;
const gameHostFromGuildId = (g) => {
  const worldId = worldIdFromGuildId(g);
  return worldId ? `${worldId.toLowerCase()}.forgeofempires.com` : null;
};
const hostFromUrl = (value) => {
  const match = String(value || '').match(/^https?:\/\/([^/:?#]+)/i);
  return match ? match[1].toLowerCase() : null;
};
const gameUrlFromGuildId = (g) => {
  const w = worldIdFromGuildId(g);
  return w ? `https://${w}.forgeofempires.com/game/index?` : null;
};

// Скільки тримати приховане вікно гри після того, як зник останній екран-
// замовник. Вистачає, щоб добрати перші пакети, бонуси й мапу міста.
const SYNC_LINGER_MS = 90 * 1000;
// StartupService може вже віддати мапу, коли Haxe/OpenFL ще добудовує сцену
// та обробники вводу. Відлік починаємо лише з переходу на ПОВНИЙ розмір:
// час, проведений у прихованому 1×1 WebView, не зараховується.
const GAME_SCENE_VISIBLE_WARMUP_MS = 25 * 1000;
const CALIB_KEY = 'foeSettlementCalib_v1'; // ТИМЧАСОВО: діагностика поселень
const SETTLEMENT_SHEETS_KEY = 'foeSettlementSheetsV1'; // спрайт-листи іконок ресурсів поселень
const ICON_URLS_KEY = 'foeResourceIconUrlsV1'; // поштучні PNG-іконки ресурсів поселень {key:url}
const { FoeWebViewGesture } = NativeModules;
const HAS_NATIVE_AUTO_AIM = Platform.OS === 'android' &&
  typeof FoeWebViewGesture?.swipe === 'function' && typeof FoeWebViewGesture?.tap === 'function';
const AUTO_STEP_LABELS = { // ТИМЧАСОВО: підписи кроків тесту автовходу
  start: 'старт',
  click_ship: 'клікаю по кораблю…',
  retry_click: 'клікаю ще раз…',
  entered: 'увійшли в поселення ✓ (можна закривати гру)',
  target: 'ціль визначена',
  wrong_grid: 'клік потрапив не туди',
  enter_failed: 'вхід НЕ підтверджено',
  panning: 'відтворюю скрол до корабля…',
  pan_done: 'нативний скрол завершено ✓',
  native_pan_failed: 'нативний скрол не виконано',
  pan_target: 'ціль скролу визначена',
  probe_click: 'клік на нерухомій точці — дивись на екран',
  error: 'помилка скрипта',
  autoaim_start: 'авто-наведення: рахую координати…',
  autoaim_missing_data: 'авто-наведення: немає даних (потрібна мапа міста з кораблем і ратушею)',
  autoaim_unsupported: 'авто-наведення: недоступне на цьому пристрої',
  autoaim_no_canvas: 'авто-наведення: не бачу canvas гри',
  autoaim_panning: 'авто-наведення: прогортаю за формулою…',
  autoaim_geometry: 'розміри та координати авто-наведення',
  autoaim_geometry_changed: 'розмір гри змінився — повторіть вхід',
  autoaim_invalid_geometry: 'координати поза видимою областю гри',
  interaction_wait: 'чекаю, поки сцена гри стане інтерактивною…',
  interaction_ready: 'сцена гри готова ✓',
  interaction_not_ready: 'сцена гри не стала інтерактивною',
  manual_login_required: 'потрібно увійти в гру — відкриваю форму входу',
  watch_armed: 'чекаю відповідь мапи…',
  touch_started: 'нативний дотик доставлено у гру…',
  request_sent: 'запит мапи відправлено…',
  no_request: 'клієнт не створив запит входу',
  request_no_response: 'запит пішов, але відповідь не надійшла',
  native_tap_failed: 'нативний клік не виконано',
};

const Ctx = createContext(null);
export const useFoeSync = () => useContext(Ctx);

// Екран, якому потрібні свіжі дані з гри, викликає це у своєму тілі. Поки такий
// екран змонтований (і active !== false), приховане вікно гри працює; коли всі
// вони зникли — воно згортається (з невеликою затримкою на доробку збору).
export function useFoeSyncActive(active = true) {
  const ctx = useContext(Ctx);
  const retain = ctx?.retainSync;
  useEffect(() => {
    if (!active || typeof retain !== 'function') return undefined;
    return retain();
  }, [active, retain]);
}

// Довантаження визначень будівель (розмір, назва, тип, бонуси) для довільного
// списку сутностей мапи — головного міста АБО культурного поселення. Джерело
// те саме: спільний lookup-файл гри (`building_entity_lookup`) + прямі URL
// ресурсів, які встиг побачити interceptor. Тимчасовий збій або відсутній URL
// не кешуються як "будівля 1×1" — будівля лишається "уточнюється".
function useResolvedBuildingDefs(entities, {
  guildId,
  playerEra,
  activeLocale,
  buildingUrls,
  buildingLookupUrl,
  scopeTag,
}) {
  const [defs, setDefs] = useState(null);
  const [progress, setProgress] = useState(null);
  const requestRef = useRef(0);
  const scopeRef = useRef(null);
  const directRef = useRef({ signature: '', map: {} });

  const list = Array.isArray(entities) ? entities : null;

  const entityIds = useMemo(
    () => Array.from(new Set(
      (list || []).map((entity) => String(entity?.cid || '').trim()).filter(Boolean)
    )),
    [list]
  );

  const definitionRequests = useMemo(() => {
    const requests = new Map();
    for (const entity of list || []) {
      const entityId = String(entity?.cid || '').trim();
      if (!entityId) continue;
      const era = resolveRequestedBuildingEra(entityId, entity?.era, playerEra);
      const key = `${entityId}@${era || 'unknown'}`;
      requests.set(key, { entityId, era, key });
    }
    return Array.from(requests.values());
  }, [list, playerEra]);
  const definitionSignature = definitionRequests.map((request) => request.key).join('|');

  const directSignature = useMemo(
    () => entityIds.map((id) => `${id}=${buildingUrls?.[id] || ''}`).join('|'),
    [entityIds, buildingUrls]
  );
  if (directRef.current.signature !== directSignature) {
    directRef.current = {
      signature: directSignature,
      map: Object.fromEntries(
        entityIds.filter((id) => !!buildingUrls?.[id]).map((id) => [id, buildingUrls[id]])
      ),
    };
  }
  const directUrls = directRef.current.map;

  useEffect(() => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let active = true;
    const stop = () => {
      active = false;
      controller?.abort();
    };

    if (!definitionRequests.length) {
      setDefs(null);
      setProgress(null);
      return stop;
    }

    const haveDirectUrls = entityIds.some((id) => !!directUrls[id]);
    if (!haveDirectUrls && !buildingLookupUrl) {
      setProgress('очікування метаданих');
      return stop;
    }

    const firstDirectUrl = entityIds.map((id) => directUrls[id]).find(Boolean);
    const sourceScope = buildingLookupUrl || String(firstDirectUrl || '').split('?')[0];
    const scopeKey = [scopeTag, guildId, definitionSignature, activeLocale, sourceScope].join('::');
    if (scopeRef.current !== scopeKey) {
      scopeRef.current = scopeKey;
      setDefs(null);
    }
    setProgress(`0 / ${definitionRequests.length}`);

    getBuildingDefs(
      definitionRequests,
      buildingLookupUrl,
      (done, total) => {
        if (active && requestRef.current === requestId) setProgress(`${done} / ${total}`);
      },
      directUrls,
      { playerEra, locale: activeLocale, signal: controller?.signal, scope: scopeTag }
    )
      .then((definitions) => {
        if (!active || requestRef.current !== requestId) return;
        setDefs(definitions);
        const resolved = Object.values(definitions).filter(
          (definition) => definition?.resolved && definition.width && definition.length
        ).length;
        setProgress(
          resolved === definitionRequests.length
            ? null
            : `${resolved} / ${definitionRequests.length}`
        );
      })
      .catch((error) => {
        if (!active || requestRef.current !== requestId || error?.name === 'AbortError') return;
        setProgress('помилка метаданих');
      });

    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    scopeTag,
    guildId,
    activeLocale,
    playerEra,
    definitionSignature,
    directSignature,
    buildingLookupUrl,
  ]);

  return { defs, progress };
}

export function FoeSyncProvider({ children }) {
  const guildContext = useContext(GuildContext);
  const { i18n } = useTranslation();
  const insets = useSafeAreaInsets();

  const [guildId, setGuildId] = useState(guildContext?.guildId || null);
  const [userId, setUserId] = useState(null);
  const [consent, setConsent] = useState(null); // null | 'yes' | 'no'
  const [webKey, setWebKey] = useState(0);
  const webGenerationRef = useRef(webKey);
  webGenerationRef.current = webKey;
  const [webVisible, setWebVisible] = useState(false);
  // Вікно гри показуємо лише для ручного вводу логіна/пароля. Щойно вхід
  // підтверджено (interceptor шле kind:'authed') або пішли пакети — згортаємо
  // його назад у прихований 1×1 WebView, який доробляє все у фоні.
  //
  // Перед показом монтуємо WebView заново (setWebKey), щоб він народжувався вже
  // на весь екран. Той самий інстанс, який жив прихованим 1×1, на частині
  // Android-пристроїв не під'єднується до екранної клавіатури — тап по полю
  // пароля фокусує його, але клавіатура не спливає. Свіжий повнорозмірний
  // WebView такої вади не має.
  const openGameWindow = useCallback(() => {
    setWebKey((k) => k + 1);
    setWebVisible(true);
  }, []);
  const closeGameWindow = useCallback(() => { setWebVisible(false); }, []);

  // ТИМЧАСОВО (діагностика поселень): "закріплене" вікно гри — його НЕ згортає
  // авто-приховування після authed / перших пакетів, бо користувач має вручну
  // зайти у своє поселення. Не перемонтовуємо WebView (граємо в наявному).
  const [webPinned, setWebPinned] = useState(false);
  const webPinnedRef = useRef(false);
  webPinnedRef.current = webPinned;
  // ТИМЧАСОВО: штучно звужує вікно гри (без іншого телефона), щоб
  // перевірити, чи авто-наведення в поселення лишається точним на ІНШОМУ
  // розмірі canvas — бо саме різні екрани, а не різні світи/акаунти, є
  // реальним ризиком для "працює для будь-кого без калібрування".
  const [debugShrink, setDebugShrink] = useState(false);
  // ТИМЧАСОВО: "тихий" автовхід у поселення — прогрітий WebView тимчасово
  // розгортається на повний розмір (щоб OpenFL реально малював кадри), але
  // накривається непрозорим екраном завантаження. Окремо від webVisible/
  // webPinned, щоб не зачіпати ручний потік і панель кнопок.
  const [stealthEntering, setStealthEntering] = useState(false);
  const stealthEnteringRef = useRef(false);
  const webFullSizeActiveRef = useRef(false);
  const webFullSizeSinceRef = useRef(0);
  useEffect(() => {
    const fullSizeActive = webVisible || stealthEntering;
    if (fullSizeActive && !webFullSizeActiveRef.current) {
      webFullSizeSinceRef.current = Date.now();
    } else if (!fullSizeActive) {
      webFullSizeSinceRef.current = 0;
    }
    webFullSizeActiveRef.current = fullSizeActive;
  }, [stealthEntering, webVisible]);
  const pinGameWindow = useCallback(() => {
    setWebPinned(true);
    setWebVisible(true);
  }, []);
  const unpinGameWindow = useCallback(() => {
    setWebPinned(false);
    setWebVisible(false);
  }, []);

  // ТИМЧАСОВО: калібрування кліків для автоматичного входу в поселення.
  // Координати корабля поселення / кнопки повернення різні на кожному екрані,
  // тож замість вгадувати — записуємо, куди САМ користувач тапнув, і зберігаємо.
  const webViewRef = useRef(null);
  const webViewTagRef = useRef(null);
  const webViewLayoutRef = useRef(null);
  const webViewLayoutEpochRef = useRef(0);
  const [autoAimMeasurements, setAutoAimMeasurements] = useState([]);
  const webDocumentEpochRef = useRef(0);
  const webDocumentIdRef = useRef(null);
  const webDocumentStartedAtRef = useRef(0);
  const cityMapDocumentEpochRef = useRef(null);
  const interactionProbeResolverRef = useRef(null);
  const interactionProbeNonceRef = useRef(0);
  const nativeWatchResolverRef = useRef(null);
  const nativeWatchNonceRef = useRef(0);
  const activeAutoEnterNonceRef = useRef(null);
  const autoEnterRequestSentRef = useRef(false);
  // ТИМЧАСОВО: `found` іще не оголошено на цьому рівні файлу (нижче), а
  // авто-наведення (tryAutoAimEnter) оголошується вище за нього — тож читає
  // найсвіжіше значення через ref, а не напряму зі стану.
  const foundRef = useRef({});
  // ТИМЧАСОВО: світові координати + застосована прокрутка останнього запуску
  // авто-наведення — щоб, коли користувач тапне на кораблик там, де він
  // зʼявився ПІСЛЯ цієї прокрутки, отримати другу незалежну точку для
  // перевірки/уточнення формули (одна точка формулу лише підганяє, не
  // перевіряє).
  const lastAutoAimRef = useRef(null);
  const [calibPoints, setCalibPoints] = useState({});
  const armCalibration = useCallback((name) => {
    webViewRef.current?.injectJavaScript(
      `window.__foeCalib && (window.__foeCalib.mode = ${JSON.stringify(name)}); true;`
    );
  }, []);
  const resetCalibration = useCallback(() => {
    setCalibPoints({});
    AsyncStorage.removeItem(CALIB_KEY).catch(() => {});
  }, []);
  // Кнопки калібрування живуть ПОВЕРХ гри (у панелі під час webPinned) — бо
  // гру видно на весь екран, і екран діагностики під нею недосяжний.
  const [armed, setArmed] = useState(null);
  const arm = useCallback((name) => {
    setArmed(name);
    armCalibration(name);
  }, [armCalibration]);
  useEffect(() => {
    if (armed && calibPoints[armed]) { setArmed(null); }
  }, [armed, calibPoints]);

  // ТИМЧАСОВО: тестовий автоклік по вже збереженій точці "корабель". На
  // Android і свайп, і тап проходять через нативний MotionEvent; JS-варіант
  // лишається лише запасним шляхом для інших платформ.
  // Кліка "повернутись у місто" свідомо нема: це вікно гри однаково скоро
  // закриється/перезавантажиться, тож заходимо в поселення останнім кроком.
  const [autoEnterLog, setAutoEnterLog] = useState([]);
  const autoEnterBusyRef = useRef(false);
  const autoEnterTimeoutRef = useRef(null);
  const [autoEnterBusy, setAutoEnterBusy] = useState(false);
  const pendingAutoEnterResolveRef = useRef(null);
  const finishAutoEnter = useCallback(() => {
    if (autoEnterTimeoutRef.current) {
      clearTimeout(autoEnterTimeoutRef.current);
      autoEnterTimeoutRef.current = null;
    }
    if (nativeWatchResolverRef.current) {
      const pending = nativeWatchResolverRef.current;
      nativeWatchResolverRef.current = null;
      clearTimeout(pending.timeoutId);
      pending.resolve(null);
    }
    activeAutoEnterNonceRef.current = null;
    autoEnterRequestSentRef.current = false;
    autoEnterBusyRef.current = false;
    setAutoEnterBusy(false);
    if (pendingAutoEnterResolveRef.current) {
      const resolve = pendingAutoEnterResolveRef.current;
      pendingAutoEnterResolveRef.current = null;
      resolve();
    }
  }, []);
  useEffect(() => () => {
    if (autoEnterTimeoutRef.current) clearTimeout(autoEnterTimeoutRef.current);
    autoEnterBusyRef.current = false;
    if (interactionProbeResolverRef.current) {
      const pending = interactionProbeResolverRef.current;
      interactionProbeResolverRef.current = null;
      clearTimeout(pending.timeoutId);
      pending.resolve(null);
    }
    if (nativeWatchResolverRef.current) {
      const pending = nativeWatchResolverRef.current;
      nativeWatchResolverRef.current = null;
      clearTimeout(pending.timeoutId);
      pending.resolve(null);
    }
    activeAutoEnterNonceRef.current = null;
    autoEnterRequestSentRef.current = false;
    if (pendingAutoEnterResolveRef.current) {
      const resolve = pendingAutoEnterResolveRef.current;
      pendingAutoEnterResolveRef.current = null;
      resolve();
    }
  }, []);

  const requestInteractionProbe = useCallback(() => new Promise((resolve) => {
    if (!webViewRef.current) { resolve(null); return; }

    if (interactionProbeResolverRef.current) {
      const previous = interactionProbeResolverRef.current;
      interactionProbeResolverRef.current = null;
      clearTimeout(previous.timeoutId);
      previous.resolve(null);
    }

    interactionProbeNonceRef.current += 1;
    const nonce = `${Date.now()}-${interactionProbeNonceRef.current}`;
    const timeoutId = setTimeout(() => {
      const pending = interactionProbeResolverRef.current;
      if (pending?.nonce !== nonce) return;
      interactionProbeResolverRef.current = null;
      resolve(null);
    }, 1800);
    interactionProbeResolverRef.current = { nonce, resolve, timeoutId };

    try {
      webViewRef.current.injectJavaScript(
        `window.__foeProbeInteraction && window.__foeProbeInteraction(${JSON.stringify(nonce)}); true;`
      );
    } catch (_error) {
      clearTimeout(timeoutId);
      if (interactionProbeResolverRef.current?.nonce === nonce) {
        interactionProbeResolverRef.current = null;
      }
      resolve(null);
    }
  }), []);

  const waitForInteractiveGame = useCallback(async ({
    timeoutMs = 75000,
    requireCurrentCityMap = true,
  } = {}) => {
    const deadline = Date.now() + timeoutMs;
    let stableCount = 0;
    let lastSignature = '';

    while (Date.now() < deadline && autoEnterBusyRef.current) {
      const probe = await requestInteractionProbe();
      const rect = probe?.rect;
      const frameDeltaMs = Number(probe?.frameDeltaMs);
      const expectedHost = gameHostFromGuildId(guildIdRef.current);
      const probeHost = String(probe?.pageHost || '').trim().toLowerCase();
      const probePath = String(probe?.pagePath || '');
      const ready =
        !!rect &&
        Number(rect.width) > 100 &&
        Number(rect.height) > 100 &&
        Number(probe?.viewportW) > 100 &&
        Number(probe?.viewportH) > 100 &&
        Number(probe?.canvasCount) > 0 &&
        String(probe?.canvasTag || '') === 'canvas' &&
        ['interactive', 'complete'].includes(String(probe?.readyState || '')) &&
        String(probe?.visibilityState || 'visible') === 'visible' &&
        !!expectedHost &&
        probeHost === expectedHost &&
        /^\/game\/index(?:\/|$)/.test(probePath) &&
        webFullSizeSinceRef.current > 0 &&
        Date.now() - webFullSizeSinceRef.current >= GAME_SCENE_VISIBLE_WARMUP_MS &&
        (
          !requireCurrentCityMap ||
          cityMapDocumentEpochRef.current === webDocumentEpochRef.current
        ) &&
        probe?.stable === true &&
        Number.isFinite(frameDeltaMs) &&
        frameDeltaMs > 0 &&
        frameDeltaMs < 500;

      if (ready) {
        const signature = [
          rect.left,
          rect.top,
          rect.width,
          rect.height,
          probe.viewportW,
          probe.viewportH,
        ].map((value) => Math.round(Number(value) || 0)).join(':');
        if (signature === lastSignature) {
          stableCount += 1;
        } else {
          stableCount = 1;
        }
        lastSignature = signature;
        if (stableCount >= 3) return probe;
      } else {
        stableCount = 0;
        lastSignature = '';
      }

      await new Promise((probeDelayResolve) => setTimeout(probeDelayResolve, 300));
    }
    return null;
  }, [requestInteractionProbe]);

  const armNativeAutoEnterWatch = useCallback((x, y) => new Promise((resolve) => {
    if (!webViewRef.current) { resolve(null); return; }

    if (nativeWatchResolverRef.current) {
      const previous = nativeWatchResolverRef.current;
      nativeWatchResolverRef.current = null;
      clearTimeout(previous.timeoutId);
      previous.resolve(null);
    }

    nativeWatchNonceRef.current += 1;
    const nonce = `${Date.now()}-${nativeWatchNonceRef.current}`;
    activeAutoEnterNonceRef.current = nonce;
    autoEnterRequestSentRef.current = false;
    const generation = webGenerationRef.current;
    const timeoutId = setTimeout(() => {
      if (nativeWatchResolverRef.current?.nonce !== nonce) return;
      nativeWatchResolverRef.current = null;
      resolve(null);
    }, 1800);
    nativeWatchResolverRef.current = { nonce, generation, resolve, timeoutId };

    try {
      webViewRef.current.injectJavaScript(
        `(function () {
          var attemptId = ${JSON.stringify(nonce)};
          var armed = window.__foeArmNativeAutoEnter &&
            window.__foeArmNativeAutoEnter(${x}, ${y}, attemptId);
          if (armed && typeof window.__foeNativeTapStarted === 'function') {
            window.__foeNativeTapStarted(attemptId);
          }
        })(); true;`
      );
    } catch (_error) {
      clearTimeout(timeoutId);
      if (nativeWatchResolverRef.current?.nonce === nonce) {
        nativeWatchResolverRef.current = null;
      }
      if (activeAutoEnterNonceRef.current === nonce) activeAutoEnterNonceRef.current = null;
      resolve(null);
    }
  }), []);

  const runNativeAutoEnterTaps = useCallback(async ({
    reactTag,
    x,
    y,
    viewportWidth,
    viewportHeight,
    viewportLeft = 0,
    viewportTop = 0,
    ensureGeometry,
  }) => {
    if (Platform.OS !== 'android' || typeof FoeWebViewGesture?.tap !== 'function') {
      return false;
    }
    if (
      !Number.isInteger(reactTag) || reactTag <= 0 ||
      ![x, y, viewportWidth, viewportHeight].every(Number.isFinite) ||
      viewportWidth <= 0 || viewportHeight <= 0
    ) {
      return false;
    }

    const xRatio = Math.max(0, Math.min(1, (x - viewportLeft) / viewportWidth));
    const yRatio = Math.max(0, Math.min(1, (y - viewportTop) / viewportHeight));
    const attemptId = await armNativeAutoEnterWatch(x, y);
    if (!attemptId) {
      const error = new Error('The game response watcher was not armed');
      error.code = 'E_WATCH_NOT_ARMED';
      throw error;
    }

    if (autoEnterTimeoutRef.current) clearTimeout(autoEnterTimeoutRef.current);
    autoEnterTimeoutRef.current = setTimeout(() => {
      setAutoEnterLog((prev) => [...prev, { step: 'enter_failed', at: Date.now() }].slice(-20));
      finishAutoEnter();
    }, 25 * 1000);

    for (
      let attempt = 1;
      attempt <= 4 && autoEnterBusyRef.current && !autoEnterRequestSentRef.current;
      attempt += 1
    ) {
      if (ensureGeometry) await ensureGeometry();
      if (!autoEnterBusyRef.current || autoEnterRequestSentRef.current) break;
      setAutoEnterLog((prev) => [...prev, {
        step: attempt === 1 ? 'click_ship' : 'retry_click',
        n: attempt,
        at: Date.now(),
      }].slice(-20));
      await FoeWebViewGesture.tap(reactTag, xRatio, yRatio, attemptId);
      if (attempt < 4 && autoEnterBusyRef.current && !autoEnterRequestSentRef.current) {
        await new Promise((tapDelayResolve) => setTimeout(tapDelayResolve, 2200));
      }
    }
    return true;
  }, [armNativeAutoEnterWatch, finishAutoEnter]);

  const tryAutoEnter = useCallback(async (points) => {
    const ship = points?.ship;
    if (!ship || autoEnterBusyRef.current) { return; }

    const shipX = Number(ship.clientX);
    const shipY = Number(ship.clientY);
    const scrollDx = Number(ship.scrollDx || 0);
    const scrollDy = Number(ship.scrollDy || 0);
    if (![shipX, shipY, scrollDx, scrollDy].every(Number.isFinite)) { return; }

    const injectAutoEnter = (dx, dy) => {
      if (!webViewRef.current) { return false; }
      webViewRef.current.injectJavaScript(
        `window.__foeAutoEnterTest && window.__foeAutoEnterTest(${shipX}, ${shipY}, ${dx}, ${dy}); true;`
      );
      if (autoEnterTimeoutRef.current) clearTimeout(autoEnterTimeoutRef.current);
      autoEnterTimeoutRef.current = setTimeout(() => {
        setAutoEnterLog((prev) => [...prev, { step: 'enter_failed', at: Date.now() }].slice(-20));
        finishAutoEnter();
      }, 35 * 1000);
      return true;
    };

    autoEnterBusyRef.current = true;
    setAutoEnterBusy(true);
    setAutoEnterLog([{ step: 'start', at: Date.now() }]);

    const hasRecordedPan = scrollDx !== 0 || scrollDy !== 0;
    if (Platform.OS !== 'android') {
      if (!injectAutoEnter(scrollDx, scrollDy)) { finishAutoEnter(); }
      return;
    }

    const reactTag = Number(webViewTagRef.current);
    // ВАЖЛИВО: беремо РЕАЛЬНИЙ поточний розмір вікна гри (не той, що був
    // записаний під час калібрування). Нативний swipe/tap приймає частку
    // (ratio) і множить її на СВІЙ, актуальний webView.width/height — якщо
    // тут підставити старий, записаний розмір (напр. з калібрування під
    // панеллю кнопок), а зараз вікно іншого розміру (напр. тихий вхід на
    // весь екран, без панелі) — та сама частка помножиться на інше число,
    // і записана кількість пікселів прокрутки/кліка "розтягнеться" чи
    // "стиснеться" неправильно. Тому ratio завжди рахуємо від АКТУАЛЬНОГО
    // розміру, а не від того, що зберігся в calibPoints.
    const liveProbe = await requestInteractionProbe();
    const viewportWidth = Number(liveProbe?.rect?.width) || Number(ship.viewportW || ship.canvasW);
    const viewportHeight = Number(liveProbe?.rect?.height) || Number(ship.viewportH || ship.canvasH);
    if (
      (hasRecordedPan && typeof FoeWebViewGesture?.swipe !== 'function') ||
      typeof FoeWebViewGesture?.tap !== 'function' ||
      !Number.isInteger(reactTag) ||
      reactTag <= 0 ||
      !Number.isFinite(viewportWidth) ||
      !Number.isFinite(viewportHeight) ||
      viewportWidth <= 0 ||
      viewportHeight <= 0
    ) {
      setAutoEnterLog((prev) => [...prev, {
        step: 'native_tap_failed',
        target: 'міст або розміри WebView недоступні — потрібна нова Android-збірка/калібровка',
        at: Date.now(),
      }].slice(-20));
      finishAutoEnter();
      return;
    }

    let failureStep = hasRecordedPan ? 'native_pan_failed' : 'native_tap_failed';
    try {
      if (hasRecordedPan) {
        setAutoEnterLog((prev) => [...prev, {
          step: 'panning', target: 'Android MotionEvent', at: Date.now(),
        }].slice(-20));
        await FoeWebViewGesture.swipe(
          reactTag,
          scrollDx / viewportWidth,
          scrollDy / viewportHeight
        );
        setAutoEnterLog((prev) => [...prev, { step: 'pan_done', at: Date.now() }].slice(-20));
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
      failureStep = 'native_tap_failed';
      const usedNativeTap = await runNativeAutoEnterTaps({
        reactTag,
        x: shipX,
        y: shipY,
        viewportWidth,
        viewportHeight,
      });
      if (!usedNativeTap) finishAutoEnter();
    } catch (error) {
      setAutoEnterLog((prev) => [...prev, {
        step: failureStep,
        target: [error?.code, error?.message].filter(Boolean).join(': ') || 'невідома помилка',
        at: Date.now(),
      }].slice(-20));
      finishAutoEnter();
    }
  }, [finishAutoEnter, runNativeAutoEnterTaps, requestInteractionProbe]);
  // ТИМЧАСОВО: клік на нерухомій точці (без скролу) — щоб перевірити, чи
  // винен скрол камери, а не сам механізм синтетичного кліка.
  const tryProbeClick = useCallback((point) => {
    if (!point || autoEnterBusyRef.current) { return; }
    setAutoEnterLog([{ step: 'start', at: Date.now() }]);
    webViewRef.current?.injectJavaScript(
      `window.__foeSynthClickAt && window.__foeSynthClickAt(${point.clientX}, ${point.clientY}); true;`
    );
  }, []);

  // Вхід без ручного калібрування: частки поточного canvas для скролу/тапу.
  // Ігрові координати корабля й ратуші використовуються лише в діагностиці.
  // Результат, як і раніше, підтверджується відповіддю сервера поселення.
  const tryAutoAimEnter = useCallback(async () => {
    if (autoEnterBusyRef.current) { return; }
    const entities = foundRef.current?.cityMap?.entities || [];
    const ship = entities.find((e) => e.type === 'outpost_ship');
    const townhall = entities.find((e) => e.type === 'main_building');
    if (
      Platform.OS !== 'android' ||
      typeof FoeWebViewGesture?.swipe !== 'function' ||
      typeof FoeWebViewGesture?.tap !== 'function'
    ) {
      setAutoEnterLog([{ step: 'autoaim_unsupported', at: Date.now() }]);
      finishAutoEnter();
      return;
    }

    autoEnterBusyRef.current = true;
    const startGeneration = webGenerationRef.current;
    setAutoEnterBusy(true);
    setAutoEnterLog([
      { step: 'autoaim_start', at: Date.now() },
      { step: 'interaction_wait', at: Date.now() },
    ]);

    // URL/DOM-евристика `authed` означає лише, що портал пропустив нас до
    // /game/index. Для дотику цього замало: OpenFL має вже створити canvas,
    // отримати реальний viewport і стабільно відмалювати кілька кадрів.
    const interaction = await waitForInteractiveGame({ requireCurrentCityMap: false });
    if (!autoEnterBusyRef.current) return;
    if (webGenerationRef.current !== startGeneration) {
      finishAutoEnter();
      return;
    }
    const rect = interaction?.rect;
    if (!rect || !rect.width || !rect.height) {
      setAutoEnterLog((prev) => [...prev, {
        step: 'interaction_not_ready',
        at: Date.now(),
      }].slice(-20));
      finishAutoEnter();
      return;
    }
    setAutoEnterLog((prev) => [...prev, { step: 'interaction_ready', at: Date.now() }].slice(-20));
    const readyDocumentEpoch = webDocumentEpochRef.current;
    const readyLayoutEpoch = webViewLayoutEpochRef.current;

    const reactTag = Number(webViewTagRef.current);
    if (!Number.isInteger(reactTag) || reactTag <= 0) {
      setAutoEnterLog((prev) => [...prev, {
        step: 'autoaim_missing_data',
        target: 'WebView ще не має нативного tag',
        at: Date.now(),
      }].slice(-20));
      finishAutoEnter();
      return;
    }

    // Спроба закрити спливаюче вікно "останні події" (якщо є) ще до
    // прокрутки/кліка — інакше клік по кораблю може лише закрити його.
    webViewRef.current?.injectJavaScript('window.__foeDismissPopups && window.__foeDismissPopups(); true;');
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (
      !autoEnterBusyRef.current ||
      webGenerationRef.current !== startGeneration ||
      webDocumentEpochRef.current !== readyDocumentEpoch
    ) {
      finishAutoEnter();
      return;
    }

    const dx = Number.isFinite(ship?.x) && Number.isFinite(townhall?.x) ? ship.x - townhall.x : null;
    const dy = Number.isFinite(ship?.y) && Number.isFinite(townhall?.y) ? ship.y - townhall.y : null;
    // CSS canvas і нативний WebView — різні системи координат. Спершу
    // масштабуємо еталон по canvas, тоді переводимо у частки видимого viewport.
    const beforePan = await requestInteractionProbe();
    const isCurrentGeometry = (probe) => (
      autoEnterBusyRef.current &&
      webGenerationRef.current === startGeneration &&
      webDocumentEpochRef.current === readyDocumentEpoch &&
      webViewLayoutEpochRef.current === readyLayoutEpoch &&
      probe?.stable === true &&
      sameAutoAimGeometry(interaction, probe)
    );
    if (!isCurrentGeometry(beforePan)) {
      setAutoEnterLog((prev) => [...prev, { step: 'autoaim_geometry_changed', at: Date.now() }].slice(-20));
      finishAutoEnter();
      return;
    }
    const plan = createAutoAimPlan(beforePan);
    if (!plan) {
      setAutoEnterLog((prev) => [...prev, { step: 'autoaim_invalid_geometry', at: Date.now() }].slice(-20));
      finishAutoEnter();
      return;
    }
    const { dragX, dragY } = plan;
    const measurement = {
      at: Date.now(),
      debugShrink,
      nativeLayoutDp: webViewLayoutRef.current,
      referenceCanvasWidth: SHIP_REFERENCE_CANVAS_WIDTH,
      dragXRatio: SHIP_DRAG_X_RATIO,
      cssWidthDiffersFromReference: Math.abs(plan.geometry.width - SHIP_REFERENCE_CANVAS_WIDTH) > 0.5,
      probe: beforePan,
      plan,
    };
    setAutoAimMeasurements((previous) => [...previous, measurement].slice(-8));
    lastAutoAimRef.current = { dx, dy, appliedDragX: dragX, appliedDragY: dragY, geometry: measurement };
    setAutoEnterLog((prev) => [...prev, {
      step: 'autoaim_geometry',
      target: `canvas ${plan.geometry.width}×${plan.geometry.height} CSS · X ${dragX.toFixed(1)} CSS`,
      at: Date.now(),
    }].slice(-20));

    setAutoEnterLog((prev) => [...prev, { step: 'autoaim_panning', at: Date.now() }].slice(-20));
    try {
      await FoeWebViewGesture.swipe(reactTag, plan.swipe.xRatio, plan.swipe.yRatio);
      setAutoEnterLog((prev) => [...prev, { step: 'pan_done', at: Date.now() }].slice(-20));
    } catch (error) {
      setAutoEnterLog((prev) => [...prev, {
        step: 'native_pan_failed',
        target: String(error?.code || 'невідома помилка'),
        at: Date.now(),
      }].slice(-20));
      finishAutoEnter();
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 600));
    if (
      !autoEnterBusyRef.current ||
      !webViewRef.current ||
      webGenerationRef.current !== startGeneration ||
      webDocumentEpochRef.current !== readyDocumentEpoch
    ) {
      finishAutoEnter();
      return;
    }
    try {
      const ensureGeometry = async () => {
        const probe = await requestInteractionProbe();
        // A server response can finish the attempt while this probe is pending.
        if (!autoEnterBusyRef.current || autoEnterRequestSentRef.current) return;
        if (!isCurrentGeometry(probe)) {
          const error = new Error('Розмір гри змінився під час наведення; повторіть вхід');
          error.code = 'E_AUTOAIM_GEOMETRY_CHANGED';
          throw error;
        }
      };
      await ensureGeometry();
      if (!autoEnterBusyRef.current || autoEnterRequestSentRef.current) return;
      webViewRef.current.injectJavaScript(
        `window.__foeShowAimMarker && window.__foeShowAimMarker(${plan.tap.x}, ${plan.tap.y}); true;`
      );
      const usedNativeTap = await runNativeAutoEnterTaps({
        reactTag,
        x: plan.tap.x,
        y: plan.tap.y,
        viewportWidth: plan.geometry.viewportWidth,
        viewportHeight: plan.geometry.viewportHeight,
        viewportLeft: plan.geometry.viewportLeft,
        viewportTop: plan.geometry.viewportTop,
        ensureGeometry,
      });
      if (!usedNativeTap) {
        setAutoEnterLog((prev) => [...prev, {
          step: 'native_tap_failed',
          target: 'потрібна нова Android-збірка з методом tap',
          at: Date.now(),
        }].slice(-20));
        finishAutoEnter();
      }
    } catch (error) {
      setAutoEnterLog((prev) => [...prev, {
        step: error?.code === 'E_AUTOAIM_GEOMETRY_CHANGED' ? 'autoaim_geometry_changed' : 'native_tap_failed',
        target: [error?.code, error?.message].filter(Boolean).join(': ') || 'невідома помилка',
        at: Date.now(),
      }].slice(-20));
      finishAutoEnter();
    }
  }, [debugShrink, finishAutoEnter, requestInteractionProbe, runNativeAutoEnterTaps, waitForInteractiveGame]);

  // Тихий Android-вхід використовує те саме наведення, що й кнопка тесту,
  // без збереженої точки з конкретного телефона. Інші платформи лишають
  // попередній ручний калібрований сценарій.
  const autoEnterSettlementQuietly = useCallback(async ({ force = false } = {}) => {
    if (stealthEnteringRef.current || autoEnterBusyRef.current) { return; }
    if (webPinnedRef.current) { return; }
    // Без force — не заходимо, якщо мапа поселення вже є (автозапуск). З force
    // (кнопка «Оновити») — заходимо повторно, щоб отримати свіжі дані.
    if (!force && foundRef.current?.settlementMap) { return; }
    if (consent !== 'yes' || !guildId) return;
    if (Platform.OS === 'android' && !HAS_NATIVE_AUTO_AIM) {
      setAutoEnterLog([{ step: 'autoaim_unsupported', at: Date.now() }]);
      return;
    }
    if (Platform.OS !== 'android' && !calibPoints?.ship) {
      setAutoEnterLog([{ step: 'autoaim_missing_data', at: Date.now() }]);
      return;
    }

    stealthEnteringRef.current = true;
    setWebVisible(false);
    setStealthEntering(true);
    // Наведення розраховане на початкову позицію камери після завантаження.
    setWebKey((k) => k + 1);
    setAutoEnterLog([{ step: 'interaction_wait', at: Date.now() }]);

    try {
      // "Тест" (ручний) не чекає готовності гри, бо людина вже бачить її на
      // екрані перш ніж натиснути кнопку. Тут цього немає — вікно щойно
      // розгорнулось до реального розміру, тож чекаємо, поки сцена гри
      // (canvas/OpenFL) справді стане інтерактивною, перш ніж клікати.
      // waitForInteractiveGame() дивиться на autoEnterBusyRef — виставляємо
      // його свідомо, а перед самим tryAutoEnter знімаємо назад, бо той сам
      // виставляє його з нуля і вважає true "вже триває інша спроба".
      autoEnterBusyRef.current = true;
      setAutoEnterBusy(true);
      const ready = await waitForInteractiveGame({ requireCurrentCityMap: false });
      if (!autoEnterBusyRef.current) return;
      autoEnterBusyRef.current = false;
      if (!ready) {
        setAutoEnterLog((prev) => [...prev, { step: 'interaction_not_ready', at: Date.now() }].slice(-20));
        return;
      }
      setAutoEnterLog((prev) => [...prev, { step: 'interaction_ready', at: Date.now() }].slice(-20));

      let completionTimer;
      try {
        await new Promise((resolve) => {
          pendingAutoEnterResolveRef.current = resolve;
          completionTimer = setTimeout(() => {
            if (pendingAutoEnterResolveRef.current === resolve) finishAutoEnter();
          }, 120 * 1000);
          const attempt = Platform.OS === 'android'
            ? tryAutoAimEnter()
            : tryAutoEnter(calibPoints);
          attempt.catch((error) => {
            setAutoEnterLog((prev) => [...prev, {
              step: 'error',
              target: String(error?.message || error || 'невідома помилка'),
              at: Date.now(),
            }].slice(-20));
            finishAutoEnter();
          });
        });
      } finally {
        clearTimeout(completionTimer);
      }
      // Невеликий запас, щоб встигла прийти й розпарситись відповідь мапи
      // поселення (found.settlementMap) до того, як згорнемо вікно.
      await new Promise((resolve) => setTimeout(resolve, 500));
    } finally {
      setStealthEntering(false);
      stealthEnteringRef.current = false;
      autoEnterBusyRef.current = false;
      setAutoEnterBusy(false);
    }
  }, [consent, guildId, finishAutoEnter, tryAutoAimEnter, tryAutoEnter, calibPoints, waitForInteractiveGame]);

  // ТИМЧАСОВО (налагодження старого ручного калібрування):
  // невидиме перезавантаження + прокрутка записаними координатами, але
  // НЕ клікає. Натомість малює постійний маркер там, куди мав би клацнути,
  // і показує гру користувачу (як після "Відкрити гру"), щоб звірити оком,
  // куди реально доїхала прокрутка, і скоригувати calibPoints за скріном.
  const debugScrollAndReveal = useCallback(async () => {
    if (stealthEnteringRef.current || autoEnterBusyRef.current) { return; }
    const ship = calibPoints?.ship;
    const shipX = Number(ship?.clientX);
    const shipY = Number(ship?.clientY);
    const scrollDx = Number(ship?.scrollDx || 0);
    const scrollDy = Number(ship?.scrollDy || 0);
    if (!ship || ![shipX, shipY].every(Number.isFinite)) {
      setAutoEnterLog([{ step: 'autoaim_missing_data', at: Date.now() }]);
      return;
    }
    if (Platform.OS !== 'android' || typeof FoeWebViewGesture?.swipe !== 'function') {
      setAutoEnterLog([{ step: 'autoaim_unsupported', at: Date.now() }]);
      return;
    }

    stealthEnteringRef.current = true;
    setWebVisible(false);
    setStealthEntering(true);
    setWebKey((k) => k + 1);
    setAutoEnterLog([{ step: 'interaction_wait', at: Date.now() }]);
    autoEnterBusyRef.current = true;

    try {
      const ready = await waitForInteractiveGame({ requireCurrentCityMap: false });
      if (!ready) {
        setAutoEnterLog((prev) => [...prev, { step: 'interaction_not_ready', at: Date.now() }].slice(-20));
        return;
      }
      setAutoEnterLog((prev) => [...prev, { step: 'interaction_ready', at: Date.now() }].slice(-20));

      webViewRef.current?.injectJavaScript('window.__foeDismissPopups && window.__foeDismissPopups(); true;');
      await new Promise((resolve) => setTimeout(resolve, 400));

      const reactTag = Number(webViewTagRef.current);
      const liveProbe = await requestInteractionProbe();
      const viewportWidth = Number(liveProbe?.rect?.width) || Number(ship.viewportW || ship.canvasW);
      const viewportHeight = Number(liveProbe?.rect?.height) || Number(ship.viewportH || ship.canvasH);
      const hasRecordedPan = scrollDx !== 0 || scrollDy !== 0;

      if (
        hasRecordedPan &&
        Number.isInteger(reactTag) && reactTag > 0 &&
        Number.isFinite(viewportWidth) && viewportWidth > 0 &&
        Number.isFinite(viewportHeight) && viewportHeight > 0
      ) {
        setAutoEnterLog((prev) => [...prev, { step: 'panning', target: 'Android MotionEvent', at: Date.now() }].slice(-20));
        await FoeWebViewGesture.swipe(reactTag, scrollDx / viewportWidth, scrollDy / viewportHeight);
        setAutoEnterLog((prev) => [...prev, { step: 'pan_done', at: Date.now() }].slice(-20));
        await new Promise((resolve) => setTimeout(resolve, 600));
      }

      webViewRef.current?.injectJavaScript(
        `window.__foeShowAimMarker && window.__foeShowAimMarker(${shipX}, ${shipY}, 600000); true;`
      );
      setAutoEnterLog((prev) => [...prev, { step: 'entered', target: 'маркер показано, гра відкрита', at: Date.now() }].slice(-20));
    } finally {
      // Свідомо лишаємо гру видимою (не ховаємо назад) — саме для того,
      // щоб користувач роздивився маркер і зробив скріншот.
      setStealthEntering(false);
      stealthEnteringRef.current = false;
      autoEnterBusyRef.current = false;
      setWebPinned(true);
      setWebVisible(true);
    }
  }, [waitForInteractiveGame, requestInteractionProbe, calibPoints]);

  // Скільки екранів зараз "замовили" синхронізацію (див. useFoeSyncActive).
  const [demand, setDemand] = useState(0);
  const demandRef = useRef(0);
  const retainSync = useCallback(() => {
    demandRef.current += 1;
    setDemand(demandRef.current);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      demandRef.current = Math.max(0, demandRef.current - 1);
      setDemand(demandRef.current);
    };
  }, []);

  // "Задіяні" = хтось відкрив потрібний екран або показане вікно ручного входу.
  const engaged = demand > 0 || webVisible;
  const engagedRef = useRef(engaged);
  engagedRef.current = engaged;
  const [linger, setLinger] = useState(false);
  const prevEngagedRef = useRef(false);
  useEffect(() => {
    const wasEngaged = prevEngagedRef.current;
    prevEngagedRef.current = engaged;
    if (engaged) {
      setLinger(false);
      return undefined;
    }
    if (!wasEngaged) return undefined;
    // Замовників не лишилось — тримаємо вікно ще трохи, щоб доробити збір.
    setLinger(true);
    const t = setTimeout(() => setLinger(false), SYNC_LINGER_MS);
    return () => clearTimeout(t);
  }, [engaged]);

  const [currentUrl, setCurrentUrl] = useState('');
  const [health, setHealth] = useState({ ready: false, packets: 0, lastAt: 0 });
  const [player, setPlayer] = useState(null);
  const [found, setFound] = useState({});
  foundRef.current = found;
  const [seen, setSeen] = useState(() => new Set());
  const [rawLog, setRawLog] = useState([]); // ТИМЧАСОВО: діагностика поселень
  const [iconSheet, setIconSheet] = useState(null);
  const [goodsSheet, setGoodsSheet] = useState(null);
  const [settlementSheets, setSettlementSheets] = useState([]);
  const [settlementIconUrls, setSettlementIconUrls] = useState({});
  const [buildingDefs, setBuildingDefs] = useState(null);
  const [defsProgress, setDefsProgress] = useState(null);

  const iconSheetUrlsRef = useRef(null);
  const goodsSheetUrlsRef = useRef(null);
  const settlementSheetBasesRef = useRef(new Set());
  const rawLogIdRef = useRef(0); // ТИМЧАСОВО: унікальні ключі для сирого логу
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
    setRawLog([]);
    setAutoAimMeasurements([]);
    lastAutoAimRef.current = null;
    // settlementSheets НЕ чистимо — спрайт-листи іконок ресурсів спільні для
    // всіх світів і кешуються (як iconSheet/goodsSheet).
    webViewTagRef.current = null;
    cityMapDocumentEpochRef.current = null;
    webDocumentIdRef.current = null;
    webDocumentStartedAtRef.current = 0;
    if (interactionProbeResolverRef.current) {
      const pending = interactionProbeResolverRef.current;
      interactionProbeResolverRef.current = null;
      clearTimeout(pending.timeoutId);
      pending.resolve(null);
    }
    if (nativeWatchResolverRef.current) {
      const pending = nativeWatchResolverRef.current;
      nativeWatchResolverRef.current = null;
      clearTimeout(pending.timeoutId);
      pending.resolve(null);
    }
    if (autoEnterTimeoutRef.current) {
      clearTimeout(autoEnterTimeoutRef.current);
      autoEnterTimeoutRef.current = null;
    }
    activeAutoEnterNonceRef.current = null;
    autoEnterRequestSentRef.current = false;
    autoEnterBusyRef.current = false;
    setAutoEnterBusy(false);
    if (pendingAutoEnterResolveRef.current) {
      const resolve = pendingAutoEnterResolveRef.current;
      pendingAutoEnterResolveRef.current = null;
      resolve();
    }
    stealthEnteringRef.current = false;
    setStealthEntering(false);
    setWebPinned(false);
    setBuildingDefs(null);
    setDefsProgress(null);
    setWebVisible(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [c, u, g, sheet, gSheet, calib, sSheets, sIcons] = await Promise.all([
        AsyncStorage.getItem(FOE_CONSENT_KEY),
        AsyncStorage.getItem('userId'),
        AsyncStorage.getItem('guildId'),
        loadCachedIconSheet(),
        loadCachedGoodsSheet(),
        AsyncStorage.getItem(CALIB_KEY),
        AsyncStorage.getItem(SETTLEMENT_SHEETS_KEY),
        AsyncStorage.getItem(ICON_URLS_KEY),
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
      try {
        const parsed = sSheets ? JSON.parse(sSheets) : null;
        if (Array.isArray(parsed) && parsed.length) {
          setSettlementSheets(parsed);
          parsed.forEach((s) => s?.base && settlementSheetBasesRef.current.add(s.base));
        }
      } catch (_e) { /* ignore */ }
      try {
        const parsed = sIcons ? JSON.parse(sIcons) : null;
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length) {
          setSettlementIconUrls(parsed);
        }
      } catch (_e) { /* ignore */ }
      if (calib) {
        try { setCalibPoints(JSON.parse(calib)); } catch (_e) {}
      }
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
    `window.__FOE_WORLD=${JSON.stringify(worldIdFromGuildId(guildId) || '')};\n` +
    `window.__FOE_SYNC_GENERATION=${JSON.stringify(webKey)};\n${FOE_INTERCEPTOR_JS}`;

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

  const rememberWebViewTag = useCallback((event) => {
    const reactTag = Number(event?.nativeEvent?.target);
    if (Number.isInteger(reactTag) && reactTag > 0) {
      webViewTagRef.current = reactTag;
    }
  }, []);

  const onWebViewLayout = useCallback((event) => {
    const { width, height } = event.nativeEvent.layout;
    const previous = webViewLayoutRef.current;
    if (!previous || Math.abs(previous.width - width) > 0.5 || Math.abs(previous.height - height) > 0.5) {
      webViewLayoutEpochRef.current += 1;
      webViewLayoutRef.current = { width, height };
    }
  }, []);

  const onWebViewLoadStart = useCallback((event) => {
    rememberWebViewTag(event);
  }, [rememberWebViewTag]);

  const onMessage = useCallback((event) => {
    rememberWebViewTag(event);
    let msg;
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch (_e) {
      return;
    }
    if (!msg || !msg.__foeSync) return;
    if (
      msg.generation != null &&
      String(msg.generation) !== String(webGenerationRef.current)
    ) {
      return;
    }

    const messageDocumentId = msg.documentId == null ? null : String(msg.documentId);
    if (msg.kind === 'ready') {
      if (!messageDocumentId) return;
      const explicitStartedAt = Number(msg.documentStartedAt);
      const idStartedAt = Number(messageDocumentId.split('-')[0]);
      const messageStartedAt = Number.isFinite(explicitStartedAt) && explicitStartedAt > 0
        ? explicitStartedAt
        : (Number.isFinite(idStartedAt) && idStartedAt > 0 ? idStartedAt : 0);
      const isNewDocument = webDocumentIdRef.current !== messageDocumentId;

      // Android WebView викликає onLoadStart також для SPA/history-переходів.
      // Реальну зміну документа визначає лише новий id самого інтерсептора.
      // Старе queued-повідомлення не повинно повернути нас до попередньої сторінки.
      if (
        isNewDocument &&
        webDocumentIdRef.current &&
        messageStartedAt > 0 &&
        webDocumentStartedAtRef.current > messageStartedAt
      ) {
        return;
      }
      if (isNewDocument) {
        webDocumentEpochRef.current += 1;
        cityMapDocumentEpochRef.current = null;
        webDocumentIdRef.current = messageDocumentId;
        webDocumentStartedAtRef.current = messageStartedAt;
        webFullSizeSinceRef.current = webFullSizeActiveRef.current ? Date.now() : 0;
      }
      setHealth((h) => ({ ...h, ready: true }));
      return;
    }
    if (!messageDocumentId || messageDocumentId !== webDocumentIdRef.current) {
      return;
    }

    // Пакети й жести приймаємо лише від світу активної гільдії. Сторінка
    // порталу може надсилати тільки URL/діагностику вибору світу.
    const expectedHost = gameHostFromGuildId(guildIdRef.current);
    const messageHost = String(
      msg.pageHost || hostFromUrl(event?.nativeEvent?.url) || ''
    ).trim().toLowerCase();
    if (
      !['url', 'worldSelectDump'].includes(msg.kind) &&
      (!expectedHost || messageHost !== expectedHost)
    ) {
      return;
    }

    if (msg.kind === 'interactionProbe') {
      const pending = interactionProbeResolverRef.current;
      if (pending && String(msg.nonce) === String(pending.nonce)) {
        interactionProbeResolverRef.current = null;
        clearTimeout(pending.timeoutId);
        pending.resolve(msg.probe || null);
      }
      return;
    }

    if (msg.kind === 'authed') {
      // Логін/пароль прийнято — вхід у гру підтверджено. Прибираємо вікно гри
      // з екрана; WebView лишається змонтованим і доробляє вибір світу та
      // збір даних у фоні. Виняток — коли вікно закріплене вручну (діагностика).
      if (!webPinnedRef.current) setWebVisible(false);
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
    if (msg.kind === 'autoEnter' && msg.step) {
      const messageNonce = msg.attemptId == null ? null : String(msg.attemptId);
      if (activeAutoEnterNonceRef.current && !messageNonce) {
        return;
      }
      if (
        messageNonce &&
        messageNonce !== String(activeAutoEnterNonceRef.current || '')
      ) {
        return;
      }
      if (msg.step === 'watch_armed') {
        const pending = nativeWatchResolverRef.current;
        if (
          pending &&
          messageNonce === String(pending.nonce) &&
          String(msg.generation) === String(pending.generation)
        ) {
          nativeWatchResolverRef.current = null;
          clearTimeout(pending.timeoutId);
          pending.resolve(pending.nonce);
        }
      }
      if (msg.step === 'request_sent') {
        autoEnterRequestSentRef.current = true;
      }
      // ТИМЧАСОВО: живий лог тестового автокліка.
      setAutoEnterLog((prev) => [...prev, {
        step: msg.step, gridId: msg.gridId, target: msg.target, n: msg.n, at: msg.at || Date.now(),
      }].slice(-20));
      if (
        ['entered', 'wrong_grid', 'enter_failed', 'no_request', 'request_no_response', 'error']
          .includes(msg.step)
      ) {
        finishAutoEnter();
      }
      return;
    }
    if (msg.kind === 'calibPoint' && msg.point && msg.point.name) {
      // ТИМЧАСОВО: справжній дотик користувача — запамʼятовуємо й зберігаємо.
      // Для 'shipAfterAutoAim' довантажуємо, яку прокрутку ми щойно самі
      // застосували (для перевірки/уточнення формули авто-наведення).
      let point = msg.point;
      if (point.name === 'shipAfterAutoAim' && lastAutoAimRef.current) {
        point = { ...point, ...lastAutoAimRef.current };
      }
      setCalibPoints((prev) => {
        const next = { ...prev, [point.name]: point };
        AsyncStorage.setItem(CALIB_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
      return;
    }
    if (msg.kind === 'jsenv' && msg.tag) {
      // ТИМЧАСОВО: дамп JS-середовища гри (пошук гачка «відкрити поселення»).
      setFound((p) => ({ ...p, jsEnv: { ...(p.jsEnv || {}), [msg.tag]: msg } }));
      return;
    }
    if (msg.kind === 'rawlog' && msg.entry) {
      // ТИМЧАСОВО: сирі пакети для діагностики культурних поселень.
      // Власний унікальний _id: seq у грі скидається при кожному перезавантаженні
      // вікна гри, тож на нього спиратись як на ключ у списку не можна.
      rawLogIdRef.current += 1;
      const entry = { ...msg.entry, _id: rawLogIdRef.current };
      setRawLog((prev) => [entry, ...prev].slice(0, 150));
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
    if (msg.kind === 'settlementCatalog' && Array.isArray(msg.defs)) {
      setFound((p) => ({ ...p, settlementCatalogMeta: msg.defs }));
      return;
    }
    if (msg.kind === 'iconUrls' && msg.map && typeof msg.map === 'object') {
      setSettlementIconUrls((prev) => {
        const next = { ...prev, ...msg.map };
        if (Object.keys(next).length !== Object.keys(prev).length ||
            Object.keys(next).some((k) => next[k] !== prev[k])) {
          AsyncStorage.setItem(ICON_URLS_KEY, JSON.stringify(next)).catch(() => {});
        }
        return next;
      });
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
    // Додаткові спрайт-листи (іконки ресурсів поселення тощо). Пробуємо
    // розібрати як атлас; збережемо ті, де є кадри.
    if (msg.kind === 'spriteSheet' && msg.png && msg.json && msg.base) {
      if (!settlementSheetBasesRef.current.has(msg.base)) {
        settlementSheetBasesRef.current.add(msg.base);
        fetch(msg.json)
          .then((response) => response.json())
          .then((json) => {
            const { frames, sheetW, sheetH } = parseAtlas(json);
            if (frames && Object.keys(frames).length && sheetW && sheetH) {
              setSettlementSheets((prev) => {
                if (prev.some((sheet) => sheet.base === msg.base)) return prev;
                const next = [
                  ...prev,
                  { base: msg.base, pngUrl: msg.png, frames, sheetW, sheetH },
                ].slice(-12);
                const serialized = JSON.stringify(next);
                if (serialized.length < 1500000) {
                  AsyncStorage.setItem(SETTLEMENT_SHEETS_KEY, serialized).catch(() => {});
                }
                return next;
              });
            }
          })
          .catch(() => {});
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
        const hasSettlementMap = !!msg.found.settlementMap;
        if (msg.found.cityMap) {
          cityMapDocumentEpochRef.current = webDocumentEpochRef.current;
        }
        setFound((prev) => ({ ...prev, ...msg.found }));
        if (hasSettlementMap && autoEnterBusyRef.current) {
          finishAutoEnter();
        }
      }
    }
  }, [finishAutoEnter, rememberWebViewTag]);

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
        scope: 'city',
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
      // Пішли справжні дані гри — логін точно вдався, тримати вікно немає сенсу.
      // Виняток — вікно закріплене вручну (діагностика поселень).
      if (!webPinnedRef.current) setWebVisible(false);
      return;
    }
    if (!/forgeofempires\.com\/(page|game)/.test(currentUrl || '')) return;
    const t = setTimeout(() => {
      if (
        engagedRef.current &&
        healthRef.current.packets === 0 &&
        /\/page/.test(currentUrlRef.current || '')
      ) {
        // Без калібрування автовхід можливий і на першому запуску, коли
        // користувач іще не має ігрової сесії. Не перекривати форму логіна.
        if (stealthEnteringRef.current) {
          setAutoEnterLog((prev) => [...prev, { step: 'manual_login_required', at: Date.now() }].slice(-20));
          finishAutoEnter();
          setStealthEntering(false);
        }
        // Свіжий повнорозмірний WebView — інакше на частині пристроїв у полі
        // логіна/пароля не спливає екранна клавіатура.
        setWebKey((k) => k + 1);
        setWebVisible(true);
      }
    }, 15000);
    return () => clearTimeout(t);
  }, [currentUrl, health.packets, finishAutoEnter]);

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

  // Те саме, але для мапи культурного поселення (found.settlementMap). Розміри
  // й назви беруться зі спільного каталогу гри тим самим шляхом, що й для
  // головного міста, — тож уже побудовані споруди поселення можна перемалювати
  // в реальних габаритах, а не квадратиками 1×1.
  const settlementMapEntities = useMemo(
    () => (Array.isArray(found.settlementMap?.entities) ? found.settlementMap.entities : []),
    [found.settlementMap]
  );

  // Токени активного поселення ("Pirates", …) — з cityentity_id споруд на мапі.
  const settlementTokens = useMemo(() => {
    const set = new Set();
    for (const entity of settlementMapEntities) {
      const match = String(entity?.cid || '').match(/^[A-Za-z]{1,3}_([A-Za-z]+)_/);
      if (match) set.add(match[1].toLowerCase());
    }
    return set;
  }, [settlementMapEntities]);

  // Каталог із метаданих гри (StaticDataService.getMetadata) — усі споруди
  // поселення, у т.ч. ще не збудовані. Лишаємо тільки активне поселення й
  // прибираємо перешкоди (I_*) — це не будівлі.
  const settlementCatalogMeta = useMemo(() => {
    const list = Array.isArray(found.settlementCatalogMeta) ? found.settlementCatalogMeta : [];
    if (!settlementTokens.size) return [];
    return list.filter((item) => {
      const cid = String(item?.cid || '');
      if (/^I_/.test(cid)) return false;
      const match = cid.match(/^[A-Za-z]{1,3}_([A-Za-z]+)_/);
      return !!match && settlementTokens.has(match[1].toLowerCase());
    });
  }, [found.settlementCatalogMeta, settlementTokens]);

  // Список для довантаження визначень = споруди на мапі + ще не збудовані з
  // каталогу (щоб знати їхні назву/розмір/бонуси).
  const settlementResolveList = useMemo(() => {
    const seen = new Set(settlementMapEntities.map((entity) => String(entity?.cid || '')));
    const extra = settlementCatalogMeta
      .filter((item) => item?.cid && !seen.has(String(item.cid)))
      .map((item) => ({ cid: item.cid }));
    return [...settlementMapEntities, ...extra];
  }, [settlementMapEntities, settlementCatalogMeta]);

  const {
    defs: settlementDefs,
    progress: settlementDefsProgress,
  } = useResolvedBuildingDefs(settlementResolveList, {
    guildId,
    playerEra,
    activeLocale,
    buildingUrls: found.buildingUrls,
    buildingLookupUrl: found.buildingLookupUrl,
    scopeTag: 'settlement',
  });

  const settlementBuildings = useMemo(() => {
    const list = settlementMapEntities;
    return list.map((entity, index) => {
      const entityId = String(entity?.cid || '').trim();
      const requestedEra = resolveRequestedBuildingEra(entityId, entity?.era, playerEra);
      const definitionKey = `${entityId}@${requestedEra || 'unknown'}`;
      const definition = entityId ? settlementDefs?.[definitionKey] || null : null;
      const width = Number(definition?.width);
      const length = Number(definition?.length);
      const runtimeBonuses = Array.isArray(entity?.runtimeBonuses) ? entity.runtimeBonuses : [];
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
        bonuses: runtimeBonuses.length ? runtimeBonuses : (definition?.bonuses || []),
        definition,
        definitionStatus: definition?.resolved ? 'resolved' : definition?.error || 'loading',
      };
    });
  }, [settlementDefs, settlementMapEntities, playerEra]);

  // "Метадані по доступних для будівництва спорудах" — зведення за ТИПОМ споруди
  // (не за інстансом). Джерела: каталог гри (усі споруди поселення, у т.ч. ще
  // не збудовані) + мапа (скільки вже стоїть). Розмір/назва/бонуси — з
  // довантажених визначень, з відкатом на числа з каталогу.
  const settlementCatalog = useMemo(() => {
    const builtCount = new Map();
    const builtSample = new Map(); // cid -> уже перемальований інстанс (справжні розміри)
    for (const building of settlementBuildings) {
      if (!building.entityId) continue;
      builtCount.set(building.entityId, (builtCount.get(building.entityId) || 0) + 1);
      if (!builtSample.has(building.entityId) || building.definitionStatus === 'resolved') {
        builtSample.set(building.entityId, building);
      }
    }

    const metaByCid = new Map(
      settlementCatalogMeta.filter((item) => item?.cid).map((item) => [String(item.cid), item])
    );
    // Порядок: спершу все з каталогу гри, потім те, що є на мапі, але не
    // потрапило в каталог (напр. ратуша/особливі), — без дублів.
    const cids = [];
    const seen = new Set();
    for (const item of settlementCatalogMeta) {
      const cid = String(item?.cid || '');
      if (cid && !seen.has(cid)) { seen.add(cid); cids.push(cid); }
    }
    for (const building of settlementBuildings) {
      const cid = building.entityId;
      if (cid && !seen.has(cid) && !/^I_/.test(cid)) { seen.add(cid); cids.push(cid); }
    }

    return cids.map((cid) => {
      const requestedEra = resolveRequestedBuildingEra(cid, null, playerEra);
      const definition =
        builtSample.get(cid)?.definition ||
        settlementDefs?.[`${cid}@${requestedEra || 'unknown'}`] ||
        null;
      const meta = metaByCid.get(cid) || null;
      const sample = builtSample.get(cid) || null;
      const width =
        Number(sample?.footprint?.width) || Number(definition?.width) || Number(meta?.w) || null;
      const length =
        Number(sample?.footprint?.length) || Number(definition?.length) || Number(meta?.l) || null;
      const built = builtCount.get(cid) || 0;
      return {
        cid,
        name: sample?.name || definition?.name || meta?.name || cid,
        type: settlementCategory(cid, definition?.type || sample?.type || meta?.type),
        width: width && width > 0 ? width : null,
        length: length && length > 0 ? length : null,
        bonuses: definition?.bonuses || [],
        requirements: meta?.req || null,
        built,
        buildable: built === 0,
        resolved: !!definition?.resolved || (!!width && !!length),
      };
    }).sort((a, b) => {
      if (a.buildable !== b.buildable) return a.buildable ? 1 : -1; // збудовані вгорі
      return String(a.type).localeCompare(String(b.type)) || String(a.cid).localeCompare(String(b.cid));
    });
  }, [settlementBuildings, settlementCatalogMeta, settlementDefs, playerEra]);

  // Виробництва поселення: рядок на кожну будівлю, у якої Є виробничий цикл
  // (interceptor кладе стан у entity.prod лише для таких — перешкоди й чисто
  // дипломатичні споруди туди не потрапляють). Додатково відкидаємо ті, чий
  // єдиний продукт — дипломатія (збирати нема чого).
  // Сортування: спершу готові до збору, далі за часом завершення.
  const settlementProductions = useMemo(() => {
    const rows = settlementBuildings
      .filter((building) => {
        const prod = building?.prod;
        if (!prod || typeof prod !== 'object') return false;
        const keys = Object.keys(prod.det || {});
        const onlyDiplomacy = keys.length > 0 && keys.every((key) => /diploma/i.test(key));
        if (onlyDiplomacy) return false;
        return true;
      })
      .map((building) => ({
        instanceId: building.instanceId,
        cid: building.entityId,
        name: building.name || building.entityId,
        type: settlementCategory(building.entityId, building.definition?.type || building.type),
        ready: !!building.prod.ready,
        readyAt: Number(building.prod.readyAt) || null,
        productName: building.prod.name || null,
        product: building.prod.det || null,
        state: building.prod.st || null,
      }));
    rows.sort((a, b) => {
      if (a.ready !== b.ready) return a.ready ? -1 : 1;
      const ta = a.readyAt || Infinity;
      const tb = b.readyAt || Infinity;
      if (ta !== tb) return ta - tb;
      return String(a.name).localeCompare(String(b.name));
    });
    return rows;
  }, [settlementBuildings]);

  // Приховане вікно гри вантажимо лише коли є замовник (або доробка збору,
  // або ручний вхід). Поза цим — жодного WebView, жодного навантаження.
  const webActive = consent === 'yes' && !!gameUrl && (engaged || linger || stealthEntering);
  const canAutoEnterSettlement = consent === 'yes' && !!gameUrl &&
    (Platform.OS === 'android' ? HAS_NATIVE_AUTO_AIM : !!calibPoints?.ship);

  const value = {
    guildId,
    userId,
    consent,
    acceptConsent,
    reload,
    retainSync,
    webActive,
    webVisible,
    setWebVisible,
    openGameWindow,
    closeGameWindow,
    pinGameWindow,
    unpinGameWindow,
    webPinned,
    armCalibration,
    calibPoints,
    resetCalibration,
    tryAutoEnter,
    tryProbeClick,
    tryAutoAimEnter,
    autoEnterSettlementQuietly,
    canAutoEnterSettlement,
    debugScrollAndReveal,
    stealthEntering,
    autoEnterLog,
    autoAimMeasurements,
    autoEnterBusy,
    currentUrl,
    health,
    synced: health.packets > 0,
    player,
    found,
    seen,
    rawLog,
    iconSheet,
    goodsSheet,
    settlementSheets,
    settlementIconUrls,
    buildingDefs,
    cityBuildings,
    defsProgress,
    settlementDefs,
    settlementBuildings,
    settlementDefsProgress,
    settlementCatalog,
    settlementProductions,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {webActive ? (
        <View
          pointerEvents={webVisible || stealthEntering ? 'auto' : 'none'}
          style={
            webVisible
              ? {
                  position: 'absolute',
                  top: 0,
                  left: debugShrink ? '12%' : 0,
                  right: debugShrink ? '12%' : 0,
                  bottom: debugShrink ? '18%' : 0,
                  zIndex: 9999,
                  backgroundColor: '#0f1115',
                }
              : stealthEntering
                ? {
                    // ВАЖЛИВО: НЕ opacity:0 і НЕ від'ємний zIndex — обидва
                    // змушували Android/WebView вважати вікно "невидимим" і
                    // притримувати рендер/requestAnimationFrame гри, через що
                    // клік по кораблю ніколи не спрацьовував (enter_failed).
                    // Тому WebView тут технічно ПОВНІСТЮ видиме (як при
                    // ручному вході) — просто накрите власним непрозорим
                    // екраном завантаження нижче, який і бачить користувач.
                    position: 'absolute',
                    top: 0,
                    left: debugShrink ? '12%' : 0,
                    right: debugShrink ? '12%' : 0,
                    bottom: debugShrink ? '18%' : 0,
                    zIndex: 9999,
                    backgroundColor: '#0f1115',
                    // Захист від витоку зображення гри з-під екрана
                    // завантаження, якщо контент WebView колись виявиться
                    // більшим за цю область (напр. інший розмір вікна).
                    overflow: 'hidden',
                  }
                : { position: 'absolute', width: 1, height: 1, opacity: 0, top: -10 }
          }
        >
          {webVisible && webPinned ? (
            // ТИМЧАСОВО: панель діагностики поселень — ПОВЕРХ гри, бо гра на
            // весь екран і кнопки екрана діагностики під нею недосяжні.
            <View
              style={{
                paddingHorizontal: 10,
                paddingTop: 8 + insets.top,
                paddingBottom: 8,
                backgroundColor: '#152330',
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: '#f4f7fb', fontWeight: '700', fontSize: 12 }}>
                  Діагностика поселення
                </Text>
                <TouchableOpacity onPress={unpinGameWindow}>
                  <Text style={{ color: '#4ea1ff', fontWeight: '700' }}>Сховати гру</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                disabled={autoEnterBusy}
                accessibilityRole="button"
                accessibilityLabel="Змінити розмір гри та перезавантажити для тесту наведення"
                onPress={() => {
                  if (autoEnterBusyRef.current) return;
                  setDebugShrink((v) => !v);
                  setWebKey((k) => k + 1);
                }}
                style={{
                  marginTop: 6, minHeight: 30, borderRadius: 8, alignItems: 'center',
                  justifyContent: 'center', backgroundColor: debugShrink ? '#ffa51f33' : '#1b2b3b',
                  borderWidth: 1, borderColor: debugShrink ? '#ffa51f' : '#36516a',
                  opacity: autoEnterBusy ? 0.35 : 1,
                }}
              >
                <Text style={{ color: '#f4f7fb', fontSize: 11, fontWeight: '700' }}>
                  {debugShrink ? '✓ Стиснуте вікно (тест іншого екрана) — вимкнути' : 'Стиснути вікно (тест іншого екрана)'}
                </Text>
              </TouchableOpacity>
              <Text numberOfLines={2} style={{ height: 30, color: '#9aa3b2', fontSize: 10 }}>
                {autoAimMeasurements.length
                  ? `Останній тест: ${autoAimMeasurements[autoAimMeasurements.length - 1].debugShrink ? 'стиснутий' : 'повний'} · canvas ${autoAimMeasurements[autoAimMeasurements.length - 1].plan.geometry.width}×${autoAimMeasurements[autoAimMeasurements.length - 1].plan.geometry.height} CSS`
                  : 'Розміри тесту з’являться після авто-наведення; деталі — у технічних даних.'}
              </Text>
              <Text style={{ color: '#9aa3b2', fontSize: 11, marginTop: 4 }}>
                Прогорни місто ОДНИМ пальцем (важливо — записуємо сам скрол,
                щоб «Тест» міг його повторити) до корабля поселення, закрий
                спливаючі вікна, тоді тисни «Корабель» і одразу тапай по
                ньому. «Повернутись у місто» більше не калібруємо — після
                входу просто «Сховати гру».
              </Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                <TouchableOpacity
                  disabled={autoEnterBusy}
                  onPress={() => arm('ship')}
                  style={{
                    flex: 1, minHeight: 36, borderRadius: 8, alignItems: 'center',
                    justifyContent: 'center', backgroundColor: armed === 'ship' ? '#ffa51f33' : '#1b2b3b',
                    borderWidth: 1, borderColor: armed === 'ship' ? '#ffa51f' : '#36516a',
                    opacity: autoEnterBusy ? 0.35 : 1,
                  }}
                >
                  <Text style={{ color: '#f4f7fb', fontSize: 11, fontWeight: '700' }}>
                    {calibPoints.ship ? '✓ ' : ''}{armed === 'ship' ? 'Чекаю тап…' : 'Корабель'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={!calibPoints.ship || autoEnterBusy}
                  onPress={() => tryAutoEnter(calibPoints)}
                  style={{
                    flex: 1, minHeight: 36, borderRadius: 8, alignItems: 'center',
                    justifyContent: 'center', backgroundColor: '#4ea1ff',
                    opacity: calibPoints.ship && !autoEnterBusy ? 1 : 0.35,
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                    {autoEnterBusy ? 'Тест…' : 'Тест'}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={{ color: '#9aa3b2', fontSize: 10, marginTop: 6 }}>
                Перевірка: клік на будь-якій нерухомій кнопці в грі, куди не
                треба скролити (напр. іконка меню внизу) — щоб зʼясувати, чи
                винен скрол камери.
              </Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                <TouchableOpacity
                  disabled={autoEnterBusy}
                  onPress={() => arm('probe')}
                  style={{
                    flex: 1, minHeight: 36, borderRadius: 8, alignItems: 'center',
                    justifyContent: 'center', backgroundColor: armed === 'probe' ? '#ffa51f33' : '#1b2b3b',
                    borderWidth: 1, borderColor: armed === 'probe' ? '#ffa51f' : '#36516a',
                    opacity: autoEnterBusy ? 0.35 : 1,
                  }}
                >
                  <Text style={{ color: '#f4f7fb', fontSize: 11, fontWeight: '700' }}>
                    {calibPoints.probe ? '✓ ' : ''}{armed === 'probe' ? 'Чекаю тап…' : 'Точка (без скролу)'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={!calibPoints.probe || autoEnterBusy}
                  onPress={() => tryProbeClick(calibPoints.probe)}
                  style={{
                    flex: 1, minHeight: 36, borderRadius: 8, alignItems: 'center',
                    justifyContent: 'center', backgroundColor: '#4ea1ff',
                    opacity: calibPoints.probe && !autoEnterBusy ? 1 : 0.35,
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Тест точки</Text>
                </TouchableOpacity>
              </View>
              <Text style={{ color: '#9aa3b2', fontSize: 10, marginTop: 6 }}>
                Наведення без калібрування: прокрутка й точка кліку рахуються
                від поточного розміру canvas. Починай зі щойно завантаженої гри.
              </Text>
              <TouchableOpacity
                disabled={autoEnterBusy || !HAS_NATIVE_AUTO_AIM}
                onPress={tryAutoAimEnter}
                style={{
                  minHeight: 36, borderRadius: 8, alignItems: 'center',
                  justifyContent: 'center', backgroundColor: '#2e7d32', marginTop: 6,
                  opacity: autoEnterBusy || !HAS_NATIVE_AUTO_AIM ? 0.35 : 1,
                }}
              >
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                  Авто-наведення (без тапу)
                </Text>
              </TouchableOpacity>
              <Text style={{ color: '#9aa3b2', fontSize: 10, marginTop: 6 }}>
                Якщо кораблик зараз видно на екрані (навіть не по центру) —
                тапни по ньому один раз: це друга точка для перевірки формули.
              </Text>
              <TouchableOpacity
                onPress={() => arm('shipAfterAutoAim')}
                style={{
                  minHeight: 36, borderRadius: 8, alignItems: 'center',
                  justifyContent: 'center', marginTop: 6,
                  backgroundColor: armed === 'shipAfterAutoAim' ? '#ffa51f33' : '#1b2b3b',
                  borderWidth: 1, borderColor: armed === 'shipAfterAutoAim' ? '#ffa51f' : '#36516a',
                }}
              >
                <Text style={{ color: '#f4f7fb', fontSize: 11, fontWeight: '700' }}>
                  {calibPoints.shipAfterAutoAim ? '✓ ' : ''}
                  {armed === 'shipAfterAutoAim' ? 'Чекаю тап…' : 'Кораблик зараз тут'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() =>
                  webViewRef.current?.injectJavaScript(
                    'window.__foeDismissPopups && window.__foeDismissPopups(); true;'
                  )
                }
                style={{
                  minHeight: 32, borderRadius: 8, alignItems: 'center',
                  justifyContent: 'center', marginTop: 6,
                  backgroundColor: '#1b2b3b', borderWidth: 1, borderColor: '#36516a',
                }}
              >
                <Text style={{ color: '#f4f7fb', fontSize: 11, fontWeight: '700' }}>
                  Закрити спливаючі вікна (тест)
                </Text>
              </TouchableOpacity>
              {autoEnterLog.length ? (
                <Text style={{ color: '#9aa3b2', fontSize: 10, marginTop: 4 }} numberOfLines={2}>
                  {AUTO_STEP_LABELS[autoEnterLog[autoEnterLog.length - 1].step] ||
                    autoEnterLog[autoEnterLog.length - 1].step}
                  {autoEnterLog[autoEnterLog.length - 1].target
                    ? ` · ${autoEnterLog[autoEnterLog.length - 1].target}`
                    : ''}
                </Text>
              ) : null}
            </View>
          ) : webVisible ? (
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingHorizontal: 14,
                paddingTop: 10 + insets.top,
                paddingBottom: 10,
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
            ref={webViewRef}
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
            onLoadStart={onWebViewLoadStart}
            onLayout={onWebViewLayout}
            onMessage={onMessage}
          />
          {stealthEntering ? (
            // Непрозорий екран поверх ЦІЛКОМ видимого WebView — користувач
            // бачить тільки це, гру під ним — ніколи.
            <View
              style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: '#0f1115', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <ActivityIndicator color="#4ea1ff" size="large" />
              <Text style={{ color: '#9aa3b2', fontSize: 13, marginTop: 12 }}>
                Отримуємо дані поселення…
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Ctx.Provider>
  );
}
