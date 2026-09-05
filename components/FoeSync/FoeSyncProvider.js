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
import { NativeModules, Platform, Text, TouchableOpacity, View } from 'react-native';
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
} from './FoeIcon';
import { getBuildingDefs } from '../../src/services/foeBuildings';

const {
  normalizeEra,
  normalizeLocale,
  resolveRequestedBuildingEra,
} = require('../../src/services/foeBuildingMetadata');

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ТИМЧАСОВО: по Y камера впирається в межу мапи (перевірено: запит
// прокрутки на 686px замість 495px дав ІДЕНТИЧНИЙ результат — canvasY=237
// обидва рази, той самий canvas 1024×908) — тому для Y досить прокрутити
// ЗАВІДОМО забагато (вона однаково впреться в межу) і клікнути туди, де
// корабель щоразу реально опиняється (SHIP_CLAMP_Y_RATIO = 0.261 висоти).
//
// По X межі НЕМАЄ — камера просто їде далі й далі на всю запитану відстань
// (перевірено: 646.7px і 699.4px дали РІЗний, хоч і близький, результат:
// canvasX 419 і 407). Тому для X — НЕ "із запасом", а якомога точніше
// виміряне значення: SHIP_DRAG_X_PX (середнє з двох замірів на canvas
// шириною 1024; масштабування на іншу ширину поки не перевірене).
// Виміряне 0.261/0.403 влучило (поселення відкрилось), але користувач
// сказав, що сам тапнув би трохи правіше й трохи вище — невеликий зсув
// цільової точки клікання (сам скрол/SHIP_DRAG_X_PX не чіпаємо).
const SHIP_CLAMP_Y_RATIO = 0.261 - 0.03;
const SHIP_OVERDRIVE_Y_DIR = 1;
const SHIP_OVERDRIVE_MULT = 2.5; // помножується на висоту canvas
const SHIP_DRAG_X_PX = -673; // середнє: -699.42 та -646.7
const SHIP_TARGET_X_RATIO = 0.403 + 0.03; // де корабель реально опинився після SHIP_DRAG_X_PX (canvasX≈413 з 1024)

const worldIdFromGuildId = (g) => String(g || '').split('_')[0].trim() || null;
const gameUrlFromGuildId = (g) => {
  const w = worldIdFromGuildId(g);
  return w ? `https://${w}.forgeofempires.com/game/index?` : null;
};

// Скільки тримати приховане вікно гри після того, як зник останній екран-
// замовник. Вистачає, щоб добрати перші пакети, бонуси й мапу міста.
const SYNC_LINGER_MS = 90 * 1000;
const CALIB_KEY = 'foeSettlementCalib_v1'; // ТИМЧАСОВО: діагностика поселень
const { FoeWebViewGesture } = NativeModules;
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

export function FoeSyncProvider({ children }) {
  const guildContext = useContext(GuildContext);
  const { i18n } = useTranslation();
  const insets = useSafeAreaInsets();

  const [guildId, setGuildId] = useState(guildContext?.guildId || null);
  const [userId, setUserId] = useState(null);
  const [consent, setConsent] = useState(null); // null | 'yes' | 'no'
  const [webKey, setWebKey] = useState(0);
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
  // ТИМЧАСОВО: "тихий" автовхід у поселення — вікно гри монтується на повний
  // розмір (щоб авто-наведення рахувало правильно) але невидиме (opacity 0,
  // pointerEvents none), користувач нічого не бачить. Окремо від webVisible/
  // webPinned, щоб не зачіпати ручний потік і панель кнопок.
  const [stealthEntering, setStealthEntering] = useState(false);
  const stealthEnteringRef = useRef(false);
  const pendingAuthedResolveRef = useRef(null);
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
  const canvasRectResolverRef = useRef(null);
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

  // ТИМЧАСОВО: тестовий автоклік по вже збереженій точці "корабель" — щоб
  // перевірити, чи гра взагалі реагує на синтетичний клік (не справжній дотик).
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
  }, []);
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
    if (Platform.OS !== 'android' || !hasRecordedPan) {
      if (!injectAutoEnter(scrollDx, scrollDy)) { finishAutoEnter(); }
      return;
    }

    const reactTag = Number(webViewTagRef.current);
    const viewportWidth = Number(ship.viewportW || ship.canvasW);
    const viewportHeight = Number(ship.viewportH || ship.canvasH);
    if (
      typeof FoeWebViewGesture?.swipe !== 'function' ||
      !Number.isInteger(reactTag) ||
      reactTag <= 0 ||
      !Number.isFinite(viewportWidth) ||
      !Number.isFinite(viewportHeight) ||
      viewportWidth <= 0 ||
      viewportHeight <= 0
    ) {
      setAutoEnterLog((prev) => [...prev, {
        step: 'native_pan_failed',
        target: 'міст або розміри WebView недоступні — потрібна нова Android-збірка/калібровка',
        at: Date.now(),
      }].slice(-20));
      finishAutoEnter();
      return;
    }

    setAutoEnterLog((prev) => [...prev, {
      step: 'panning', target: 'Android MotionEvent', at: Date.now(),
    }].slice(-20));
    try {
      await FoeWebViewGesture.swipe(
        reactTag,
        scrollDx / viewportWidth,
        scrollDy / viewportHeight
      );
      setAutoEnterLog((prev) => [...prev, { step: 'pan_done', at: Date.now() }].slice(-20));
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (!injectAutoEnter(0, 0)) { finishAutoEnter(); }
    } catch (error) {
      setAutoEnterLog((prev) => [...prev, {
        step: 'native_pan_failed',
        target: String(error?.code || 'невідома помилка'),
        at: Date.now(),
      }].slice(-20));
      finishAutoEnter();
    }
  }, [finishAutoEnter]);
  // ТИМЧАСОВО: клік на нерухомій точці (без скролу) — щоб перевірити, чи
  // винен скрол камери, а не сам механізм синтетичного кліка.
  const tryProbeClick = useCallback((point) => {
    if (!point || autoEnterBusyRef.current) { return; }
    setAutoEnterLog([{ step: 'start', at: Date.now() }]);
    webViewRef.current?.injectJavaScript(
      `window.__foeSynthClickAt && window.__foeSynthClickAt(${point.clientX}, ${point.clientY}); true;`
    );
  }, []);

  // ТИМЧАСОВО: розмір/позиція canvas гри без тапу (потрібно, щоб знати, куди
  // саме на екрані центрувати корабель, і без жодного калібрування).
  const getCanvasRect = useCallback(() => new Promise((resolve) => {
    if (!webViewRef.current) { resolve(null); return; }
    canvasRectResolverRef.current = resolve;
    webViewRef.current.injectJavaScript('window.__foeGetCanvasRect && window.__foeGetCanvasRect(); true;');
    setTimeout(() => {
      if (canvasRectResolverRef.current === resolve) {
        canvasRectResolverRef.current = null;
        resolve(null);
      }
    }, 1500);
  }), []);

  // ТИМЧАСОВО (експеримент): вхід у поселення БЕЗ ручного калібрування —
  // перевіряє, що потрібні дані з мапи міста (корабель + ратуша) вже є, тоді
  // свідомо прокручує "занадто багато" в перевіреному напрямку (камера сама
  // впреться в межу мапи) і клікає туди, де корабель тоді реально опиняється
  // (SHIP_CLAMP_X/Y_RATIO). Якщо позиція невірна — просто не влучить;
  // калібрування вручну лишається як резерв.
  const tryAutoAimEnter = useCallback(async () => {
    if (autoEnterBusyRef.current) { return; }
    const entities = foundRef.current?.cityMap?.entities || [];
    const ship = entities.find((e) => e.type === 'outpost_ship');
    const townhall = entities.find((e) => e.type === 'main_building');
    if (
      !ship || !townhall ||
      ![ship.x, ship.y, townhall.x, townhall.y].every(Number.isFinite)
    ) {
      setAutoEnterLog([{ step: 'autoaim_missing_data', at: Date.now() }]);
      return;
    }
    if (
      Platform.OS !== 'android' ||
      typeof FoeWebViewGesture?.swipe !== 'function'
    ) {
      setAutoEnterLog([{ step: 'autoaim_unsupported', at: Date.now() }]);
      return;
    }
    const reactTag = Number(webViewTagRef.current);
    if (!Number.isInteger(reactTag) || reactTag <= 0) {
      setAutoEnterLog([{ step: 'autoaim_missing_data', at: Date.now() }]);
      return;
    }

    autoEnterBusyRef.current = true;
    setAutoEnterBusy(true);
    setAutoEnterLog([{ step: 'autoaim_start', at: Date.now() }]);

    // Спроба закрити спливаюче вікно "останні події" (якщо є) ще до
    // прокрутки/кліка — інакше клік по кораблю може лише закрити його.
    webViewRef.current?.injectJavaScript('window.__foeDismissPopups && window.__foeDismissPopups(); true;');
    await new Promise((resolve) => setTimeout(resolve, 400));

    // Canvas може ще не існувати відразу після завантаження сторінки
    // (особливо в тихому фоновому вході, де немає людини, яка чекає оком) —
    // тому пробуємо кілька разів із паузою, а не один раз.
    let rect = null;
    for (let attempt = 0; attempt < 5 && !(rect && rect.width && rect.height); attempt += 1) {
      if (attempt > 0) { await new Promise((resolve) => setTimeout(resolve, 800)); }
      rect = await getCanvasRect();
    }
    if (!rect || !rect.width || !rect.height) {
      setAutoEnterLog((prev) => [...prev, { step: 'autoaim_no_canvas', at: Date.now() }].slice(-20));
      finishAutoEnter();
      return;
    }

    const dx = ship.x - townhall.x;
    const dy = ship.y - townhall.y;
    // X — точне виміряне значення (тут немає межі, яка б сама зупинила рух).
    // Y — свідомо "занадто багато": камера впреться в межу мапи сама.
    const dragX = SHIP_DRAG_X_PX;
    const dragY = SHIP_OVERDRIVE_Y_DIR * SHIP_OVERDRIVE_MULT * rect.height;
    lastAutoAimRef.current = { dx, dy, appliedDragX: dragX, appliedDragY: dragY };

    setAutoEnterLog((prev) => [...prev, { step: 'autoaim_panning', at: Date.now() }].slice(-20));
    try {
      await FoeWebViewGesture.swipe(reactTag, dragX / rect.width, dragY / rect.height);
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

    await new Promise((resolve) => setTimeout(resolve, 300));
    if (!webViewRef.current) { finishAutoEnter(); return; }
    const clampX = rect.left + rect.width * SHIP_TARGET_X_RATIO;
    const clampY = rect.top + rect.height * SHIP_CLAMP_Y_RATIO;
    webViewRef.current.injectJavaScript(
      `window.__foeShowAimMarker && window.__foeShowAimMarker(${clampX}, ${clampY});
       window.__foeAutoEnterTest && window.__foeAutoEnterTest(${clampX}, ${clampY}, 0, 0); true;`
    );
    if (autoEnterTimeoutRef.current) clearTimeout(autoEnterTimeoutRef.current);
    autoEnterTimeoutRef.current = setTimeout(() => {
      setAutoEnterLog((prev) => [...prev, { step: 'enter_failed', at: Date.now() }].slice(-20));
      finishAutoEnter();
    }, 35 * 1000);
  }, [finishAutoEnter, getCanvasRect]);

  // ТИМЧАСОВО: повністю фоновий, непомітний вхід у поселення. Монтує вікно
  // гри НАНОВО (webKey, як «Відкрити гру») на повний розмір — авто-наведення
  // рахує координати правильно тільки з реальним розміром canvas, — але
  // невидиме (opacity 0, поза дотиком користувача). Заходить у поселення тим
  // самим механізмом (tryAutoAimEnter), тоді відразу стискається назад до
  // звичного прихованого 1×1, щоб не тримати повнорозмірний рендер довше,
  // ніж треба для одного входу.
  const autoEnterSettlementQuietly = useCallback(async () => {
    if (stealthEnteringRef.current || autoEnterBusyRef.current) { return; }
    if (foundRef.current?.settlementMap) { return; }
    const entities = foundRef.current?.cityMap?.entities || [];
    const ship = entities.find((e) => e.type === 'outpost_ship');
    const townhall = entities.find((e) => e.type === 'main_building');
    if (!ship || !townhall) { return; }

    stealthEnteringRef.current = true;
    setStealthEntering(true);
    setWebKey((k) => k + 1);

    try {
      await new Promise((resolve) => {
        pendingAuthedResolveRef.current = resolve;
        setTimeout(() => {
          if (pendingAuthedResolveRef.current === resolve) {
            pendingAuthedResolveRef.current = null;
            resolve();
          }
        }, 15000);
      });
      // Дати грі час доробити початкову ініціалізацію (вибір світу, побудова
      // canvas тощо) перш ніж рахувати його розмір і клікати. У видимому
      // режимі на це фактично йшов час, поки людина сама дивилась на екран
      // і тицяла кнопку — тут цього немає, тож пауза довша.
      await new Promise((resolve) => setTimeout(resolve, 3000));

      await new Promise((resolve) => {
        pendingAutoEnterResolveRef.current = resolve;
        tryAutoAimEnter();
        setTimeout(() => {
          if (pendingAutoEnterResolveRef.current === resolve) {
            pendingAutoEnterResolveRef.current = null;
            resolve();
          }
        }, 40 * 1000);
      });
      // Невеликий запас, щоб встигла прийти й розпарситись відповідь мапи
      // поселення (found.settlementMap) до того, як згорнемо вікно.
      await new Promise((resolve) => setTimeout(resolve, 500));
    } finally {
      setStealthEntering(false);
      stealthEnteringRef.current = false;
    }
  }, [tryAutoAimEnter]);

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
  const [buildingDefs, setBuildingDefs] = useState(null);
  const [defsProgress, setDefsProgress] = useState(null);

  const iconSheetUrlsRef = useRef(null);
  const goodsSheetUrlsRef = useRef(null);
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
    webViewTagRef.current = null;
    if (autoEnterTimeoutRef.current) {
      clearTimeout(autoEnterTimeoutRef.current);
      autoEnterTimeoutRef.current = null;
    }
    autoEnterBusyRef.current = false;
    setAutoEnterBusy(false);
    setWebPinned(false);
    setBuildingDefs(null);
    setDefsProgress(null);
    setWebVisible(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [c, u, g, sheet, gSheet, calib] = await Promise.all([
        AsyncStorage.getItem(FOE_CONSENT_KEY),
        AsyncStorage.getItem('userId'),
        AsyncStorage.getItem('guildId'),
        loadCachedIconSheet(),
        loadCachedGoodsSheet(),
        AsyncStorage.getItem(CALIB_KEY),
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

  const rememberWebViewTag = useCallback((event) => {
    const reactTag = Number(event?.nativeEvent?.target);
    if (Number.isInteger(reactTag) && reactTag > 0) {
      webViewTagRef.current = reactTag;
    }
  }, []);

  const onMessage = useCallback((event) => {
    rememberWebViewTag(event);
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
    if (msg.kind === 'authed') {
      // Логін/пароль прийнято — вхід у гру підтверджено. Прибираємо вікно гри
      // з екрана; WebView лишається змонтованим і доробляє вибір світу та
      // збір даних у фоні. Виняток — коли вікно закріплене вручну (діагностика).
      if (!webPinnedRef.current) setWebVisible(false);
      if (pendingAuthedResolveRef.current) {
        const resolve = pendingAuthedResolveRef.current;
        pendingAuthedResolveRef.current = null;
        resolve();
      }
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
      // ТИМЧАСОВО: живий лог тестового автокліка.
      setAutoEnterLog((prev) => [...prev, {
        step: msg.step, gridId: msg.gridId, target: msg.target, n: msg.n, at: msg.at || Date.now(),
      }].slice(-20));
      if (['entered', 'wrong_grid', 'enter_failed', 'error'].includes(msg.step)) {
        finishAutoEnter();
      }
      return;
    }
    if (msg.kind === 'canvasRect') {
      // ТИМЧАСОВО: відповідь на запит розміру canvas для авто-наведення.
      if (canvasRectResolverRef.current) {
        canvasRectResolverRef.current(msg.rect || null);
        canvasRectResolverRef.current = null;
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
        // Свіжий повнорозмірний WebView — інакше на частині пристроїв у полі
        // логіна/пароля не спливає екранна клавіатура.
        setWebKey((k) => k + 1);
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

  // Приховане вікно гри вантажимо лише коли є замовник (або доробка збору,
  // або ручний вхід). Поза цим — жодного WebView, жодного навантаження.
  const webActive = consent === 'yes' && !!gameUrl && (engaged || linger);

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
    stealthEntering,
    autoEnterLog,
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
    buildingDefs,
    cityBuildings,
    defsProgress,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {webActive ? (
        <View
          pointerEvents={webVisible ? 'auto' : 'none'}
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
                    // ВАЖЛИВО: НЕ від'ємний zIndex — інакше Android може
                    // вважати WebView "поза екраном" і притримувати його
                    // рендеринг/JS, через що вся авто-навігація тихо виснуть.
                    // opacity:0 + pointerEvents:'none' (див. вище) достатньо,
                    // щоб лишатись невидимим і не заважати дотикам.
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 9999,
                    opacity: 0,
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
                onPress={() => setDebugShrink((v) => !v)}
                style={{
                  marginTop: 6, minHeight: 30, borderRadius: 8, alignItems: 'center',
                  justifyContent: 'center', backgroundColor: debugShrink ? '#ffa51f33' : '#1b2b3b',
                  borderWidth: 1, borderColor: debugShrink ? '#ffa51f' : '#36516a',
                }}
              >
                <Text style={{ color: '#f4f7fb', fontSize: 11, fontWeight: '700' }}>
                  {debugShrink ? '✓ Стиснуте вікно (тест іншого екрана) — вимкнути' : 'Стиснути вікно (тест іншого екрана)'}
                </Text>
              </TouchableOpacity>
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
                Експеримент: узагалі без тапу — сам рахує, куди прогорнути, за
                координатами корабля й ратуші з мапи міста.
              </Text>
              <TouchableOpacity
                disabled={
                  autoEnterBusy ||
                  !(found.cityMap?.entities || []).some((e) => e.type === 'outpost_ship') ||
                  !(found.cityMap?.entities || []).some((e) => e.type === 'main_building')
                }
                onPress={tryAutoAimEnter}
                style={{
                  minHeight: 36, borderRadius: 8, alignItems: 'center',
                  justifyContent: 'center', backgroundColor: '#2e7d32', marginTop: 6,
                  opacity:
                    autoEnterBusy ||
                    !(found.cityMap?.entities || []).some((e) => e.type === 'outpost_ship') ||
                    !(found.cityMap?.entities || []).some((e) => e.type === 'main_building')
                      ? 0.35
                      : 1,
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
            onLoadStart={rememberWebViewTag}
            onMessage={onMessage}
          />
        </View>
      ) : null}
    </Ctx.Provider>
  );
}
