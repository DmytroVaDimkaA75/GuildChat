// Виміряно на живому телефоні: один калібрований свайп доводить корабель саме
// в цю точку. Попереднє canvasY (228) було нижче за корабель — свайп працював,
// а тап падав під нього.
// Мітку тримаємо довго: людина наводить її руками, поспішати нема куди.
const AIM_MARKER_MS = 900000;
// Де мітка стоїть у РУЧНИХ режимах (наведення й ручний старт) — угорі екрана,
// як під час калібрування. Це окреме число, не з калібровки: там canvasY —
// точка корабля ПІСЛЯ автоматичного свайпу, і чіпати її заради зручності
// наведення не можна, інакше автомат тапне не туди.
const MANUAL_AIM_CANVAS_Y = 134;
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
// Пошук навколо цілі, якщо тапи не влучили: частки каліброваного свайпу, туди
// й назад із наростанням. Один тап на позицію — інакше пошук надто довгий.
const SEARCH_STEPS = [0.15, -0.3, 0.45, -0.6, 0.75];
const SEARCH_TAP_ATTEMPTS = 1;
// Скільки даємо грі на те, щоб прибрати спливаюче вікно після Escape.
const POPUP_SETTLE_MS = 400;

const DEFAULT_SHIP_CALIB = Object.freeze({
  canvasX: 696, canvasY: 134, canvasW: 1024, canvasH: 765,
  scrollDx: -708, scrollDy: 123,
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
  // Ручне наведення: гру завантажуємо, мітку малюємо — але свайп і тап робить
  // людина кнопками. Накопичений рух стрілок і є той свайп, який потім
  // повторюватиметься автоматично.
  manualAim = false, calibration = DEFAULT_SHIP_CALIB,
  // Ручний старт: гра вантажиться сама, мітка малюється, але прокрутку з тапом
  // запускає людина кнопкою — щоб було видно, чи справа в моменті запуску, чи
  // в самій довжині свайпу.
  manualStart = false,
}) {
  // Будь-який режим, де за кермом людина.
  const manual = manualAim || manualStart;
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
  let aimProbe = null;
  let entryEpoch = null;
  let manualDx = 0;
  let manualDy = 0;
  // Скільки насправді накрутили СВОЇМИ жестами (калібрований свайп + докрутки).
  let scrolledDx = 0;
  let scrolledDy = 0;
  let gestureBusy = false;
  // Чи прилітали пакети від гри за час останнього очікування. Поки вони йдуть —
  // місто ще довантажується й камера може рухатись; свайп у цей момент дає
  // щоразу інший результат.
  let sawPacket = false;
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
  // Те, що бачить людина під час наведення: де мітка і скільки вже накрутили.
  function aimState() {
    if (!aim) return null;
    return {
      x: Math.round(aim.x), y: Math.round(aim.y),
      dx: Math.round(manualDx), dy: Math.round(manualDy),
      viewportW: aim.viewportW, viewportH: aim.viewportH,
    };
  }
  function reportAim(step) {
    if (active) onState({ phase: 'aiming', settlementId, step, aim: aimState() });
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
      scrollDx: manualDx + scrolledDx, scrollDy: manualDy + scrolledDy,
    };
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
      // Скільки людина прогорнула місто власним пальцем від завантаження
      // сторінки — це і є той свайп, який автомат потім повторить сам.
      const panNonce = `settlement-pan-${generation}-${++sequence}`;
      const pan = await waitForMessage('panAccum', panNonce,
        `window.__foeReadPan && window.__foeReadPan(${JSON.stringify(panNonce)}); true;`);
      if (!active) return false;
      if (pan) {
        manualDx = Number(pan.dx) || 0;
        manualDy = Number(pan.dy) || 0;
      }
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
            aimProbe = probe;
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
      if (manual) {
        // Для ручних режимів вікна закриваємо одразу: людина має бачити місто.
        inject('window.__foeDismissPopups && window.__foeDismissPopups(); true;');
        await delay(POPUP_SETTLE_MS);
        if (!current()) return;
      }
      if (manualAim) {
        // Далі гру не чіпаємо самі: мітка стоїть, чекаємо на кнопки людини.
        aim = scaleSettlementGesture(aimProbe, { ...calibration, canvasY: MANUAL_AIM_CANVAS_Y }) || gesture;
        drawAim(aim.x, aim.y);
        reportAim('aim');
        return;
      }
      if (manualStart) {
        // Готові, але жест робимо лише на команду людини. Мітку ставимо туди ж,
        // де вона стояла під час калібрування — угорі; сам свайп (dx/dy) при
        // цьому лишається калібрований.
        entryEpoch = runEpoch;
        aim = scaleSettlementGesture(aimProbe, { ...calibration, canvasY: MANUAL_AIM_CANVAS_Y }) || aim;
        if (showAim) drawAim(aim.x, aim.y);
        onState({ phase: 'aiming', settlementId, step: 'start', aim: aimState() });
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

  // Прокрутка на задану ЧАСТКУ каліброваного свайпу. Частка 1 — повний свайп,
  // менша — докрутка. Усе накручене підсумовується: саме ця сума й стане новою
  // калібровкою, якщо вхід удасться.
  async function panBy(fraction, runEpoch) {
    const current = () => active && epoch === runEpoch;
    if (!current() || !aim || typeof swipe !== 'function') return false;
    const tag = Number(getTag());
    if (!Number.isInteger(tag) || tag <= 0) { fail(); return false; }
    const dx = aim.dx * fraction;
    const dy = aim.dy * fraction;
    await swipe(tag, dx / aim.viewportW, dy / aim.viewportH);
    if (!current()) return false;
    scrolledDx += dx;
    scrolledDy += dy;
    return true;
  }

  // Тап по кораблю з повторами: повторювати можна лише тап — повторний свайп
  // зсунув би камеру далі від записаного місця.
  async function tapShip(runEpoch, attempts = TAP_ATTEMPTS) {
    const current = () => active && epoch === runEpoch;
    // У ручних режимах керування МУСИТЬ лишитись у людини: невдалий тап не
    // забирає кнопки й не вбиває сеанс — можна докрутити й тапнути ще раз.
    const report = (step, extra) => {
      if (!current()) return;
      if (manual) scrollState(step);
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
      if (manual) { scrollState('retry'); return; }
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
    if (manual && current() && !requestSent) scrollState('retry');
  }

  // Сам вхід: прокрутка до корабля і тап по ньому.
  async function performEntry(runEpoch) {
    const current = () => active && epoch === runEpoch;
    try {
      if (!current() || !aim) return;
      // Пауза після появи мітки: гра щойно домалювала перший кадр, але сцена
      // міста ще доїжджає на місце, і свайп у цей момент її не зачепить.
      onState({ phase: 'opening', settlementId, step: 'settle' });
      await delay(SWIPE_LEAD_MS);
      if (!current()) return;
      // Додатково чекаємо, поки гра ЗАМОВКНЕ. Перевірка проста: спимо коротко і
      // дивимось, чи прилетів за цей час бодай один пакет. Не прилетів — місто
      // догрузилось, камера стоїть.
      for (let round = 0; round < QUIET_MAX_ROUNDS; round += 1) {
        sawPacket = false;
        await delay(QUIET_MS);
        if (!current()) return;
        if (!sawPacket) break;
      }
      // Аж ТЕПЕР Escape: спливаюче вікно (щоденна нагорода, подія) перехоплює
      // дотик на себе, і свайп по ньому камеру не рухає. Закривати його раніше
      // сенсу немає — воно могло з'явитись саме за ці дві секунди.
      onState({ phase: 'opening', settlementId, step: 'popups' });
      inject('window.__foeDismissPopups && window.__foeDismissPopups(); true;');
      await delay(POPUP_SETTLE_MS);
      if (!current()) return;
      onState({ phase: 'opening', settlementId, step: 'swipe' });
      if (!nativeGestures) {
        tapped = true;
        inject(`window.__foeAutoEnterTest && window.__foeAutoEnterTest(${aim.x}, ${aim.y}, ${aim.dx}, ${aim.dy}); true;`);
        return;
      }
      if (typeof swipe !== 'function' || typeof tap !== 'function') {
        fail('unsupported');
        return;
      }
      if (!(await panBy(1, runEpoch))) return;
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
        if (!(await panBy(step, runEpoch))) return;
        await delay(SWIPE_SETTLE_MS);
        if (!current() || requestSent) break;
        await tapShip(runEpoch, SEARCH_TAP_ATTEMPTS);
      }
    } catch (_error) {
      if (current()) fail();
    }
  }

  function scrollState(step) {
    if (active) {
      onState({
        phase: 'aiming', settlementId, step,
        aim: { ...aimState(), dx: Math.round(scrolledDx), dy: Math.round(scrolledDy) },
      });
    }
  }

  // Кнопки ручного режиму: «Прокрутити» / «Ще» (частка) і «Тапнути».
  function scrollBy(fraction) {
    if (!active || entryEpoch === null || gestureBusy) return false;
    gestureBusy = true;
    (async () => {
      try {
        if (await panBy(fraction, entryEpoch)) {
          if (showAim) drawAim(aim.x, aim.y);
          scrollState('scrolled');
        }
      } catch (_error) { /* лишаємось у наведенні */ }
      gestureBusy = false;
    })();
    return true;
  }

  function startEntry() {
    if (!active || entryEpoch === null || gestureBusy) return false;
    gestureBusy = true;
    (async () => {
      try { await tapShip(entryEpoch); } catch (_error) { /* нехай спробує ще */ }
      gestureBusy = false;
    })();
    return true;
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
        if (manual) scrollState(message.step);
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
      (manualAim || (tapped && requestSent))) {
      finish('ready');
      return;
    }
    const city = message.found?.cityMap;
    if (started || !Array.isArray(city?.entities)) return;
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
    handleMessage, cancel, fail, confirmTap, scrollBy, startEntry, succeed, recordedCalibration,
  };
}

// Людський опис того, що автомат робить просто зараз. Один текст і для смужки
// поверх показаної гри, і для картки на екрані поселення.
function describePacketSettlement(state) {
  const { phase, step, attempt, attempts } = state || {};
  if (phase === 'aiming') {
    if (step === 'start') return 'Гра завантажена. «Прокрутити» — зробити калібрований свайп.';
    if (step === 'scrolled') return 'Корабель під міткою? Якщо ні — «Ще». Якщо так — «Тапнути».';
    if (step === 'tap') return 'Тиснемо в точку мітки…';
    if (step === 'wrong_grid') return 'Тап відкрив не поселення. Підправте мітку і спробуйте ще.';
    if (step === 'retry') return 'Поселення не відкрилось. Докрутіть «Ще» або тапніть знову.';
    if (step === 'arm') return 'Готуємось тапнути…';
    if (step === 'no_request' || step === 'request_no_response') {
      return 'Тап пройшов, але гра на нього не відповіла. Докрутіть «Ще» і тапніть знову.';
    }
    if (step && step !== 'aim') return 'Гра не відповіла на тап. Підправте мітку і спробуйте ще.';
    return 'Прогорніть місто пальцем так, щоб корабель поселення став під червону мітку, тоді «Тап».';
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
  if (step === 'retrying') return 'Спроба не вдалася. Пробуємо ще раз…';
  if (step === 'probe') return 'Поселення знайдено. Чекаємо, поки гра почне малювати…';
  return 'Чекаємо, поки гра покаже мапу міста…';
}

module.exports = {
  DEFAULT_SHIP_CALIB, settlementIdFromCityMap, scaleSettlementGesture, describePacketSettlement,
  isSettlementGrid,
  createSettlementPacketSession,
};
