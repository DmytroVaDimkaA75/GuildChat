// Виміряно на живому телефоні: один калібрований свайп доводить корабель саме
// в цю точку. Попереднє canvasY (228) було нижче за корабель — свайп працював,
// а тап падав під нього.
// Мітку тримаємо довго: людина наводить її руками, поспішати нема куди.
const AIM_MARKER_MS = 900000;
// Грубий свайп: одним махом покриваємо більшу частину шляху до корабля. Довжина
// СТАЛА і живе в коді — тільки тоді інерція від нього щоразу однакова, а отже
// передбачувана. Палець іде вліво, бо від лівого верхнього кута корабель завжди
// праворуч. Те, що лишиться після цього маху, доміряється дрібними кроками.
const COARSE_SCREENS = 2.5;
// Крок однієї стрілки калібрувальника — частка екрана. Рухає камеру САМ
// застосунок, тими самими нативними жестами, якими потім відтворюватиме шлях.
// Вимірювати пальцем не можна: гра прокручує з інерцією, тож один і той самий
// кінцевий кадр дає геть різні числа залежно від того, махнули ви чи тягнули.
const CALIB_STEP = 0.1;
// Пауза між кроками під час відтворення — щоб інерція встигала згаснути так
// само, як вона гасла між натисканнями людини.
const CALIB_STEP_GAP_MS = 150;
// Довжина відходу в кут, у екранах. Навмисне більша за будь-яку мапу: камера
// однаково впреться в межу, тож де б вона не була — опиниться в тому самому куті.
const CORNER_SCREENS = 5;
// Скільки чекаємо на реакцію гри після ручного тапу, перш ніж пропонувати ще раз.
const TAP_SETTLE_MS = 5000;
// Скільки щонайбільше чекаємо, поки гра почне малювати кадри, перш ніж свайпати.
const READY_WAIT_MS = 40000;
// Скільки однакових «живих» замірів поспіль вважаємо достатніми.
const READY_STABLE_PROBES = 3;
const PROBE_INTERVAL_MS = 150;
// Пауза між появою мітки і самим свайпом.
const SWIPE_LEAD_MS = 2000;
// Скільки гра має мовчати (не слати пакетів), щоб вважати місто завантаженим,
// і скільки таких перевірок робимо щонайбільше.
const QUIET_MS = 1200;
const QUIET_MAX_ROUNDS = 6;
// Пауза після свайпу, поки камера зупиниться.
const SWIPE_SETTLE_MS = 600;
// Скільки разів тапаємо в одну точку і з якою паузою.
const TAP_ATTEMPTS = 3;
const TAP_GAP_MS = 2200;
// Пошук навколо цілі, якщо тапи не влучили: кроки туди й назад із наростанням,
// у ЧАСТКАХ ЕКРАНА. Саме екрана, а не каліброваного свайпу: свайп після відходу
// в кут довгий (кілька екранів), і частка від нього кидала б камеру через пів
// мапи замість того, щоб підкрутити її трохи.
const SEARCH_STEPS = [0.08, -0.16, 0.24, -0.32, 0.40];
const SEARCH_TAP_ATTEMPTS = 1;
// Скільки даємо грі на те, щоб прибрати спливаюче вікно після Escape.
const POPUP_SETTLE_MS = 400;

// Виміряно калібрувальником ВІД ЛІВОГО ВЕРХНЬОГО КУТА мапи — і виміряно САМИМ
// застосунком, його ж жестами. Попередні числа міряли рух пальця, і вони були
// хибні: гра прокручує з інерцією, тож те саме кінцеве положення давало щоразу
// інший результат. Тут, зокрема, вертикаль виявилась нульовою — після відходу в
// кут корабель уже на потрібній висоті, рухати треба лише вбік. Тому автоматичний
// вхід зобов'язаний спершу відвести камеру в той самий кут — без цього числа
// нічого не означають.
//
// Чому це спільні числа, а не «для одного телефона»: кут — точка, у яку камера
// впирається в будь-якому світі, а корабель поселення ставить гра, не гравець.
// canvasW/canvasH — розмір поля, на якому міряли; на іншому екрані
// scaleSettlementGesture перерахує все пропорційно.
const DEFAULT_SHIP_CALIB = Object.freeze({
  canvasX: 696, canvasY: 321, canvasW: 1024, canvasH: 1831,
  scrollDx: -2458, scrollDy: 0,
});

// Гра справді ожила: полотно на місці, сторінка інтерактивна, і — головне —
// кадри малюються (frameDeltaMs). Свайп по грі, яка ще не малює, НЕ ТЯГНЕ
// нічого: полотно вже є, а приймати дотик нема кому. Це та сама перевірка, яку
// робить перевірений ручний вхід перед своїм свайпом.
function gameIsInteractive(probe) {
  const rect = probe?.rect;
  const frameDeltaMs = Number(probe?.frameDeltaMs);
  return !!rect &&
    Number(rect.width) > 100 && Number(rect.height) > 100 &&
    Number(probe.viewportW) > 100 && Number(probe.viewportH) > 100 &&
    Number(probe.canvasCount) > 0 &&
    String(probe.canvasTag || '') === 'canvas' &&
    ['interactive', 'complete'].includes(String(probe.readyState || '')) &&
    String(probe.visibilityState || 'visible') === 'visible' &&
    probe.stable === true &&
    Number.isFinite(frameDeltaMs) && frameDeltaMs > 0 && frameDeltaMs < 500;
}

function geometrySignature(probe) {
  const rect = probe?.rect || {};
  return [rect.left, rect.top, rect.width, rect.height, probe?.viewportW, probe?.viewportH]
    .map((value) => Math.round(Number(value) || 0)).join(':');
}

function isSettlementGrid(gridId) {
  return typeof gridId === 'string' && gridId.indexOf('cultural_outpost') === 0;
}

const SETTLEMENT_ALIASES = {
  vikings: ['vikings', 'viking'],
  japanese: ['japan', 'japanese'],
  egyptians: ['egypt', 'egyptians', 'egyptian'],
  aztecs: ['aztecs', 'aztec'],
  mughals: ['mughal', 'mughals'],
  polynesia: ['polynesia', 'polynesian'],
  pirates: ['pirates', 'pirate'],
};

// Те, що гра САМА знає про місто: де стоїть корабель поселення і де межі
// ділянки. Камера впирається саме в ці межі, тож маючи їх і координати корабля,
// відстань до нього можна ПОРАХУВАТИ — під будь-який розмір міста, замість того
// щоб запам'ятовувати одну цифру, яка підходить лише одному місту.
function cityGeometryFrom(cityMap) {
  const ship = (cityMap?.entities || []).find((entity) => entity?.type === 'outpost_ship');
  const areas = Array.isArray(cityMap?.unlocked_areas)
    ? cityMap.unlocked_areas
    : Object.values(cityMap?.unlocked_areas || {});
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const area of areas) {
    if (!area || typeof area !== 'object') continue;
    const x = Number(area.x) || 0;
    const y = Number(area.y) || 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + (Number(area.width) || 0));
    maxY = Math.max(maxY, y + (Number(area.length) || 0));
  }
  if (!ship || !Number.isFinite(minX) || !Number.isFinite(maxX)) return null;
  return {
    shipX: Number(ship.x) || 0,
    shipY: Number(ship.y) || 0,
    minX, minY, maxX, maxY,
  };
}

function settlementIdFromCityMap(cityMap) {
  if (!Array.isArray(cityMap?.entities)) return null;
  const ship = cityMap.entities.find((entity) => entity?.type === 'outpost_ship');
  const segments = String(ship?.cid || '').toLowerCase().split('_');
  return Object.keys(SETTLEMENT_ALIASES).find((id) =>
    SETTLEMENT_ALIASES[id].some((alias) => segments.includes(alias))
  ) || null;
}

function scaleSettlementGesture(probe, calibration = DEFAULT_SHIP_CALIB) {
  const rect = probe?.rect;
  if (!rect || probe.canvasTag !== 'canvas') return null;
  const { left, top, width, height } = rect;
  const { viewportW, viewportH } = probe;
  const { canvasX, canvasY, canvasW, canvasH, scrollDx, scrollDy } = calibration;
  if (![left, top, width, height, viewportW, viewportH,
    canvasX, canvasY, canvasW, canvasH, scrollDx, scrollDy].every(Number.isFinite) ||
    Math.min(width, height, viewportW, viewportH, canvasW, canvasH) <= 0) return null;
  const x = left + canvasX * width / canvasW;
  const y = top + canvasY * height / canvasH;
  if (x < 0 || y < 0 || x >= viewportW || y >= viewportH) return null;
  return {
    x, y, dx: scrollDx * width / canvasW, dy: scrollDy * height / canvasH,
    viewportW, viewportH,
  };
}

// A run belongs to one WebView generation and one document. No load event or
// warm-up delay starts it: the current city's outpost ship packet does.
function createSettlementPacketSession({
  generation, expectedHost, inject, getTag, swipe, tap, onState,
  nativeGestures = true, timeoutMs = 75000, showAim = false,
  calibration = DEFAULT_SHIP_CALIB,
  // Режим калібрування. Гра вантажиться, камера сама відводиться в ЛІВИЙ
  // ВЕРХНІЙ кут мапи — це та єдина точка, яку неможливо не вгадати: камера
  // впирається в межу й далі не їде, скільки б її не тягнути. Від цього кута
  // людина власним пальцем підводить корабель під мітку й тисне «Тапнути».
  // Пройдений нею шлях гра рахує сама, і він разом із точкою мітки й стає
  // калібровкою — вже від відомого початку, а не від того місця, де камера
  // випадково опинилась після завантаження.
  calibrate = false,
}) {
  let active = true;
  let documentId = null;
  let documentStartedAt = 0;
  let epoch = 0;
  let started = false;
  let tapped = false;
  let requestSent = false;
  let settlementId = null;
  let sequence = 0;
  let attemptId = null;
  let pending = null;
  let aim = null;
  let aimRect = null;
  let manualDx = 0;
  let manualDy = 0;
  let gestureBusy = false;
  // Чи прилітали пакети від гри за час останнього очікування. Поки вони йдуть —
  // місто ще довантажується й камера може рухатись; свайп у цей момент дає
  // щоразу інший результат.
  let sawPacket = false;
  let cityGeometry = null;
  const timers = new Map();

  function delay(ms) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => { timers.delete(timer); resolve(); }, ms);
      timers.set(timer, resolve);
    });
  }
  function clearPending() {
    if (pending) {
      const { resolve, timer } = pending;
      pending = null;
      clearTimeout(timer);
      resolve(null);
    }
  }
  function cancel() {
    active = false;
    epoch += 1;
    clearTimeout(deadline);
    clearPending();
    timers.forEach((resolve, timer) => { clearTimeout(timer); resolve(); });
    timers.clear();
  }
  function finish(phase, error) {
    if (!active) return;
    cancel();
    onState({ phase, settlementId, ...(error ? { error } : {}) });
  }
  function fail(error = 'load') { finish('error', error); }

  function drawAim(x, y) {
    inject(`window.__foeShowAimMarker && window.__foeShowAimMarker(${x}, ${y}, ${AIM_MARKER_MS}); true;`);
  }
  // Те, що бачить людина під час калібрування: де мітка і скільки вже накрутили.
  function aimState() {
    if (!aim) return null;
    return {
      x: Math.round(aim.x), y: Math.round(aim.y),
      dx: Math.round(manualDx), dy: Math.round(manualDy),
      viewportW: aim.viewportW, viewportH: aim.viewportH,
    };
  }
  function reportAim(step) {
    if (active) onState({ phase: 'calibrating', settlementId, step, aim: aimState() });
  }
  // Готова калібровка у координатах ігрового полотна — рівно в тому вигляді,
  // в якому її чекає scaleSettlementGesture (і DEFAULT_SHIP_CALIB у коді).
  function recordedCalibration() {
    // Тільки те, що зробив НАШ тап у мітку. Якщо поселення відкрилось інакше
    // (людина тапнула по кораблю власним пальцем), координати мітки до цього
    // стосунку не мають — записати їх було б брехнею.
    if (!tapped || !aim || !aimRect) return null;
    const { left, top, width, height } = aimRect;
    if (!(width > 0) || !(height > 0)) return null;
    return {
      canvasX: aim.x - left, canvasY: aim.y - top,
      canvasW: width, canvasH: height,
      scrollDx: manualDx, scrollDy: manualDy,
      city: cityGeometry,
    };
  }

  // Один крок стрілки калібрувальника. Напрямок задається рухом ПАЛЬЦЯ, бо саме
  // палець ми потім і відтворюємо: щоб подивитись правіше, палець іде вліво.
  async function nudgeCalibration(fingerX, fingerY) {
    if (!active || !aim || gestureBusy || typeof swipe !== 'function') return false;
    const tag = Number(getTag());
    if (!Number.isInteger(tag) || tag <= 0) return false;
    const dx = fingerX * CALIB_STEP * aim.viewportW;
    const dy = fingerY * CALIB_STEP * aim.viewportH;
    // Назад за кут камера не поїде — вона там уперлась. А жест, який НІЧОГО не
    // рухає, гра зараховує як КЛІК: палець стартує з середини екрана, тобто
    // тапне по чиїйсь споруді й збере з неї виробництво. Тому такий крок просто
    // не робимо.
    if (manualDx + dx > 0 || manualDy + dy > 0) {
      reportAim('edge');
      return false;
    }
    gestureBusy = true;
    try {
      await swipe(tag, dx / aim.viewportW, dy / aim.viewportH);
      if (!active) return false;
      manualDx += dx;
      manualDy += dy;
      // Гра могла перемалювати свій шар поверх мітки — малюємо знову.
      drawAim(aim.x, aim.y);
      reportAim('aim');
      return true;
    } catch (_error) {
      return false;
    } finally {
      gestureBusy = false;
    }
  }

  // Підтвердження точки: тапаємо туди, де стоїть мітка. Далі все як завжди —
  // чекаємо запит гри і мапу поселення.
  async function confirmTap() {
    if (!active || !aim || gestureBusy) return false;
    if (typeof tap !== 'function') { fail('unsupported'); return false; }
    const tag = Number(getTag());
    if (!Number.isInteger(tag) || tag <= 0) { fail(); return false; }
    gestureBusy = true;
    try {
      reportAim('tap');
      attemptId = `settlement-tap-${generation}-${++sequence}`;
      const armed = await waitForMessage('watch_armed', attemptId,
        `window.__foeArmNativeAutoEnter && window.__foeArmNativeAutoEnter(${aim.x}, ${aim.y}, ${JSON.stringify(attemptId)}); true;`);
      if (!active) return false;
      if (!armed) { reportAim('retry'); return false; }
      tapped = true;
      await tap(tag, aim.x / aim.viewportW, aim.y / aim.viewportH, attemptId);
      if (!active) return false;
      // Спрацювало — гра пришле мапу поселення і сеанс завершиться сам. Не
      // спрацювало — за кілька секунд повертаємо людину до наведення, щоб вона
      // не дивилась вічно на «тиснемо…».
      await delay(TAP_SETTLE_MS);
      if (active) reportAim('retry');
      return true;
    } catch (_error) {
      if (active) reportAim('retry');
      return false;
    } finally {
      gestureBusy = false;
    }
  }
  const deadline = setTimeout(() => fail('timeout'), timeoutMs);

  function waitForMessage(kind, nonce, script) {
    return new Promise((resolve) => {
      clearPending();
      const timer = setTimeout(() => {
        if (pending?.nonce !== nonce) return;
        pending = null;
        resolve(null);
      }, 1800);
      pending = { kind, nonce, resolve, timer };
      try { inject(script); } catch (_error) { clearPending(); fail(); }
    });
  }

  async function enter(runEpoch) {
    const current = () => active && epoch === runEpoch;
    try {
      let gesture = null;
      let stableCount = 0;
      let lastSignature = '';
      // Чекаємо на живу гру, але не вічно: якщо ознаки життя так і не з'явились,
      // краще спробувати свайп, ніж не спробувати нічого.
      const readyDeadline = Date.now() + READY_WAIT_MS;
      while (current() && !gesture) {
        const nonce = `settlement-probe-${generation}-${++sequence}`;
        const message = await waitForMessage('interactionProbe', nonce,
          `window.__foeProbeInteraction && window.__foeProbeInteraction(${JSON.stringify(nonce)}); true;`);
        if (!current()) return;
        const probe = message?.probe;
        const candidate = scaleSettlementGesture(probe, calibration);
        const forced = Date.now() >= readyDeadline;
        if (candidate && (forced || gameIsInteractive(probe))) {
          const signature = geometrySignature(probe);
          stableCount = signature === lastSignature ? stableCount + 1 : 1;
          lastSignature = signature;
          // Кілька однакових замірів поспіль: інакше можна впіймати кадр посеред
          // того, як гра ще перекладає полотно.
          if (forced || stableCount >= READY_STABLE_PROBES) {
            gesture = candidate;
            aimRect = probe.rect;
            break;
          }
        } else {
          stableCount = 0;
          lastSignature = '';
        }
        await delay(PROBE_INTERVAL_MS);
      }
      if (!current()) return;
      aim = gesture;
      if (calibrate) {
        if (!(await settleBeforeGesture(runEpoch, 'calibrating'))) return;
        if (!(await panToTopLeft(runEpoch, 'calibrating'))) return;
        if (!current()) return;
        // Той самий грубий мах, що й у відтворенні: доміряємо лише залишок.
        onState({ phase: 'calibrating', settlementId, step: 'coarse' });
        if (!(await coarsePan(runEpoch))) return;
        manualDx = -COARSE_SCREENS * aim.viewportW;
        manualDy = 0;
        // Мітка стоїть у точці з калібровки — рівно там, куди потім тапатиме
        // автомат. Іншого місця їй бути не може: що ми зараз розмітимо, те він
        // і повторить.
        drawAim(aim.x, aim.y);
        onState({ phase: 'calibrating', settlementId, aim: aimState() });
        return;
      }
      // Мітка з'являється ТУТ — щойно гра готова, ще до будь-яких жестів. Від
      // цієї миті й відлічується пауза перед свайпом.
      if (showAim) drawAim(aim.x, aim.y);
      await performEntry(runEpoch);
    } catch (_error) {
      if (current()) fail();
    }
  }

  // Дочекатись, поки сцена міста стане на місце, і закрити спливаючі вікна.
  // БЕЗ цього будь-який свайп іде в нікуди: полотно вже намальоване, але гра ще
  // довантажує місто й камеру не віддає. Саме на цьому ми вже спіткнулись раніше
  // («не тягнеться»), тож калібрування мусить чекати так само, як і автомат.
  async function settleBeforeGesture(runEpoch, phase) {
    const current = () => active && epoch === runEpoch;
    onState({ phase, settlementId, step: 'settle' });
    await delay(SWIPE_LEAD_MS);
    if (!current()) return false;
    for (let round = 0; round < QUIET_MAX_ROUNDS; round += 1) {
      sawPacket = false;
      await delay(QUIET_MS);
      if (!current()) return false;
      if (!sawPacket) break;
    }
    onState({ phase, settlementId, step: 'popups' });
    inject('window.__foeDismissPopups && window.__foeDismissPopups(); true;');
    await delay(POPUP_SETTLE_MS);
    return current();
  }

  // Відхід у ЛІВИЙ ВЕРХНІЙ кут мапи. Палець управо — камера йде до лівої межі,
  // палець униз — до верхньої. Довжина надмірна навмисне: камера впреться в межу
  // й стане, тож кінцева точка та сама незалежно від того, звідки почали.
  async function panToTopLeft(runEpoch, phase) {
    const current = () => active && epoch === runEpoch;
    if (!current() || !aim || typeof swipe !== 'function') return false;
    const tag = Number(getTag());
    if (!Number.isInteger(tag) || tag <= 0) { fail(); return false; }
    onState({ phase, settlementId, step: 'corner' });
    for (const [dx, dy] of [[CORNER_SCREENS, 0], [0, CORNER_SCREENS]]) {
      if (!current()) return false;
      try {
        await swipe(tag, dx, dy);
      } catch (error) {
        // Не мовчимо: якщо гра не прийняла жест, людина має бачити причину.
        onState({
          phase, settlementId, step: 'corner_failed',
          note: String(error?.message || error?.code || error),
        });
        return false;
      }
      if (!current()) return false;
      await delay(SWIPE_SETTLE_MS);
    }
    return true;
  }

  // Грубий мах — той самий і в калібруванні, і у відтворенні. Саме тому інерція
  // від нього однакова, і доміряти лишається тільки залишок.
  async function coarsePan(runEpoch) {
    const current = () => active && epoch === runEpoch;
    if (!current() || !aim || typeof swipe !== 'function') return false;
    const tag = Number(getTag());
    if (!Number.isInteger(tag) || tag <= 0) { fail(); return false; }
    await swipe(tag, -COARSE_SCREENS, 0);
    if (!current()) return false;
    await delay(SWIPE_SETTLE_MS);
    return current();
  }

  // Скільки дрібних кроків лишилось після грубого маху — у координатах
  // КАЛІБРОВКИ, тож на будь-якому екрані їх однаково: сам крок масштабується,
  // а кількість ні.
  function fineSteps(distance, size, coarse) {
    const step = CALIB_STEP * size;
    if (!(step > 0)) return 0;
    return Math.round((distance - coarse) / step);
  }

  // Відтворення каліброваного шляху: спершу грубий мах, тоді залишок дрібними
  // кроками — рівно тією самою послідовністю, якою його міряли.
  async function replayCalibratedPan(runEpoch) {
    const current = () => active && epoch === runEpoch;
    if (!(await coarsePan(runEpoch))) return false;
    const tag = Number(getTag());
    const stepsX = fineSteps(
      calibration.scrollDx, calibration.canvasW, -COARSE_SCREENS * calibration.canvasW
    );
    const stepsY = fineSteps(calibration.scrollDy, calibration.canvasH, 0);
    for (const [count, dx, dy] of [
      [Math.abs(stepsX), Math.sign(stepsX) * CALIB_STEP, 0],
      [Math.abs(stepsY), 0, Math.sign(stepsY) * CALIB_STEP],
    ]) {
      for (let index = 0; index < count; index += 1) {
        if (!current()) return false;
        await swipe(tag, dx, dy);
        if (!current()) return false;
        await delay(CALIB_STEP_GAP_MS);
      }
    }
    return current();
  }

  // Підкручування на задану частку ЕКРАНА вздовж напрямку каліброваного свайпу.
  async function nudgeBy(screenFraction, runEpoch) {
    const current = () => active && epoch === runEpoch;
    if (!current() || !aim || typeof swipe !== 'function') return false;
    const tag = Number(getTag());
    if (!Number.isInteger(tag) || tag <= 0) { fail(); return false; }
    const length = Math.hypot(aim.dx, aim.dy);
    if (!(length > 0)) return false;
    // Крок тієї самої довжини в точках екрана, спрямований уздовж свайпу.
    const step = screenFraction * aim.viewportW;
    await swipe(tag, (aim.dx / length) * step / aim.viewportW,
      (aim.dy / length) * step / aim.viewportH);
    return current();
  }

  // Тап по кораблю з повторами: повторювати можна лише тап — повторний свайп
  // зсунув би камеру далі від записаного місця.
  async function tapShip(runEpoch, attempts = TAP_ATTEMPTS) {
    const current = () => active && epoch === runEpoch;
    // У ручних режимах керування МУСИТЬ лишитись у людини: невдалий тап не
    // забирає кнопки й не вбиває сеанс — можна докрутити й тапнути ще раз.
    const report = (step, extra) => {
      if (!current()) return;
      if (calibrate) reportAim(step);
      else onState({ phase: 'opening', settlementId, step, ...extra });
    };
    if (!current() || !aim || typeof tap !== 'function') { fail('unsupported'); return; }
    const tag = Number(getTag());
    if (!Number.isInteger(tag) || tag <= 0) { fail(); return; }
    report('arm');
    attemptId = `settlement-tap-${generation}-${++sequence}`;
    const armed = await waitForMessage('watch_armed', attemptId,
      `window.__foeArmNativeAutoEnter && window.__foeArmNativeAutoEnter(${aim.x}, ${aim.y}, ${JSON.stringify(attemptId)}); true;`);
    if (!current()) return;
    if (!armed) {
      if (calibrate) { reportAim('retry'); return; }
      fail();
      return;
    }
    for (let attempt = 0; attempt < attempts && current() && !requestSent; attempt += 1) {
      report('tap', { attempt: attempt + 1, attempts });
      tapped = true;
      await tap(tag, aim.x / aim.viewportW, aim.y / aim.viewportH, attemptId);
      if (current() && !requestSent && attempt < attempts - 1) await delay(TAP_GAP_MS);
    }
    // Чотири спроби минули, поселення не відкрилось — повертаємо кнопки.
    if (calibrate && current() && !requestSent) reportAim('retry');
  }

  // Сам вхід: прокрутка до корабля і тап по ньому.
  async function performEntry(runEpoch) {
    const current = () => active && epoch === runEpoch;
    try {
      if (!current() || !aim) return;
      if (!(await settleBeforeGesture(runEpoch, 'opening'))) return;
      // Калібровку міряли від лівого верхнього кута — отже й відраховувати її
      onState({ phase: 'opening', settlementId, step: 'swipe' });
      if (!nativeGestures) {
        // Запасна гілка без нативних жестів: сторінка сама відтворює і прокрутку,
        // і клік, тож відхід у кут нативним свайпом тут ні до чого.
        tapped = true;
        inject(`window.__foeAutoEnterTest && window.__foeAutoEnterTest(${aim.x}, ${aim.y}, ${aim.dx}, ${aim.dy}); true;`);
        return;
      }
      if (typeof swipe !== 'function' || typeof tap !== 'function') {
        fail('unsupported');
        return;
      }
      // Калібровку міряли від лівого верхнього кута — отже й відраховувати її
      // треба звідти. Без цього кроку scrollDx/scrollDy ні про що не кажуть.
      if (!(await panToTopLeft(runEpoch, 'opening'))) return;
      if (!(await replayCalibratedPan(runEpoch))) return;
      await delay(SWIPE_SETTLE_MS);
      if (!current()) return;
      await tapShip(runEpoch);
      // Камера не завжди зупиняється точно там, де було під час калібрування:
      // масштаб, момент запуску й інерція гри трохи плавають. Тоді всі тапи
      // б'ють в одну й ту саму порожню точку. Тому, якщо не вийшло, підкручуємо
      // камеру потроху ТУДИ Й НАЗАД навколо цілі — і пробуємо знову. Це те
      // саме, що людина робила кнопкою «Ще».
      for (const step of SEARCH_STEPS) {
        if (!current() || requestSent) break;
        onState({ phase: 'opening', settlementId, step: 'search' });
        if (!(await nudgeBy(step, runEpoch))) return;
        await delay(SWIPE_SETTLE_MS);
        if (!current() || requestSent) break;
        await tapShip(runEpoch, SEARCH_TAP_ATTEMPTS);
      }
    } catch (_error) {
      if (current()) fail();
    }
  }

  function handleMessage(message) {
    if (!active || !message?.__foeSync ||
      String(message.generation) !== String(generation)) return;
    if (message.kind === 'ready') {
      if (!message.documentId || message.documentId === documentId) return;
      const startedAt = Number(message.documentStartedAt) || 0;
      if (documentId && startedAt <= documentStartedAt) return;
      documentId = message.documentId;
      documentStartedAt = startedAt;
      epoch += 1;
      clearPending();
      started = tapped = requestSent = false;
      attemptId = null;
      settlementId = null;
      onState({ phase: 'loading', settlementId: null });
      return;
    }
    if (String(message.pageHost || '').toLowerCase() !== expectedHost) return;
    if (!documentId || message.documentId !== documentId) return;
    if (pending && (
      ((message.kind === 'interactionProbe' || message.kind === 'panAccum') &&
        pending.kind === message.kind && message.nonce === pending.nonce) ||
      (message.kind === 'autoEnter' && message.step === pending.kind && message.attemptId === pending.nonce)
    )) {
      const { resolve, timer } = pending;
      pending = null;
      clearTimeout(timer);
      resolve(message);
      return;
    }
    if (message.kind === 'autoEnter' && tapped && (
      nativeGestures ? message.attemptId === attemptId : !message.attemptId
    )) {
      // 'entered' — гра вже відповіла мапою культурного поселення. Це сильніший
      // доказ входу, ніж сам факт надісланого запиту, і пропускати його не можна.
      if (message.step === 'request_sent' || message.step === 'entered') requestSent = true;
      if (['wrong_grid', 'no_request', 'request_no_response', 'error'].includes(message.step)) {
        // У ручних режимах невдалий тап — нормальна частина пристрілювання:
        // не вбиваємо сеанс, а повертаємо керування людині.
        if (calibrate) reportAim(message.step);
        else fail();
      }
      return;
    }
    if (message.kind !== 'data') return;
    sawPacket = true;
    const map = message.found?.settlementMap;
    // Сувора перевірка (наш тап + підтверджений запит) боронить АВТОМАТИЧНИЙ
    // вхід від того, щоб зарахувати чужу стару мапу. Під час ручного наведення
    // сторінку щойно завантажено, а за кермом людина: якщо поселення відкрите —
    // воно відкрите, ким би це не було зроблено.
    // Не рівність, а префікс: якщо гра колись додасть варіант на кшталт
    // 'cultural_outpost_2', вхід не має мовчки провалюватись. Але й не будь-яка
    // не-головна мапа: 'quantum_incursions' — теж окрема мапа, і не поселення.
    if (isSettlementGrid(map?.gridId) && Array.isArray(map.entities) &&
      (calibrate || (tapped && requestSent))) {
      finish('ready');
      return;
    }
    const city = message.found?.cityMap;
    if (started || !Array.isArray(city?.entities)) return;
    cityGeometry = cityGeometryFrom(city) || cityGeometry;
    settlementId = settlementIdFromCityMap(city);
    if (!settlementId) {
      // Unknown ship IDs may be introduced by the game. Do not misreport them
      // as an absent settlement or guess a click target.
      if (!city.entities.some((entity) => entity?.type === 'outpost_ship')) finish('empty');
      return;
    }
    started = true;
    onState({ phase: 'loading', settlementId, step: 'probe' });
    void enter(epoch);
  }

  // Аварійний вихід: дані поселення вже є (це бачить сам застосунок за своїм
  // станом), тож нема чого далі чекати на внутрішні сигнали сесії.
  function succeed() { finish('ready'); }

  return {
    handleMessage, cancel, fail, confirmTap, nudgeCalibration, succeed, recordedCalibration,
  };
}

// Людський опис того, що автомат робить просто зараз. Один текст і для смужки
// поверх показаної гри, і для картки на екрані поселення.
// Причина невдачі людською мовою — щоб «гра перезавантажилась» не виглядало
// загадкою: перезавантаження це наслідок, а не причина.
const FAIL_REASONS = {
  timeout: 'гра не відповіла вчасно',
  load: 'вікно гри перервалося',
  layout: 'змінився розмір екрана',
  unsupported: 'жести недоступні в цій збірці',
  identity: 'не визначено світ',
  cancelled: 'вхід скасовано',
};

function describePacketSettlement(state) {
  const { phase, step, attempt, attempts } = state || {};
  if (phase === 'calibrating') {
    if (step === 'corner') return 'Відводимо камеру в лівий верхній кут мапи…';
    if (step === 'coarse') return 'Один довгий свайп до корабля…';
    if (step === 'edge') {
      return 'Далі в цей бік камера не поїде — вона вже в куті мапи.';
    }
    if (step === 'corner_failed') {
      return `Гра не прийняла жест відходу в кут${state.note ? `: ${state.note}` : ''}.`;
    }
    if (step === 'corner_failed') {
      return `Гра не прийняла жест відходу в кут${state.note ? `: ${state.note}` : ''}.`;
    }
    if (step === 'settle') return 'Гра намальована. Чекаємо, поки сцена стане на місце…';
    if (step === 'popups') return 'Закриваємо спливаючі вікна гри…';
    if (step === 'arm') return 'Готуємось тапнути…';
    if (step === 'tap') return 'Тиснемо в точку мітки…';
    if (step === 'wrong_grid') return 'Тап відкрив не поселення. Підправте і спробуйте ще.';
    if (step === 'retry') return 'Поселення не відкрилось. Підправте і тапніть знову.';
    if (step === 'no_request' || step === 'request_no_response') {
      return 'Тап пройшов, але гра на нього не відповіла. Підправте і тапніть знову.';
    }
    return 'Стрілками підведіть корабель під червону мітку, тоді «Тапнути».';
  }
  if (phase === 'opening') {
    if (step === 'settle') return 'Гра намальована. Чекаємо, поки сцена стане на місце…';
    if (step === 'search') return 'Корабель не там, де очікували. Підкручуємо камеру…';
    if (step === 'popups') return 'Закриваємо спливаючі вікна гри…';
    if (step === 'swipe') return 'Прокручуємо місто до корабля поселення…';
    if (step === 'arm') return 'Наводимось на корабель…';
    if (step === 'tap') {
      return attempt && attempts
        ? `Тиснемо на корабель (спроба ${attempt} з ${attempts})…`
        : 'Тиснемо на корабель…';
    }
    return 'Заходимо в поселення…';
  }
  if (step === 'retrying') {
    const reason = FAIL_REASONS[state?.error];
    return `Спроба не вдалася${reason ? ` (${reason})` : ''}. Пробуємо ще раз…`;
  }
  if (step === 'probe') return 'Поселення знайдено. Чекаємо, поки гра почне малювати…';
  return 'Чекаємо, поки гра покаже мапу міста…';
}

module.exports = {
  DEFAULT_SHIP_CALIB, settlementIdFromCityMap, scaleSettlementGesture, describePacketSettlement,
  cityGeometryFrom,
  isSettlementGrid,
  createSettlementPacketSession,
};
