// components/FoeSync/foeInterceptor.js
//
// Невеликий скрипт, який застосунок вставляє у вікно гри Forge of Empires.
// Він НЕ робить власних запитів до сервера гри. Він лише "підслуховує"
// відповіді, які гра й так отримує від сервера (звернення до /game/json),
// витягує з них потрібні пакети й передає їх у застосунок через
// window.ReactNativeWebView.postMessage.
//
// Усе загорнуто у try/catch, щоб у жодному разі не зламати саму гру.

export const FOE_INTERCEPTOR_JS = `
(function () {
  if (window.__foeSyncHook) { return; }
  window.__foeSyncHook = true;
  var syncDocumentStartedAt = Date.now();
  var syncDocumentId = String(syncDocumentStartedAt) + '-' + Math.random().toString(36).slice(2);

  // Буфер ресурсних таймінгів переповнюється (у грі > 2800 файлів будівель),
  // тож ловимо URL-и і напряму через PerformanceObserver, і збільшуємо буфер.
  var _perfUrls = [];
  try { performance.setResourceTimingBufferSize(200000); } catch (e) {}
  try {
    var _po = new PerformanceObserver(function (list) {
      var es = list.getEntries();
      for (var i = 0; i < es.length; i++) {
        if (es[i] && es[i].name) { _perfUrls.push(es[i].name); }
      }
    });
    _po.observe({ type: 'resource', buffered: true });
  } catch (e) {}

  // requestClass.requestMethod -> під якою назвою покласти сирі дані
  var WANTED = {
    'ResourceService.getPlayerResourceBag': 'goods',
    'ResourceService.getResourceBag': 'goods',
    'ResourceService.getResourceDefinitions': 'resourceDefs'
  };

  function post(payload) {
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        var generation = window.__FOE_SYNC_GENERATION;
        if (payload && typeof payload === 'object' && generation != null) {
          payload.generation = generation;
        }
        if (payload && typeof payload === 'object') {
          payload.documentId = syncDocumentId;
          payload.documentStartedAt = syncDocumentStartedAt;
          payload.pageHost = String(location.hostname || '').toLowerCase();
          payload.pagePath = String(location.pathname || '');
        }
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
    } catch (e) {}
  }

  // --- ТИМЧАСОВО: калібрування кліків (діагностика поселень) ---
  // Застосунок "озброює" режим через injectJavaScript (window.__foeCalib.mode = 'ship'),
  // далі просто чекаємо СПРАВЖНІЙ дотик користувача по грі — не заважаємо йому
  // (не викликаємо preventDefault/stopPropagation), лише записуємо координати.
  // Слухаємо і touch, і click: гра на телефоні реагує на дотик і часто "гасить"
  // синтетичний click після нього, тож самого click недостатньо.
  window.__foeCalib = { mode: null };

  // Стежимо за СУМАРНИМ прогортанням міста пальцем від завантаження сторінки
  // (не скидається, рахує всі свайпи поспіль). Камера при новому запуску вікна
  // гри стоїть НЕ там, де під час калібрування — тож перед тестовим кліком
  // треба спершу відтворити той самий скрол, а вже тоді клікати.
  var panAccum = { dx: 0, dy: 0 };
  var panLast = null;
  var panTouchId = null;
  document.addEventListener('touchstart', function (e) {
    // Нативне відтворення вже використовує збережений panAccum. Не додаємо
    // його до калібровки вдруге, якщо користувач повторить тест у цьому сеансі.
    if (window.__foeNativePanActive) { panLast = null; panTouchId = null; return; }
    var t = e.touches && e.touches[0];
    if (t) { panTouchId = t.identifier; panLast = { x: t.clientX, y: t.clientY }; }
  }, true);
  document.addEventListener('touchmove', function (e) {
    if (window.__foeNativePanActive) { return; }
    if (!panLast) { return; }
    var t = null;
    for (var i = 0; i < e.touches.length; i++) {
      if (e.touches[i].identifier === panTouchId) { t = e.touches[i]; break; }
    }
    if (!t) { t = e.touches[0]; }
    if (!t) { return; }
    panAccum.dx += t.clientX - panLast.x;
    panAccum.dy += t.clientY - panLast.y;
    panLast = { x: t.clientX, y: t.clientY };
  }, true);
  document.addEventListener('touchend', function () {
    panLast = null;
    panTouchId = null;
  }, true);

  function handleCalibEvent(type, clientX, clientY) {
    try {
      var mode = window.__foeCalib && window.__foeCalib.mode;
      if (!mode || clientX == null || clientY == null) { return; }
      window.__foeCalib.mode = null;
      var cvs = document.querySelector('canvas');
      var rect = cvs ? cvs.getBoundingClientRect() : null;
      var point = {
        name: mode,
        via: type,
        clientX: clientX,
        clientY: clientY,
        canvasX: rect ? Math.round(clientX - rect.left) : null,
        canvasY: rect ? Math.round(clientY - rect.top) : null,
        canvasW: rect ? Math.round(rect.width) : null,
        canvasH: rect ? Math.round(rect.height) : null,
        viewportW: Math.round(window.innerWidth || (rect && rect.width) || 0),
        viewportH: Math.round(window.innerHeight || (rect && rect.height) || 0),
        scrollDx: Math.round(panAccum.dx),
        scrollDy: Math.round(panAccum.dy),
      };
      post({ __foeSync: true, kind: 'calibPoint', point: point });
    } catch (err) {}
  }
  // ТИМЧАСОВО (експеримент): спроба закрити спливаюче вікно "останні події"
  // чи будь-яке інше модальне вікно, перш ніж клікати по кораблю поселення
  // (інакше клік по кораблю може лише закрити спливаюче вікно, а не зайти в
  // поселення). Два незалежні способи, бо невідомо, чи вікно новин частина
  // canvas гри (тоді працює лише Esc) чи окремий HTML-елемент (тоді працює
  // пошук кнопки закриття):
  window.__foeDismissPopups = function () {
    var closed = false;
    try {
      var esc = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true };
      document.dispatchEvent(new KeyboardEvent('keydown', esc));
      document.dispatchEvent(new KeyboardEvent('keyup', esc));
    } catch (err) {}
    try {
      var selectors = [
        '.dialog .close', '.window-frame .close', '[class*="close-button"]',
        '[class*="CloseButton"]', '[aria-label="Close"]', '[aria-label="Закрити"]',
      ].join(', ');
      var btns = document.querySelectorAll(selectors);
      for (var i = 0; i < btns.length; i++) {
        var el = btns[i];
        var r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) { el.click(); closed = true; }
      }
    } catch (err) {}
    post({ __foeSync: true, kind: 'dismissPopups', closed: closed });
  };
  // ТИМЧАСОВО: яскравий маркер поверх гри в точці (x,y) — щоб бачити ОКОМ,
  // куди саме прийшовся синтетичний клік авто-наведення, навіть якщо мапу
  // міста самé не видно чітко (десктопний режим у вузькому вікні).
  window.__foeShowAimMarker = function (x, y, durationMs) {
    try {
      var old = document.getElementById('__foeAimMarker');
      if (old && old.parentNode) { old.parentNode.removeChild(old); }
      var el = document.createElement('div');
      el.id = '__foeAimMarker';
      el.style.cssText = [
        'position:fixed', 'left:' + (x - 18) + 'px', 'top:' + (y - 18) + 'px',
        'width:36px', 'height:36px', 'border-radius:50%',
        'border:3px solid #ff1744', 'box-shadow:0 0 0 3px #fff, 0 0 12px 4px rgba(255,23,68,0.9)',
        'z-index:2147483647', 'pointer-events:none', 'background:rgba(255,23,68,0.25)',
      ].join(';');
      document.body.appendChild(el);
      setTimeout(function () {
        if (el.parentNode) { el.parentNode.removeChild(el); }
      }, Number(durationMs) > 0 ? Number(durationMs) : 15000);
    } catch (err) {}
  };
  // ТИМЧАСОВО: розмір/позиція canvas гри без тапу — для авто-наведення на
  // корабель поселення за ігровими координатами (без ручного калібрування).
  window.__foeGetCanvasRect = function () {
    try {
      var cvs = document.querySelector('canvas');
      var rect = cvs ? cvs.getBoundingClientRect() : null;
      post({
        __foeSync: true,
        kind: 'canvasRect',
        rect: rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null,
      });
    } catch (err) {
      post({ __foeSync: true, kind: 'canvasRect', rect: null });
    }
  };

  function pickInteractionTarget() {
    var canvases = document.querySelectorAll('canvas');
    var openfl = document.getElementById('openfl-content');
    var target = null;
    if (openfl && String(openfl.tagName || '').toLowerCase() === 'canvas') {
      target = openfl;
    } else if (openfl) {
      target = openfl.querySelector('canvas');
    }
    if (!target && canvases.length) {
      var maxArea = -1;
      for (var i = 0; i < canvases.length; i++) {
        var candidateRect = canvases[i].getBoundingClientRect();
        var area = candidateRect.width * candidateRect.height;
        if (area > maxArea) {
          maxArea = area;
          target = canvases[i];
        }
      }
    }
    return { target: target, canvasCount: canvases.length };
  }

  function interactionSample() {
    var selected = pickInteractionTarget();
    var target = selected.target;
    var rect = target && target.getBoundingClientRect ? target.getBoundingClientRect() : null;
    return {
      target: target,
      canvasCount: selected.canvasCount,
      rect: rect ? {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      } : null,
    };
  }

  // Перевірка, що OpenFL/canvas уже існує і його геометрія стабільна між
  // двома відмальованими кадрами. Це діагностичний бар'єр готовності, а не
  // синтетичний ввід і не підтвердження відповіді гри.
  window.__foeProbeInteraction = function (nonce) {
    try {
      requestAnimationFrame(function (firstAt) {
        var first = interactionSample();
        requestAnimationFrame(function (secondAt) {
          var second = interactionSample();
          var a = first.rect;
          var b = second.rect;
          var sameTarget = !!first.target && first.target === second.target;
          var maxDelta = (a && b) ? Math.max(
            Math.abs(a.left - b.left),
            Math.abs(a.top - b.top),
            Math.abs(a.width - b.width),
            Math.abs(a.height - b.height)
          ) : Infinity;
          var style = null;
          try { style = second.target ? window.getComputedStyle(second.target) : null; } catch (e) {}
          var targetVisible = !!(
            b && b.width > 0 && b.height > 0 &&
            (!style || (style.display !== 'none' && style.visibility !== 'hidden'))
          );
          var activation = null;
          try {
            if (navigator.userActivation) {
              activation = {
                isActive: navigator.userActivation.isActive === true,
                hasBeenActive: navigator.userActivation.hasBeenActive === true,
              };
            }
          } catch (e) {}
          var target = second.target;
          post({
            __foeSync: true,
            kind: 'interactionProbe',
            nonce: nonce,
            probe: {
              readyState: document.readyState,
              visibilityState: document.visibilityState || null,
              pageHost: String(location.hostname || '').toLowerCase(),
              pagePath: String(location.pathname || ''),
              hidden: document.hidden === true,
              hasFocus: typeof document.hasFocus === 'function' ? document.hasFocus() : null,
              userActivation: activation,
              viewportW: Math.round(window.innerWidth || 0),
              viewportH: Math.round(window.innerHeight || 0),
              dpr: Number(window.devicePixelRatio) || 1,
              canvasId: target ? (target.id || null) : null,
              canvasTag: target ? String(target.tagName || '').toLowerCase() : null,
              canvasClass: target && typeof target.className === 'string' ? target.className : null,
              canvasCount: second.canvasCount,
              rect: b,
              targetVisible: targetVisible,
              frameDeltaMs: Math.max(0, secondAt - firstAt),
              stable: sameTarget && targetVisible && maxDelta <= 0.5,
            },
          });
        });
      });
    } catch (e) {
      post({
        __foeSync: true,
        kind: 'interactionProbe',
        nonce: nonce,
        probe: {
          readyState: document.readyState,
          visibilityState: document.visibilityState || null,
          pageHost: String(location.hostname || '').toLowerCase(),
          pagePath: String(location.pathname || ''),
          hidden: document.hidden === true,
          hasFocus: null,
          userActivation: null,
          viewportW: Math.round(window.innerWidth || 0),
          viewportH: Math.round(window.innerHeight || 0),
          dpr: Number(window.devicePixelRatio) || 1,
          canvasId: null,
          canvasCount: document.querySelectorAll('canvas').length,
          rect: null,
          targetVisible: false,
          frameDeltaMs: null,
          stable: false,
          error: String(e),
        },
      });
    }
  };
  document.addEventListener('pointerdown', markNativeAutoTapStart, true);
  document.addEventListener('touchstart', function (e) {
    markNativeAutoTapStart(e);
    var t = e.touches && e.touches[0];
    if (t) { handleCalibEvent('touchstart', t.clientX, t.clientY); }
  }, true);
  document.addEventListener('touchend', function (e) {
    var t = e.changedTouches && e.changedTouches[0];
    if (t) { handleCalibEvent('touchend', t.clientX, t.clientY); }
  }, true);
  document.addEventListener('click', function (e) {
    handleCalibEvent('click', e.clientX, e.clientY);
  }, true);

  // --- ТИМЧАСОВО: тестовий автоклік по збережених координатах ---
  // Підтвердження — ТІЛЬКИ за відповіддю сервера (CityMapService.getCityMap з
  // gridId:"cultural_outpost", потім CityMapService.getEntities(["main"])),
  // не за таймером і не за картинкою — так само, як звіряв Codex.
  var autoWatch = null; // { cls, mth, matchReq, onMatch, timeoutId, requestSent, attemptId }
  function armWatch(cls, mth, matchReq, onMatch, ms, attemptId) {
    if (autoWatch && autoWatch.timeoutId) { clearTimeout(autoWatch.timeoutId); }
    var watch = {
      cls: cls,
      mth: mth,
      matchReq: matchReq,
      onMatch: onMatch,
      timeoutId: null,
      requestSent: false,
      requestSentAt: null,
      requestIds: [],
      attemptId: attemptId == null ? null : String(attemptId),
      tapStarted: false,
      tapStartedAt: null,
      tapSerial: 0,
      nativeTapPending: false,
    };
    watch.timeoutId = setTimeout(function () {
      if (autoWatch !== watch) { return; }
      autoWatch = null;
      onMatch(null, null, watch);
    }, ms);
    autoWatch = watch;
  }

  // Позначає початок спроби лише з реального DOM pointerdown/touchstart, який
  // WebView породжує у відповідь на Android ACTION_DOWN. Так фоновий запит,
  // що завершив розбір між Kotlin-handshake та ACTION_DOWN, не приписується
  // тапу. nativeTapPending не дає другій із цих подій інкрементувати serial.
  function markNativeAutoTapStart(e) {
    try {
      var watch = autoWatch;
      if (
        !watch || !watch.attemptId || !watch.nativeTapPending || watch.tapStarted ||
        (e && e.isTrusted === false)
      ) {
        return;
      }
      watch.nativeTapPending = false;
      watch.tapStarted = true;
      watch.tapStartedAt = Date.now();
      watch.tapSerial += 1;
      post({
        __foeSync: true,
        kind: 'autoEnter',
        step: 'touch_started',
        attemptId: watch.attemptId,
        at: watch.tapStartedAt,
      });
    } catch (e) {}
  }

  function checkAutoWatch(cls, mth, rd, reqData, requestId) {
    if (!autoWatch || cls !== autoWatch.cls || mth !== autoWatch.mth) { return; }
    if (autoWatch.matchReq && !autoWatch.matchReq(reqData)) { return; }
    if (autoWatch.attemptId && !autoWatch.tapStarted) { return; }
    // Для нативної спроби сторонню відповідь приймаємо лише після запиту,
    // який побачили ПІСЛЯ озброєння watcher. cultural_outpost сам по собі є
    // остаточним підтвердженням і лишається валідним, навіть якщо тіло XHR не
    // вдалося розібрати (наприклад, воно було Blob/FormData).
    if (
      autoWatch.attemptId && !autoWatch.requestSent &&
      !(rd && rd.gridId === 'cultural_outpost')
    ) {
      return;
    }
    if (
      !(rd && rd.gridId === 'cultural_outpost') &&
      autoWatch.requestIds.length && requestId != null &&
      autoWatch.requestIds.indexOf(String(requestId)) === -1
    ) {
      return;
    }
    var w = autoWatch;
    clearTimeout(w.timeoutId);
    autoWatch = null;
    w.onMatch(rd, reqData, w);
  }

  function parsedRequestsFromBody(body) {
    var text = null;
    if (typeof body === 'string') {
      text = body;
    } else {
      try {
        if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
          text = body.toString();
        }
      } catch (e) {}
    }
    if (!text) { return null; }

    function parse(value) {
      try {
        var parsed = JSON.parse(value);
        if (Array.isArray(parsed)) { return parsed; }
        if (parsed && Array.isArray(parsed.requests)) { return parsed.requests; }
      } catch (e) {}
      return null;
    }

    var direct = parse(text);
    if (direct) { return direct; }
    try {
      var params = new URLSearchParams(text);
      var names = ['request', 'requests', 'json'];
      for (var i = 0; i < names.length; i++) {
        var value = params.get(names[i]);
        var decoded = value && parse(value);
        if (decoded) { return decoded; }
      }
    } catch (e) {}
    return null;
  }

  function inspectAutoWatchRequest(url, body, expectedWatch, expectedTapSerial) {
    try {
      var watch = autoWatch;
      if (arguments.length >= 3 && watch !== expectedWatch) { return; }
      if (
        arguments.length >= 4 && watch &&
        Number(watch.tapSerial) !== Number(expectedTapSerial)
      ) {
        return;
      }
      if (!watch || String(url || '').indexOf('/game/json') === -1) { return; }
      if (watch.attemptId && !watch.tapStarted) { return; }
      var requests = parsedRequestsFromBody(body);
      if (!requests) { return; }
      for (var i = 0; i < requests.length; i++) {
        var request = requests[i];
        if (!request || String(request.requestClass || '') !== watch.cls ||
            String(request.requestMethod || '') !== watch.mth) { continue; }
        if (watch.matchReq && !watch.matchReq(request.requestData)) { continue; }
        if (autoWatch !== watch || watch.requestSent) { return; }
        watch.requestSent = true;
        watch.requestSentAt = Date.now();
        if (request.requestId != null) {
          watch.requestIds.push(String(request.requestId));
        }
        post({
          __foeSync: true,
          kind: 'autoEnter',
          step: 'request_sent',
          requestClass: watch.cls,
          requestMethod: watch.mth,
          attemptId: watch.attemptId,
          at: watch.requestSentAt,
        });
        return;
      }
    } catch (e) {}
  }

  function describeTargetAt(x, y) {
    var stack = [];
    try {
      var all = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [];
      if (!all.length) {
        var single = document.elementFromPoint(x, y);
        if (single) { all = [single]; }
      }
      for (var i = 0; i < all.length && i < 6; i++) {
        var el = all[i];
        stack.push((el.tagName || '?') + (el.id ? '#' + el.id : '') +
          (el.className ? '.' + String(el.className).replace(/\\s+/g, '.') : ''));
      }
    } catch (e) {}
    return stack.join(' > ');
  }

  function postAutoEnterWatchResult(rd, watch) {
    if (rd && rd.gridId === 'cultural_outpost') {
      post({
        __foeSync: true, kind: 'autoEnter', step: 'entered', gridId: rd.gridId,
        attemptId: watch && watch.attemptId, at: Date.now(),
      });
    } else if (rd && rd.gridId) {
      post({
        __foeSync: true, kind: 'autoEnter', step: 'wrong_grid', gridId: rd.gridId,
        attemptId: watch && watch.attemptId, at: Date.now(),
      });
    } else {
      post({
        __foeSync: true,
        kind: 'autoEnter',
        step: watch && watch.requestSent ? 'request_no_response' : 'no_request',
        attemptId: watch && watch.attemptId,
        at: Date.now(),
      });
    }
  }

  // Нативний тап надсилається Android-модулем окремо. Тут лише озброюємо
  // мережеве підтвердження та фіксуємо елемент під майбутньою точкою тапу.
  window.__foeArmNativeAutoEnter = function (x, y, attemptId) {
    try {
      armWatch('CityMapService', 'getCityMap', null, function (rd, reqData, watch) {
        postAutoEnterWatchResult(rd, watch);
      }, 20000, attemptId);
      // Готуємо capture-phase watcher вже в тому самому JS task, що й arm.
      // Kotlin може одразу слати ACTION_DOWN: саме trusted pointer/touch подія
      // нижче позначить фактичний початок вводу.
      if (autoWatch && String(autoWatch.attemptId) === String(attemptId)) {
        autoWatch.nativeTapPending = true;
      }
      post({
        __foeSync: true, kind: 'autoEnter', step: 'watch_armed',
        attemptId: attemptId, x: x, y: y, at: Date.now(),
      });
      post({
        __foeSync: true,
        kind: 'autoEnter',
        step: 'target',
        attemptId: attemptId,
        target: describeTargetAt(x, y),
        x: x,
        y: y,
        at: Date.now(),
      });
      return true;
    } catch (e) {
      post({
        __foeSync: true, kind: 'autoEnter', step: 'error',
        attemptId: attemptId, message: String(e), at: Date.now(),
      });
      return false;
    }
  };

  // Kotlin викликає це через evaluateJavascript і лише після callback шле
  // ACTION_DOWN. Handshake тільки звіряє спробу та готує очікування; момент
  // фактичного вводу фіксує capture-phase touchstart вище.
  window.__foeNativeTapStarted = function (attemptId) {
    try {
      if (
        !autoWatch || !autoWatch.attemptId ||
        String(autoWatch.attemptId) !== String(attemptId)
      ) {
        return false;
      }
      if (!autoWatch.tapStarted) {
        autoWatch.tapStartedAt = null;
        autoWatch.nativeTapPending = true;
      }
      return true;
    } catch (e) {
      return false;
    }
  };

  function dispatchMouseFallback(target, x, y) {
    var base = {
      bubbles: true, cancelable: true, composed: true,
      clientX: x, clientY: y, button: 0, buttons: 1, view: window,
    };
    var ptr = Object.assign(
      { pointerId: 1, pointerType: 'touch', isPrimary: true, width: 1, height: 1 }, base
    );
    try { target.dispatchEvent(new PointerEvent('pointerdown', ptr)); } catch (e) {}
    try { target.dispatchEvent(new MouseEvent('mousedown', base)); } catch (e) {}
    try { target.dispatchEvent(new PointerEvent('pointerup', ptr)); } catch (e) {}
    try { target.dispatchEvent(new MouseEvent('mouseup', base)); } catch (e) {}
    try { target.dispatchEvent(new MouseEvent('click', base)); } catch (e) {}
  }

  // Повертає рядок з описом реального елемента під точкою (для логу).
  function synthClick(x, y) {
    var stackStr = '';
    try {
      // Цілимось у РЕАЛЬНИЙ елемент під цією точкою (може бути не canvas,
      // а прозорий шар кліків поверх нього), а не в перший-ліпший canvas.
      var target = null;
      var stack = [];
      try {
        target = document.elementFromPoint(x, y);
        var all = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [];
        for (var si = 0; si < all.length && si < 6; si++) {
          var el = all[si];
          stack.push((el.tagName || '?') + (el.id ? '#' + el.id : '') + (el.className ? '.' + String(el.className).replace(/\s+/g, '.') : ''));
        }
      } catch (e) {}
      if (!target) { target = document.querySelector('canvas') || document.body; }
      stackStr = stack.join(' > ');

      // Гра на телефоні реагує на дотик (touch), не на мишу. Між "натиснув" і
      // "відпустив" лишаємо невелику паузу — як у справжнього пальця (0-мс тап
      // рушій міг зрідка відкидати як підозрілий; звідси нестабільні спрацювання).
      var touch = null;
      try {
        touch = new Touch({
          identifier: Date.now() % 100000, target: target,
          clientX: x, clientY: y, pageX: x, pageY: y,
          screenX: x, screenY: y, radiusX: 1, radiusY: 1, force: 1,
        });
      } catch (e) {}

      if (touch) {
        var touchBase = {
          bubbles: true, cancelable: true, composed: true, view: window,
          touches: [touch], targetTouches: [touch], changedTouches: [touch],
        };
        try { target.dispatchEvent(new TouchEvent('touchstart', touchBase)); } catch (e) {}
        setTimeout(function () {
          try {
            target.dispatchEvent(new TouchEvent('touchend', Object.assign({}, touchBase, { touches: [], targetTouches: [] })));
          } catch (e) {}
          dispatchMouseFallback(target, x, y);
        }, 90);
      } else {
        dispatchMouseFallback(target, x, y);
      }
    } catch (e) {}
    return stackStr;
  }

  // Відтворює свайп на задану сумарну відстань (dx,dy) кількома кроками —
  // так само, як реальний палець прогортав би місто до корабля. Викликає cb,
  // коли рух завершено (не чекає на жодну відповідь сервера — це чисто рух
  // камери, тут нема чого підтверджувати).
  function synthPan(dx, dy, cb) {
    try {
      if (!dx && !dy) { cb(); return; }
      var cvs = document.querySelector('canvas') || document.body;
      var rect = cvs.getBoundingClientRect
        ? cvs.getBoundingClientRect()
        : { left: 0, top: 0, width: 400, height: 700 };
      // Цілимось у РЕАЛЬНИЙ елемент під стартовою точкою руху (як і для кліка) —
      // раптом там інший шар, ніж перший-ліпший canvas.
      var target = cvs;
      var panTargetInfo = '';
      try {
        var probeX = rect.left + rect.width / 2;
        var probeY = rect.top + rect.height / 2;
        var el = document.elementFromPoint(probeX, probeY);
        if (el) {
          target = el;
          panTargetInfo = (el.tagName || '?') + (el.id ? '#' + el.id : '');
        }
      } catch (e) {}
      post({ __foeSync: true, kind: 'autoEnter', step: 'pan_target', target: panTargetInfo, at: Date.now() });
      var margin = 40;
      var maxSegX = Math.max(30, rect.width - margin * 2);
      var maxSegY = Math.max(30, rect.height - margin * 2);

      // Великий скрол розбиваємо на кілька менших свайпів (як реальна рука),
      // кожен ПОВНІСТЮ в межах canvas — інакше кінець руху виходить за екран
      // і рух, схоже, не зараховується.
      var segments = [];
      var remDx = dx;
      var remDy = dy;
      var guard = 0;
      while ((Math.abs(remDx) > 1 || Math.abs(remDy) > 1) && guard < 12) {
        guard += 1;
        var segDx = Math.max(-maxSegX, Math.min(maxSegX, remDx));
        var segDy = Math.max(-maxSegY, Math.min(maxSegY, remDy));
        segments.push({ dx: segDx, dy: segDy });
        remDx -= segDx;
        remDy -= segDy;
      }

      var mkOpts = function (t, empty) {
        return {
          bubbles: true, cancelable: true, composed: true, view: window,
          touches: empty ? [] : [t], targetTouches: empty ? [] : [t], changedTouches: [t],
        };
      };

      // Мишине перетягування — ДУБЛЬ до дотикового. Вікно гри видає себе за
      // десктопний браузер (userAgent), тож перетягування картою гра, схоже,
      // слухає саме мишею (mousedown/mousemove/mouseup), а не пальцем — на
      // відміну від простого тапу, який ми й так дублювали і мишею теж.
      var mouseOpts = function (x, y, buttons) {
        return {
          bubbles: true, cancelable: true, composed: true, view: window,
          clientX: x, clientY: y, button: 0, buttons: buttons,
        };
      };

      function runSegment(idx) {
        if (idx >= segments.length) { cb(); return; }
        var seg = segments[idx];
        // Стартова точка — так, щоб і початок, і кінець руху лишались у межах.
        var startX = rect.left + Math.max(margin, Math.min(rect.width - margin, (rect.width - seg.dx) / 2));
        var startY = rect.top + Math.max(margin, Math.min(rect.height - margin, (rect.height - seg.dy) / 2));
        var steps = 20;
        var i = 0;
        var lastTouch = null;
        var tid = 777000 + idx;
        try {
          lastTouch = new Touch({
            identifier: tid, target: target,
            clientX: startX, clientY: startY, pageX: startX, pageY: startY,
            screenX: startX, screenY: startY, radiusX: 1, radiusY: 1, force: 1,
          });
        } catch (e) {}
        try { target.dispatchEvent(new TouchEvent('touchstart', mkOpts(lastTouch || {}))); } catch (e) {}
        try { target.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ pointerId: 1, pointerType: 'mouse', isPrimary: true }, mouseOpts(startX, startY, 1)))); } catch (e) {}
        try { target.dispatchEvent(new MouseEvent('mousedown', mouseOpts(startX, startY, 1))); } catch (e) {}

        // movementX/movementY браузер зазвичай обчислює сам для справжньої
        // миші (порівнює із попередньою реальною подією) — у штучних подій
        // це поле інакше завжди 0. Якщо гра рахує перетягування саме через
        // нього (а не через різницю clientX між подіями), рух не накопичується.
        // Тому задаємо його вручну як зсув від попередньої точки.
        var prevX = startX;
        var prevY = startY;
        function step() {
          i += 1;
          var progress = i / steps;
          var cx = startX + seg.dx * progress;
          var cy = startY + seg.dy * progress;
          var mvX = cx - prevX;
          var mvY = cy - prevY;
          var t2 = null;
          try {
            t2 = new Touch({
              identifier: tid, target: target,
              clientX: cx, clientY: cy, pageX: cx, pageY: cy,
              screenX: cx, screenY: cy, radiusX: 1, radiusY: 1, force: 1,
            });
          } catch (e) {}
          if (t2) { lastTouch = t2; try { target.dispatchEvent(new TouchEvent('touchmove', mkOpts(t2))); } catch (e) {} }
          try {
            target.dispatchEvent(new PointerEvent('pointermove', Object.assign(
              { pointerId: 1, pointerType: 'mouse', isPrimary: true }, mouseOpts(cx, cy, 1), { movementX: mvX, movementY: mvY }
            )));
          } catch (e) {}
          try {
            target.dispatchEvent(new MouseEvent('mousemove', Object.assign(mouseOpts(cx, cy, 1), { movementX: mvX, movementY: mvY })));
          } catch (e) {}
          prevX = cx;
          prevY = cy;
          if (i < steps) {
            setTimeout(step, 16);
          } else {
            setTimeout(function () {
              try { target.dispatchEvent(new TouchEvent('touchend', mkOpts(lastTouch || {}, true))); } catch (e) {}
              try { target.dispatchEvent(new PointerEvent('pointerup', Object.assign({ pointerId: 1, pointerType: 'mouse', isPrimary: true }, mouseOpts(cx, cy, 0)))); } catch (e) {}
              try { target.dispatchEvent(new MouseEvent('mouseup', mouseOpts(cx, cy, 0))); } catch (e) {}
              // ТИМЧАСОВО прибрано: колесо миші (wheel) могло само по собі
              // штовхати камеру на фіксовану дрібну відстань незалежно від
              // deltaX/deltaY — ізолюємо, чи саме воно давало "дьорнувся".
              setTimeout(function () { runSegment(idx + 1); }, 90);
            }, 50);
          }
        }
        // Невелика пауза "утримання" перед початком руху — деякі розпізнавачі
        // жесту інакше не встигають зрозуміти, що це перетягування, а не тап.
        setTimeout(step, 150);
      }
      runSegment(0);
    } catch (e) { cb(); }
  }

  // Без кліка "повернутись у місто": цей запуск вікна гри однаково скоро
  // закриється/перезавантажиться, тож просто заходимо в поселення останнім
  // кроком, забираємо карту й відпускаємо вікно — наступного разу воно й так
  // підʼєднається до гри заново (свіже завантаження = знову головне місто).
  // Кілька спроб замість однієї: клік зрідка "проскакує" (таймінг), тож
  // повторюємо, поки не прийде підтвердження або не скінчаться спроби.
  // Перед кліком спершу відтворюємо збережений скрол — камера при новому
  // запуску вікна гри інакше стоїть не там, де під час калібрування.
  window.__foeAutoEnterTest = function (shipX, shipY, scrollDx, scrollDy) {
    try {
      function afterPan() {
        var confirmed = false;
        var attempts = 0;
        var maxAttempts = 4;

        armWatch('CityMapService', 'getCityMap', null, function (rd, reqData, watch) {
          confirmed = true;
          postAutoEnterWatchResult(rd, watch);
        }, 11000);

        function attempt() {
          if (confirmed || attempts >= maxAttempts) { return; }
          attempts += 1;
          post({
            __foeSync: true, kind: 'autoEnter',
            step: attempts === 1 ? 'click_ship' : 'retry_click', n: attempts, at: Date.now(),
          });
          var targetInfo = synthClick(shipX, shipY);
          if (attempts === 1 && targetInfo) {
            post({ __foeSync: true, kind: 'autoEnter', step: 'target', target: targetInfo, at: Date.now() });
          }
          if (!confirmed && attempts < maxAttempts) { setTimeout(attempt, 2200); }
        }
        attempt();
      }

      if (scrollDx || scrollDy) {
        post({ __foeSync: true, kind: 'autoEnter', step: 'panning', at: Date.now() });
        synthPan(scrollDx, scrollDy, function () { setTimeout(afterPan, 300); });
      } else {
        afterPan();
      }
    } catch (e) {
      post({ __foeSync: true, kind: 'autoEnter', step: 'error', message: String(e), at: Date.now() });
    }
  };

  // ТИМЧАСОВО: перевірка кліка на нерухомій точці (без скролу міста) — щоб
  // відділити "клік узагалі не працює" від "координати "з'їхали" через скрол
  // камери між калібруванням і тестом". Підтвердження тут суто візуальне —
  // дивимось на екран самі, мережевого підтвердження не чекаємо.
  window.__foeSynthClickAt = function (x, y) {
    try {
      post({ __foeSync: true, kind: 'autoEnter', step: 'probe_click', at: Date.now() });
      var targetInfo = synthClick(x, y);
      if (targetInfo) {
        post({ __foeSync: true, kind: 'autoEnter', step: 'target', target: targetInfo, at: Date.now() });
      }
    } catch (e) {
      post({ __foeSync: true, kind: 'autoEnter', step: 'error', message: String(e), at: Date.now() });
    }
  };

  // Підсумовує масив бонусів від гри.
  // Кожен елемент: { type, value, origin, targetedFeature, entityId, ... }
  function aggregateBoosts(list) {
    var agg = {
      count: 0,
      sumsAll: {},        // { type: сума }  де targetedFeature = "all" / відсутній
      sumsByFeature: {},   // { "type | feature": сума }  для інших режимів
      typeCounts: {},      // { type: скільки рядків }
      originCounts: {},     // { origin: скільки рядків }
      sample: []           // перші кілька рядків "як є" для перевірки
    };
    if (!Array.isArray(list)) { return agg; }
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b || typeof b !== 'object') { continue; }
      agg.count++;
      var type = String(b.type || b.boostType || '?');
      var val = b.value;
      if (typeof val !== 'number') { val = Number(val) || 0; }
      var feat = b.targetedFeature || b.feature || 'all';
      var origin = String(b.origin || b.originType || '?');

      agg.typeCounts[type] = (agg.typeCounts[type] || 0) + 1;
      agg.originCounts[origin] = (agg.originCounts[origin] || 0) + 1;

      if (feat === 'all') {
        agg.sumsAll[type] = (agg.sumsAll[type] || 0) + val;
      } else {
        var k = type + ' | ' + feat;
        agg.sumsByFeature[k] = (agg.sumsByFeature[k] || 0) + val;
      }

      if (agg.sample.length < 15) { agg.sample.push(b); }
    }
    return agg;
  }

  // Залишає лише безпечні числові поля бонусів конкретного інстансу.
  // Це особливо потрібно для ВС, де поточне значення залежить від рівня.
  function compactEntityBonuses(entity) {
    var out = [];
    function add(value) {
      if (Array.isArray(value)) {
        for (var ai = 0; ai < value.length; ai++) { add(value[ai]); }
        return;
      }
      if (!value || typeof value !== 'object') { return; }
      var numberValue = Number(value.value);
      if (!value.type || value.value == null || !isFinite(numberValue)) { return; }
      out.push({
        type: String(value.type),
        value: numberValue,
        targetedFeature: value.targetedFeature || value.feature || 'all',
        onlyWhenMotivated: value.onlyWhenMotivated === true,
        condition: (typeof value.condition === 'string')
          ? value.condition
          : (value.condition && (value.condition.type || value.condition.id)) || null
      });
    }
    add(entity && entity.bonus);
    add(entity && entity.bonuses);
    return out.length ? out : null;
  }

  // Стан виробництва будівлі — для таблиці «час до завершення» у поселенні.
  // Форма state.__class__ та полів така сама, як у головному місті.
  // Повертає null, якщо в будівлі НЕМАЄ виробничого циклу як такого
  // (чисто дипломатична споруда, перешкода тощо) — щоб вони не потрапляли
  // у таблицю виробництв.
  function compactProductionState(entity) {
    var st = entity && entity.state;
    if (!st || typeof st !== 'object') { return null; }
    var cls = String(st.__class__ || '');

    var readyAt = null;
    if (st.next_state_transition_at != null) { readyAt = Number(st.next_state_transition_at); }
    else if (st.production_finish_time != null) { readyAt = Number(st.production_finish_time); }
    var hasTimer = isFinite(readyAt) && readyAt > 0;

    var cp = st.current_product || st.produced_product || null;
    var po = st.productionOption || (cp && cp.products ? cp : null);

    // Ознака реального виробничого циклу: обраний/готовий продукт, перелік
    // рецептів, таймер завершення або клас стану про виробництво/збір.
    var hasCycle = !!cp || !!po || hasTimer || /Produc|Finished|Collect/i.test(cls);
    if (!hasCycle) { return null; }

    var ready = /Finished|Produced|Collect/i.test(cls) ||
      (hasTimer && readyAt <= Math.floor(Date.now() / 1000));

    var det = {};
    function absorb(resObj) {
      if (!resObj || typeof resObj !== 'object') { return; }
      for (var k in resObj) {
        if (Object.prototype.hasOwnProperty.call(resObj, k)) {
          det[k] = (det[k] || 0) + (Number(resObj[k]) || 0);
        }
      }
    }
    var name = (cp && cp.name) || null;
    if (cp && cp.product && cp.product.resources) { absorb(cp.product.resources); }
    if (cp && Array.isArray(cp.goods)) {
      for (var gi = 0; gi < cp.goods.length; gi++) {
        var g = cp.goods[gi];
        if (g && g.good_id) { det[g.good_id] = (det[g.good_id] || 0) + (Number(g.value) || 0); }
      }
    }
    if (po && Array.isArray(po.products)) {
      for (var pj = 0; pj < po.products.length; pj++) {
        var pr = po.products[pj];
        absorb(pr && pr.playerResources && pr.playerResources.resources);
      }
    }
    return {
      st: cls,
      ready: !!ready,
      readyAt: hasTimer ? readyAt : null,
      name: name,
      det: Object.keys(det).length ? det : null
    };
  }

  // Рекурсивно шукає об'єкти, схожі на Величну споруду (type === "greatbuilding"
  // або є поле bonus). Повертає до 3 прикладів (обрізаних), або null.
  function scanForGB(node, depth) {
    if (!node || typeof node !== 'object' || depth > 8) { return null; }
    var out = [];
    function walk(n, d) {
      if (!n || typeof n !== 'object' || d > 8 || out.length >= 3) { return; }
      if (Array.isArray(n)) {
        for (var i = 0; i < n.length && out.length < 3; i++) { walk(n[i], d + 1); }
        return;
      }
      var t = String(n.type || n.__class__ || '');
      var isGB = /greatbuilding/i.test(t) || (n.bonus && (typeof n.bonus === 'object'));
      if (isGB && (n.cityentity_id || n.entity_id || n.id || n.bonus || n.level != null)) {
        out.push({
          type: n.type,
          cityentity_id: n.cityentity_id || n.entity_id,
          level: n.level != null ? n.level : (n.state && n.state.level),
          bonus: n.bonus
        });
      }
      for (var k in n) {
        if (Object.prototype.hasOwnProperty.call(n, k) && out.length < 3) { walk(n[k], d + 1); }
      }
    }
    walk(node, depth);
    return out.length ? out : null;
  }

  var packetNo = 0;

  // --- ТИМЧАСОВО: сирий лог пакетів поселення (карта / квести / ресурси) ---
  // Дані культурних поселень приходять у OutpostService.getAll (~1.6 МБ), тож
  // велике сирим не передаємо — робимо компактну СХЕМУ структури + невеликі
  // під-гілки. Малі пакети (квести, ресурси) передаємо як є.
  var rawSeq = 0;
  var lastRawSig = {};
  var RAWLOG_RE = /outpost|settlement|diploma|quest|chapter|resourcebag|autorefill|startup|citymap|city_map|impediment/i;
  var BIG_RE = /outpost|settlement|startup|citymap/i;
  var CAP = 16000;

  // Дістати обʼєкт-карту з відповіді: або rd.city_map (StartupService),
  // або сам rd (CityMapService.getCityMap).
  function mapOf(rd) {
    if (rd && typeof rd === 'object') {
      if (rd.city_map && typeof rd.city_map === 'object') { return rd.city_map; }
      if (rd.entities || rd.unlocked_areas || rd.gridId != null) { return rd; }
    }
    return null;
  }

  // Підпис для великих пакетів: OutpostService.getAll — раз за сеанс; карти
  // (головне місто / поселення) — окремо за gridId + кількістю будівель.
  function bigSig(key, rd) {
    var cm = mapOf(rd);
    if (cm) {
      var n = (cm.entities && cm.entities.length) || 0;
      return key + '|grid:' + (cm.gridId != null ? cm.gridId : '?') + '|ent:' + n;
    }
    return key;
  }

  function schemaDump(node, depth) {
    depth = depth || 0;
    if (depth > 8) { return '"…"'; }
    if (node === null) { return 'null'; }
    var t = typeof node;
    if (t === 'number' || t === 'boolean') { return String(node); }
    if (t === 'string') {
      return JSON.stringify(node.length > 70 ? node.slice(0, 70) + '…' : node);
    }
    if (t !== 'object') { return '"' + t + '"'; }
    if (Object.prototype.toString.call(node) === '[object Array]') {
      if (!node.length) { return '[]'; }
      return '[' + node.length + '× ' + schemaDump(node[0], depth + 1) + ']';
    }
    var keys = Object.keys(node);
    var parts = [];
    for (var i = 0; i < keys.length && i < 80; i++) {
      parts.push(JSON.stringify(keys[i]) + ':' + schemaDump(node[keys[i]], depth + 1));
    }
    if (keys.length > 80) { parts.push('"…+' + (keys.length - 80) + '"'); }
    return '{' + parts.join(',') + '}';
  }

  function emitRaw(key, tag, str) {
    var capped = str.length > CAP
      ? (str.slice(0, CAP) + '\\u2026[+' + (str.length - CAP) + ' символів]')
      : str;
    rawSeq++;
    post({
      __foeSync: true,
      kind: 'rawlog',
      entry: { seq: rawSeq, t: Date.now(), key: key + tag, size: str.length, json: capped },
    });
  }

  function maybeRawLog(key, rd) {
    try {
      if (rd == null || !RAWLOG_RE.test(key)) { return; }

      // Велике (OutpostService.getAll ~1.6 МБ, StartupService.getData ~0.5 МБ):
      // не передаємо сирим цілком — робимо СХЕМУ + невеликі під-гілки. Кожен
      // унікальний варіант (за bigSig) розбираємо один раз за сеанс.
      if (BIG_RE.test(key)) {
        var bsig = bigSig(key, rd);
        if (lastRawSig[bsig]) { return; }
        lastRawSig[bsig] = '1';
        emitRaw(key, ' [СХЕМА]', schemaDump(rd, 0));

        var emitSub = function (path, val) {
          if (val === undefined) { return; }
          var s;
          try { s = JSON.stringify(val); } catch (e) { return; }
          if (typeof s !== 'string') { return; }
          if (s.length <= CAP) { emitRaw(path, '', s); }
          else { emitRaw(path, ' [СХЕМА]', schemaDump(val, 0)); }
        };

        if (rd && typeof rd === 'object' &&
            Object.prototype.toString.call(rd) !== '[object Array]') {
          // Карта та її частини — окремо й першими (це і є карта поселення).
          var cm = mapOf(rd);
          if (cm) {
            var mp = (rd.city_map === cm) ? key + '.city_map' : key + '.map';
            emitSub(mp + '.entities', cm.entities);
            if (cm.entities && cm.entities.length) {
              emitSub(mp + '.entities[0]', cm.entities[0]);
              emitSub(mp + '.entities[last]', cm.entities[cm.entities.length - 1]);
            }
            emitSub(mp + '.unlocked_areas', cm.unlocked_areas);
            emitSub(mp + '.blocked_areas', cm.blocked_areas);
            emitSub(mp + '.tilesets', cm.tilesets);
          }
          var bk = Object.keys(rd);
          for (var bi = 0; bi < bk.length && bi < 40; bi++) {
            if (bk[bi] === 'city_map' || bk[bi] === 'entities') { continue; }
            emitSub(key + '.' + bk[bi], rd[bk[bi]]);
          }
        }
        return;
      }

      var rawStr;
      try { rawStr = JSON.stringify(rd); } catch (e) { return; }
      var sig = key + ':' + rawStr.length;
      if (lastRawSig[key] === sig) { return; }
      lastRawSig[key] = sig;
      emitRaw(key, '', rawStr);
    } catch (e) {}
  }

  // --- Каталог споруд культурного поселення (з StaticDataService.getMetadata) ---
  // Гра тримає визначення ВСІХ споруд (у т.ч. поселенських, ще не збудованих) у
  // блоці city_entities метаданих. Виловлюємо звідти рядки, чий cityentity_id
  // явно належить поселенню, і шлемо компактний список — застосунок за ним
  // покаже "що можна побудувати" й перемалює вже збудоване в реальному розмірі.
  var SETTLEMENT_TOKEN_RE = /^(pirates?|vikings?|aztecs?|mughals?|polynesian?|egypt[a-z]*|japan[a-z]*|feudal[a-z]*|mughal[a-z]*)$/i;
  var settlementCatalogSig = '';

  function settlementTokenOfCid(cid) {
    var m = String(cid || '').match(/^[A-Za-z]{1,3}_([A-Za-z]+)_/);
    if (!m) { return null; }
    return SETTLEMENT_TOKEN_RE.test(m[1]) ? m[1] : null;
  }

  function footprintOfDef(def) {
    if (!def || typeof def !== 'object') { return { w: null, l: null }; }
    var w = Number(def.width);
    var l = Number(def.length);
    if (w > 0 && l > 0) { return { w: w, l: l }; }
    var comps = def.components && typeof def.components === 'object' ? def.components : {};
    var keys = Object.keys(comps);
    for (var i = 0; i < keys.length; i++) {
      var c = comps[keys[i]];
      var pl = c && c.placement;
      var sz = pl && (pl.size || pl);
      if (sz) {
        var sw = Number(sz.x != null ? sz.x : sz.width);
        var sl = Number(sz.y != null ? sz.y : sz.length);
        if (sw > 0 && sl > 0) { return { w: sw, l: sl }; }
      }
    }
    return { w: (w > 0 ? w : null), l: (l > 0 ? l : null) };
  }

  function collectSettlementCatalog(blocks) {
    try {
      var out = [];
      var seenCid = {};
      for (var bi = 0; bi < blocks.length && out.length < 400; bi++) {
        var blk = blocks[bi];
        if (!blk || typeof blk !== 'object') { continue; }
        var payload = blk.metadata || blk.data || blk.entities || blk;
        var arr = Array.isArray(payload) ? payload
          : (payload && typeof payload === 'object'
            ? Object.keys(payload).map(function (kk) { return payload[kk]; }) : null);
        if (!arr) { continue; }
        for (var ei = 0; ei < arr.length && out.length < 400; ei++) {
          var def = arr[ei];
          if (!def || typeof def !== 'object') { continue; }
          var cid = def.cityentity_id || def.id;
          if (!cid || seenCid[cid]) { continue; }
          if (!settlementTokenOfCid(cid)) { continue; }
          seenCid[cid] = 1;
          var fp = footprintOfDef(def);
          var nm = def.name;
          if (nm && typeof nm === 'object') {
            var nk = Object.keys(nm);
            nm = nk.length ? nm[nk[0]] : null;
          }
          out.push({
            cid: cid,
            type: def.type || (def.__class__ ? String(def.__class__) : null),
            w: fp.w,
            l: fp.l,
            name: (typeof nm === 'string' ? nm.slice(0, 80) : null),
            req: def.requirements || def.unlock_requirements || null
          });
        }
      }
      if (!out.length) { return; }
      var sig = out.length + ':' + out[0].cid;
      if (settlementCatalogSig === sig) { return; }
      settlementCatalogSig = sig;
      post({ __foeSync: true, kind: 'settlementCatalog', defs: out });
    } catch (e) {}
  }

  function handleBody(body) {
    var data;
    try { data = JSON.parse(body); } catch (e) { return; }
    if (!Array.isArray(data)) { return; }

    packetNo++;
    post({ __foeSync: true, kind: 'packet', n: packetNo, size: body.length });

    var seen = [];
    var found = {};
    var player = null;
    var got = false;

    for (var i = 0; i < data.length; i++) {
      var entry = data[i];
      if (!entry || typeof entry !== 'object') { continue; }
      var cls = String(entry.requestClass || '?');
      var mth = String(entry.requestMethod || '?');
      var key = cls + '.' + mth;
      seen.push(key);

      var rd = entry.responseData;
      maybeRawLog(key, rd);
      checkAutoWatch(cls, mth, rd, entry.requestData, entry.requestId);

      if (WANTED[key] && rd != null) {
        found[WANTED[key]] = rd;
        got = true;
      }

      // Бонуси — підсумовуємо прямо тут, щоб великий масив не губився при передачі
      if (cls === 'BoostService' && mth === 'getAllBoosts' && Array.isArray(rd)) {
        found.boostAgg = aggregateBoosts(rd);
        found.boostRawLength = rd.length;
        got = true;
      }
      if (cls === 'BoostService' && mth === 'getLimitedBonuses' && Array.isArray(rd)) {
        found.boostLimitedAgg = aggregateBoosts(rd);
        got = true;
      }
      if (cls === 'BoostService' && mth === 'getTimerBoosts' && Array.isArray(rd)) {
        found.boostTimerAgg = aggregateBoosts(rd);
        got = true;
      }

      // Пакет "Управління армією" — може містити вже готові підсумки бонусів
      if (/ArmyUnitManagement|ArmyBonus|CombatBoost|MilitaryBoost/i.test(cls) && rd != null) {
        found.armyInfo = { from: key, data: rd };
        got = true;
      }

      // Метадані гри — там визначення будівель з розмірами.
      // Відповідь — масив блоків метаданих різних типів.
      if (cls === 'StaticDataService' && mth === 'getMetadata' && rd) {
        var blocks = Array.isArray(rd) ? rd : Object.keys(rd).map(function (kk) { return rd[kk]; });
        var meta = { blockCount: blocks.length, blocks: [], cityEntities: null };
        for (var bi = 0; bi < blocks.length; bi++) {
          var blk = blocks[bi];
          if (!blk || typeof blk !== 'object') { continue; }
          var cn = String(blk.__class__ || blk.class || blk.type || '?');
          var bkeys = Object.keys(blk);
          meta.blocks.push(cn + ' {' + bkeys.slice(0, 8).join(',') + '}');
          // шукаємо блок з визначеннями будівель
          var payload = blk.metadata || blk.data || blk.entities || blk;
          var parr = Array.isArray(payload) ? payload : (payload && typeof payload === 'object'
            ? Object.keys(payload).map(function (kk) { return payload[kk]; }) : null);
          if (parr && parr.length && parr[0] && (parr[0].cityentity_id || parr[0].id) &&
              (parr[0].width != null || parr[0].length != null || parr[0].requirements != null)) {
            meta.cityEntities = {
              from: cn,
              count: parr.length,
              sample: parr.slice(0, 4)
            };
          }
        }
        found.metaInfo = meta;
        collectSettlementCatalog(blocks);
        got = true;
      }

      // Мапа ПОСЕЛЕННЯ (не головного міста) — приходить окремим викликом
      // CityMapService.getCityMap із власним gridId (напр. "cultural_outpost"),
      // а не всередині StartupService.getData, як для головного міста.
      // Формуємо в тій самій формі {gridId, unlocked_areas, blocked_areas,
      // entities}, яку вже розуміє FoeCityMap, — щоб можна було відобразити
      // мапу поселення тим самим компонентом.
      if (
        cls === 'CityMapService' && mth === 'getCityMap' && rd &&
        typeof rd === 'object' && rd.gridId && rd.gridId !== 'main' &&
        Array.isArray(rd.entities)
      ) {
        found.settlementMap = {
          gridId: rd.gridId,
          unlocked_areas: rd.unlocked_areas || null,
          blocked_areas: rd.blocked_areas || null,
          tilesets: rd.tilesets || null,
          entities: rd.entities.map(function (me) {
            if (!me || typeof me !== 'object') { return null; }
            return {
              id: me.id,
              cid: me.cityentity_id,
              x: (me.x != null ? me.x : (me.position && me.position.x)),
              y: (me.y != null ? me.y : (me.position && me.position.y)),
              dir: (me.direction != null ? me.direction : me.rotation),
              lvl: (me.level != null ? me.level : (me.state && me.state.level)),
              era: me.era || me.era_id || (me.state && me.state.era) || null,
              type: me.type,
              conn: me.connected,
              runtimeBonuses: compactEntityBonuses(me),
              prod: compactProductionState(me)
            };
          }).filter(Boolean)
        };
        got = true;
      }

      if (cls === 'StartupService' && mth === 'getData' && rd && typeof rd === 'object') {
        var ud = rd.user_data || rd.userData || {};
        if (ud.player_id || ud.user_id || ud.id) {
          var eraRaw = ud.era;
          var eraId = (eraRaw && typeof eraRaw === 'object')
            ? (eraRaw.era || eraRaw.id || eraRaw.value || null)
            : eraRaw;
          player = {
            id: String(ud.player_id || ud.user_id || ud.id),
            name: String(ud.user_name || ud.name || ''),
            city: ud.city_name || null,
            era: eraId || null,
            clanId: ud.clan_id || null,
            clanName: ud.clan_name || null
          };
          got = true;
        }
        if (Array.isArray(rd.boosts)) {
          found.boostStartupAgg = aggregateBoosts(rd.boosts);
          got = true;
        }
        // Настрій міста: шукаємо в rd, user_data, resources усе про happiness/enthus/mood
        var happ = {};
        function grabHapp(obj, prefix) {
          if (!obj || typeof obj !== 'object') { return; }
          for (var hk in obj) {
            if (!Object.prototype.hasOwnProperty.call(obj, hk)) { continue; }
            if (/happ|enthus|mood|content/i.test(hk) && typeof obj[hk] !== 'object') {
              happ[prefix + hk] = obj[hk];
            }
          }
        }
        var rres = (rd.resources && rd.resources.resources) || rd.resources || {};
        grabHapp(rd, 'rd.');
        grabHapp(ud, 'ud.');
        grabHapp(rres, 'res.');
        grabHapp(rd.city_map, 'map.');
        found.happiness = happ;
        found.startupResourceKeys = Object.keys(rres);
        found.userDataKeys = Object.keys(ud);
        // Огляд стартового пакета: назви ключів верхнього рівня + усе, де є "boost"
        var startupKeys = [];
        for (var sk in rd) {
          if (!Object.prototype.hasOwnProperty.call(rd, sk)) { continue; }
          var sv = rd[sk];
          var kind = Array.isArray(sv) ? ('array[' + sv.length + ']') : (sv && typeof sv === 'object' ? 'object' : typeof sv);
          startupKeys.push(sk + ':' + kind);
        }
        found.startupKeys = startupKeys;

        // Величні споруди з міської карти: беремо рівень + бонус кожної
        var ents = (rd.city_map && (rd.city_map.entities || rd.city_map)) || null;
        if (ents && typeof ents === 'object') {
          var list = Array.isArray(ents) ? ents : Object.keys(ents).map(function (k) { return ents[k]; });
          var gbs = [];
          var gbStateSamples = [];
          for (var e = 0; e < list.length; e++) {
            var en = list[e];
            if (!en || typeof en !== 'object') { continue; }
            if (!/greatbuilding/i.test(String(en.type || en.__class__ || ''))) { continue; }
            gbs.push({
              id: en.cityentity_id,
              level: (en.level != null) ? en.level : (en.state && en.state.level),
              bonus: en.bonus,
              bonuses: en.bonuses
            });
            if (gbStateSamples.length < 8) {
              try {
                gbStateSamples.push({
                  cid: en.cityentity_id,
                  level: en.level,
                  entKeys: Object.keys(en),
                  stateClass: en.state && en.state.__class__,
                  stateKeys: en.state ? Object.keys(en.state) : [],
                  state: JSON.stringify(en.state || {}).slice(0, 1400),
                  bonuses: en.bonuses,
                  bonus: en.bonus
                });
              } catch (er) {}
            }
          }
          found.cityGBs = gbs;
          found.cityGBsAll = gbs.length;
          found.gbStateSamples = gbStateSamples;

          // Виробничі будівлі: розбираємо продукцію кожної.
          var nowP = Math.floor(Date.now() / 1000);
          var stateCounts = {};
          var buildings = [];        // по одній на будівлю
          var unknownStates = {};    // стани, з яких не змогли витягти продукт
          var productClassCounts = {}; // {__class__: скільки продуктів}
          var productSamples = [];   // сирий JSON перших виробництв з не-ресурсним продуктом

          function flattenProducts(po) {
            // playerResources.resources — це вже конкретний готовий приз,
            // навіть коли isRandom:true (просто щоразу випадає різне).
            var out = { det: {}, guildDet: {}, rnd: false, other: [], frags: [] };
            var arr = (po && po.products) || [];
            for (var q = 0; q < arr.length; q++) {
              var pr = arr[q];
              if (!pr) { continue; }
              if (pr.isRandom || pr.type === 'random') { out.rnd = true; }
              var isGuild = /guild/i.test(String(pr.type || '') + ' ' + String(pr.__class__ || ''));
              var res = pr.playerResources && pr.playerResources.resources;
              var gres = pr.guildResources && pr.guildResources.resources;
              if (gres && typeof gres === 'object') {
                for (var grk in gres) {
                  if (Object.prototype.hasOwnProperty.call(gres, grk)) {
                    out.guildDet[grk] = (out.guildDet[grk] || 0) + (Number(gres[grk]) || 0);
                  }
                }
              }
              if (res && typeof res === 'object') {
                var bucket = isGuild ? out.guildDet : out.det;
                for (var rk in res) {
                  if (Object.prototype.hasOwnProperty.call(res, rk)) {
                    bucket[rk] = (bucket[rk] || 0) + (Number(res[rk]) || 0);
                  }
                }
              } else if (pr.type && pr.type !== 'resources') {
                // не-ресурсний продукт (фрагменти, набори, юніти, ОФ-пакети…)
                var rw = pr.reward || pr.genericReward || null;
                if (rw && (rw.__class__ === 'FragmentReward' || rw.subType === 'fragment')) {
                  var asm = rw.assembledReward || {};
                  out.frags.push({
                    id: rw.id || null,
                    amount: Number(rw.amount) || 0,
                    reqd: rw.requiredAmount != null ? Number(rw.requiredAmount) : null,
                    asmId: asm.id || null,
                    asmName: asm.name || rw.name || null,
                    asmIcon: asm.iconAssetName || 'icon_fragment',
                    motiv: !!pr.onlyWhenMotivated
                  });
                } else {
                  var entry = { type: pr.type, clazz: pr.__class__ };
                  if (rw && typeof rw === 'object') {
                    entry.rewardId = rw.id || rw.subType || null;
                    entry.rewardType = rw.type || rw.__class__ || null;
                    if (rw.amount != null) { entry.amount = rw.amount; }
                    if (rw.name) { entry.name = rw.name; }
                  }
                  out.other.push(entry);
                }
              }
            }
            return out;
          }

          for (var pi = 0; pi < list.length; pi++) {
            var pe = list[pi];
            if (!pe || typeof pe !== 'object') { continue; }
            var pt = String(pe.type || '');
            if (/street|decoration|main_building|off_grid/i.test(pt)) { continue; }
            var pst = pe.state || {};
            var pstc = String(pst.__class__ || 'none');
            stateCounts[pstc] = (stateCounts[pstc] || 0) + 1;

            // конкретний готовий приз — шукаємо в кількох можливих полях
            var concrete = pst.current_product || pst.produced_product || pst.reward || null;
            var po2 = concrete || pst.productionOption || null;
            var ready = /Finished|Produced|Ready|Collect/i.test(pstc)
              || (pst.next_state_transition_at ? (pst.next_state_transition_at <= nowP) : false);
            var b = {
              id: pe.cityentity_id,
              iid: pe.id,
              type: pt,
              st: pstc,
              ready: !!ready,
              readyAt: pst.next_state_transition_at || null
            };
            // Величні споруди й деякі будівлі мають одинарний current_product
            // ({name, product:{resources}} або {goods:[{good_id,value}]}).
            var cp1 = pst.current_product;
            if (cp1 && !cp1.products && (cp1.product || cp1.goods)) {
              var cpRes = cp1.product && cp1.product.resources;
              if (cpRes && typeof cpRes === 'object') {
                b.det = b.det || {};
                for (var crk in cpRes) {
                  if (Object.prototype.hasOwnProperty.call(cpRes, crk)) {
                    b.det[crk] = (b.det[crk] || 0) + (Number(cpRes[crk]) || 0);
                  }
                }
              }
              if (Array.isArray(cp1.goods)) {
                var toGuild = /clan|guild/i.test(
                  String(cp1.__class__ || '') + ' ' + String(cp1.name || '')
                );
                var gbucket = toGuild ? (b.guildDet = b.guildDet || {}) : (b.det = b.det || {});
                for (var cgi = 0; cgi < cp1.goods.length; cgi++) {
                  var cg = cp1.goods[cgi];
                  if (cg && cg.good_id) {
                    gbucket[cg.good_id] = (gbucket[cg.good_id] || 0) + (Number(cg.value) || 0);
                  }
                }
              }
              b.cp = cp1.name || null;
              productClassCounts[cp1.__class__ || 'current_product'] =
                (productClassCounts[cp1.__class__ || 'current_product'] || 0) + 1;
            }

            if (po2 && po2.products) {
              for (var qc = 0; qc < po2.products.length; qc++) {
                var pcc = po2.products[qc] && po2.products[qc].__class__;
                if (pcc) { productClassCounts[pcc] = (productClassCounts[pcc] || 0) + 1; }
              }
              var fl = flattenProducts(po2);
              b.det = Object.assign(b.det || {}, fl.det);
              if (Object.keys(fl.guildDet).length) {
                b.guildDet = Object.assign(b.guildDet || {}, fl.guildDet);
              }
              if (fl.frags.length) { b.frags = fl.frags; }
              if (fl.rnd) { b.rnd = true; }
              if (fl.other.length) {
                b.other = fl.other;
                if (productSamples.length < 8) {
                  try {
                    productSamples.push({
                      cid: pe.cityentity_id,
                      raw: JSON.stringify(po2).slice(0, 1500)
                    });
                  } catch (e) {}
                }
              }
            } else if (!b.det && !b.guildDet && !/Idle|Construction|Unconnected|None|none/i.test(pstc)) {
              unknownStates[pstc] = (unknownStates[pstc] || 0) + 1;
              b.stateKeys = Object.keys(pst);
            }
            buildings.push(b);
          }

          found.prodStateCounts = stateCounts;
          found.prodUnknownStates = unknownStates;
          found.prodBuildings = buildings;
          found.prodProductClasses = productClassCounts;
          found.prodProductSamples = productSamples;
          found.cityEntitiesAll = list.length;

          // --- Мапа міста: позиція+тип кожної будівлі ---
          var cm = rd.city_map || {};
          var cityMap = {
            keys: Object.keys(cm),
            gridId: cm.gridId,
            unlocked_areas: cm.unlocked_areas || null,
            blocked_areas: cm.blocked_areas || null,
            entityKeys: null,
            samples: [],
            entities: []
          };
          for (var mi = 0; mi < list.length; mi++) {
            var me = list[mi];
            if (!me || typeof me !== 'object') { continue; }
            if (cityMap.samples.length < 3) { cityMap.samples.push(me); }
            if (!cityMap.entityKeys) { cityMap.entityKeys = Object.keys(me); }
            cityMap.entities.push({
              id: me.id,
              cid: me.cityentity_id,
              x: (me.x != null ? me.x : (me.position && me.position.x)),
              y: (me.y != null ? me.y : (me.position && me.position.y)),
              dir: (me.direction != null ? me.direction : me.rotation),
              lvl: (me.level != null ? me.level : (me.state && me.state.level)),
              era: me.era || me.era_id || (me.state && me.state.era) || null,
              type: me.type,
              conn: me.connected,
              runtimeBonuses: compactEntityBonuses(me)
            });
          }
          found.cityMap = cityMap;
        }
        got = true;
      }

      // Будь-який пакет: шукаємо згадки Величних споруд і полів бонусів
      if (rd && typeof rd === 'object' && !found.gbHint) {
        var hint = scanForGB(rd, 0);
        if (hint) { found.gbHint = { from: key, sample: hint }; got = true; }
      }
    }

    if (got) {
      post({ __foeSync: true, kind: 'data', player: player, found: found, seen: seen });
    } else if (seen.length) {
      post({ __foeSync: true, kind: 'diag', seen: seen });
    }
  }

  function maybeHandle(url, body) {
    try {
      if (typeof url === 'string' && url.indexOf('/game/json') !== -1 && typeof body === 'string') {
        handleBody(body);
      }
    } catch (e) {}
  }

  // Перехоплення XMLHttpRequest
  try {
    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__foeUrl = url;
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      var xhr = this;
      try {
        var watchAtSend = autoWatch;
        var tapSerialAtSend = watchAtSend && watchAtSend.tapSerial;
        inspectAutoWatchRequest(xhr.__foeUrl, arguments[0], watchAtSend, tapSerialAtSend);
      } catch (e) {}
      this.addEventListener('load', function () {
        try { maybeHandle(xhr.__foeUrl, xhr.responseText); } catch (e) {}
      });
      return origSend.apply(this, arguments);
    };
  } catch (e) {}

  // Перехоплення fetch
  try {
    if (window.fetch) {
      var origFetch = window.fetch;
      window.fetch = function () {
        var args = arguments;
        var url = (args[0] && args[0].url) ? args[0].url : args[0];
        var requestBody = args[1] && args[1].body;
        var watchAtFetch = autoWatch;
        var tapSerialAtFetch = watchAtFetch && watchAtFetch.tapSerial;
        try {
          if (requestBody != null) {
            inspectAutoWatchRequest(url, requestBody, watchAtFetch, tapSerialAtFetch);
          } else if (args[0] && typeof args[0].clone === 'function') {
            args[0].clone().text().then(function (body) {
              inspectAutoWatchRequest(url, body, watchAtFetch, tapSerialAtFetch);
            }).catch(function () {});
          }
        } catch (e) {}
        return origFetch.apply(this, args).then(function (res) {
          try {
            res.clone().text().then(function (t) { maybeHandle(url, t); }).catch(function () {});
          } catch (e) {}
          return res;
        });
      };
    }
  } catch (e) {}

  // --- Читання чисел прямо з екрана гри (вікно "Управління армією") ---
  function scanArmyDom() {
    try {
      // будь-яке відкрите вікно гри
      var win = document.querySelector(
        '.window-frame, .game-window, [class*="window"], .dialog, [role="dialog"]'
      );
      var pct = [];
      var scope = win || document.body;
      var nodes = scope.querySelectorAll('*');
      for (var i = 0; i < nodes.length && pct.length < 80; i++) {
        var n = nodes[i];
        if (n.children && n.children.length) { continue; }
        var tx = (n.textContent || '').replace(/\\u00a0/g, ' ').trim();
        if (!/%/.test(tx) || tx.length > 20) { continue; }
        if (!/[0-9]/.test(tx)) { continue; }
        var ctx = '';
        var p = n.parentElement;
        for (var d = 0; d < 5 && p; d++) {
          if (typeof p.className === 'string' && p.className) { ctx += ' .' + p.className.split(' ').join('.'); }
          var tt = p.getAttribute && (p.getAttribute('title') || p.getAttribute('class'));
          p = p.parentElement;
        }
        pct.push({ v: tx, ctx: ctx.trim().slice(0, 140) });
      }
      // текст усього вікна (щоб побачити структуру)
      var winText = win ? (win.innerText || win.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 1200) : '';
      if (pct.length || winText) {
        post({ __foeSync: true, kind: 'domBoosts', hasWindow: !!win, pct: pct, winText: winText });
      }
    } catch (e) {}
  }

  setInterval(scanArmyDom, 3000);

  // --- Автоперехід через сторінку входу і вибір світу ---
  function realClick(el) {
    if (!el) { return; }
    try { el.click(); } catch (e) {}
    try {
      ['mousedown', 'mouseup', 'click'].forEach(function (t) {
        el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
      });
    } catch (e) {}
  }
  function clickableAncestor(el) {
    var p = el;
    for (var i = 0; i < 5 && p; i++) {
      if (p.tagName === 'A' || p.tagName === 'BUTTON' || p.onclick ||
          (p.getAttribute && p.getAttribute('onclick')) ||
          (p.getAttribute && /button|btn|clickable/i.test(p.className || ''))) {
        return p;
      }
      p = p.parentElement;
    }
    return el;
  }
  function outer(el) {
    try { return (el.outerHTML || '').replace(/\\s+/g, ' ').slice(0, 200); } catch (e) { return ''; }
  }

  var lastAdvance = 0;
  var authedSent = false;
  // Сигнал застосунку: потрібний світ уже реально віддає ігрові пакети.
  // Лише після цього вікно безпечно прибирати з екрана.
  function markAuthed() {
    if (authedSent) { return; }
    authedSent = true;
    post({ __foeSync: true, kind: 'authed' });
  }
  function autoAdvance() {
    try {
      var w = String(window.__FOE_WORLD || '').trim().toLowerCase();
      var href = String(location.href || '');
      var currentHost = String(location.hostname || '').trim().toLowerCase();
      var currentPath = String(location.pathname || '');
      var targetHost = w ? w + '.forgeofempires.com' : '';
      var onGameIndex = /^\\/game\\/index(?:\\/|$)/.test(currentPath);
      var isLoginShell = /master-page-login/i.test(href);
      if (targetHost && currentHost === targetHost && onGameIndex && !isLoginShell) {
        if (packetNo > 0) { markAuthed(); }
        return;
      }
      // Спільні cookies можуть спершу відкрити останній відвіданий світ.
      // Не збираємо й не клікаємо його DOM — переходимо на host активної гільдії.
      if (
        targetHost && currentHost && currentHost !== targetHost &&
        /(?:^|\\.)forgeofempires\\.com$/.test(currentHost) &&
        onGameIndex && !isLoginShell
      ) {
        lastAdvance = Date.now();
        if (typeof location.replace === 'function') {
          location.replace('https://' + targetHost + '/game/index?');
        } else {
          location.href = 'https://' + targetHost + '/game/index?';
        }
        return;
      }

      var worlds = [];
      var playBtns = [];
      var report = ['w=' + JSON.stringify(w) + ' url=' + href];

      // Кнопка "Грати" на порталі — стабільні id/class, не залежать від мови
      var pb = document.querySelector(
        '#play_now_button, input.play_button, .play_button, input[name="play"], a.launcher-play, a.play-now'
      );
      if (pb) { playBtns.push(pb); report.push('PLAY#: ' + outer(pb)); }

      // Кнопки вибору світу: <a class="world_select_button" value="ru3">Сигард</a>
      var wsb = document.querySelectorAll('a.world_select_button, .world_select_button, [class*="world_select"]');
      for (var wi = 0; wi < wsb.length; wi++) {
        var wv = String(wsb[wi].getAttribute('value') || wsb[wi].getAttribute('data-world') || '').trim().toLowerCase();
        report.push('WSB value="' + wv + '" "' + (wsb[wi].textContent || '').trim() + '"');
        if (wv && wv === w) {
          if (Date.now() - lastAdvance >= 2000) {
            realClick(wsb[wi]);
            lastAdvance = Date.now();
          }
          post({ __foeSync: true, kind: 'worldSelectDump', world: w, url: href, title: document.title, els: report });
          return;
        }
      }
      // Селектор уже відкритий, але активного worldId у ньому немає.
      // Не натискаємо випадковий Play/default world — лишаємо вибір видимим.
      if (wsb.length) {
        report.push('TARGET_WORLD_MISSING');
        post({ __foeSync: true, kind: 'worldSelectDump', world: w, url: href, title: document.title, els: report });
        return;
      }

      // Знаходимо всі елементи з текстом = назва світу або "Грати"
      var all = document.querySelectorAll('a, button, input, span, div, li, td, p, h1, h2, h3');
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (el.children && el.children.length > 2) { continue; }
        var t = (el.textContent || el.value || '').trim();
        var hrefA = (el.tagName === 'A' && (el.getAttribute('href') || '')) || '';
        if ((t && t.length <= 24 && /играть|грати|играй|^play$|spielen|jouer|jugar|gioca/i.test(t)) ||
            /\\/game\\/index|play-now|launch/i.test(hrefA)) {
          var pa = clickableAncestor(el);
          playBtns.push(el);
          if (report.length < 40) { report.push('PLAY "' + t + '": ' + outer(pa)); }
        } else if (t && /^[А-ЯЁІЇЄ][а-яёіїє]{3,13}$/.test(t)) {
          var anc = clickableAncestor(el);
          worlds.push({ name: t, el: el, anc: anc });
          if (report.length < 40) {
            report.push('WORLD "' + t + '": ' + outer(anc));
          }
        }
      }
      post({ __foeSync: true, kind: 'worldSelectDump', world: w, url: href, title: document.title, els: report });

      if (Date.now() - lastAdvance < 2500) { return; }

      // 1) якщо є кнопки світів — клікаємо ту, чий предок веде на наш worldId
      for (var k = 0; k < worlds.length; k++) {
        var wb = worlds[k];
        var blob = (outer(wb.anc) + ' ' + (wb.anc.href || '') + ' ' + (wb.anc.getAttribute && wb.anc.getAttribute('onclick') || '')).toLowerCase();
        if (blob.indexOf('//' + w + '.') !== -1 || blob.indexOf('/' + w + '/') !== -1 ||
            blob.indexOf('"' + w + '"') !== -1 || blob.indexOf("'" + w + "'") !== -1 ||
            blob.indexOf('world=' + w) !== -1 || blob.indexOf('=' + w) !== -1) {
          realClick(wb.el);
          realClick(wb.anc);
          lastAdvance = Date.now();
          return;
        }
      }
      // 2) інакше — тиснемо "Грати" (відкриває діалог вибору світу)
      if (playBtns.length) {
        realClick(playBtns[0]);
        realClick(clickableAncestor(playBtns[0]));
        lastAdvance = Date.now();
        return;
      }

      // 3) запасний варіант: на сторінці порталу без кнопки — прямий перехід у гру
      if (w && (/\\/page/.test(href) || /master-page-login/.test(href))) {
        window.__foeStuck = (window.__foeStuck || 0) + 1;
        if (window.__foeStuck >= 4) {
          window.__foeStuck = 0;
          lastAdvance = Date.now();
          location.href = 'https://' + w + '.forgeofempires.com/game/index';
        }
      }
    } catch (e) {}
  }
  setInterval(autoAdvance, 1500);

  // Поточна адреса сторінки (FoE — SPA, тож стежимо і за hash/history)
  var lastUrl = '';
  function reportUrl() {
    try {
      var u = String(location.href || '');
      if (u !== lastUrl) {
        lastUrl = u;
        post({ __foeSync: true, kind: 'url', url: u });
      }
    } catch (e) {}
  }
  reportUrl();
  setInterval(reportUrl, 1500);
  try {
    window.addEventListener('hashchange', reportUrl);
    window.addEventListener('popstate', reportUrl);
    var _ps = history.pushState;
    history.pushState = function () { var r = _ps.apply(this, arguments); reportUrl(); return r; };
  } catch (e) {}

  // --- Пошук статичних ресурсів гри серед завантажених файлів ---
  var iconSheetSent = false;
  var goodsSheetSent = false;
  var lookupSent = false;
  var seenAssets = {};
  var buildingUrls = {};      // { cityentity_id: metadataUrl } — напряму з ресурсів гри
  var buildingUrlsSentCount = 0;
  // Додаткові спрайт-листи (напр. іконки ресурсів поселення) — {base:{png,json}}.
  var spritePairs = {};
  var spritePairsSent = {};
  // Окремі PNG-іконки ресурсів поселення. Гра вантажить їх поштучно на вимогу:
  //   assets/shared/icons/goods_100x100/fine_<key>-<hash>.png  — чиста іконка
  //   assets/city/gui/production_icons/<key>_<n>-<hash>.png     — іконка рецепта
  // { <key>: { url, clean } }.  clean=true — з goods_100x100 (пріоритетна).
  var iconUrls = {};
  var lastIconSig = '';
  function scanAssets() {
    try {
      var live = performance.getEntriesByType('resource');
      var all = _perfUrls.slice();
      for (var k = 0; k < live.length; k++) { all.push(live[k].name || ''); }

      var hits = [];
      var iconPng = null, iconJson = null;
      var goodsPng = null, goodsJson = null;
      var lookupUrl = null, metaBase = null;
      for (var i = 0; i < all.length; i++) {
        var u = all[i] || '';
        if (/shared\\/icons\\/icons_0-[a-f0-9]+\\.png/i.test(u)) { iconPng = u; }
        if (/shared\\/icons\\/icons_0-[a-f0-9]+\\.json/i.test(u)) { iconJson = u; }
        if (/goods_large\\/[a-z_]*goods_large_0-[a-f0-9]+\\.png/i.test(u)) { goodsPng = u; }
        if (/goods_large\\/[a-z_]*goods_large_0-[a-f0-9]+\\.json/i.test(u)) { goodsJson = u; }
        if (/building_entity_lookup-/i.test(u)) { lookupUrl = u; }
        var m = u.match(/[?&]id=building_entity_(.+?)-[a-f0-9]{6,}(?:[&#]|$)/i);
        if (m && m[1] && m[1] !== 'lookup') {
          buildingUrls[m[1]] = u;
          if (!metaBase) { metaBase = u; }
        }
        // Спрайт-листи (валюти в icons_0 тощо): <base>-<hash>.png + .json поруч.
        var sp = u.match(/\\/([a-z0-9_]+)-[a-f0-9]{6,}\\.(png|json)(?:[?#]|$)/i);
        if (sp) {
          var base = sp[1].toLowerCase();
          if (/(icons_0|goods_large|goods_small|currenc|resource_icon)/i.test(base)) {
            if (!spritePairs[base]) { spritePairs[base] = {}; }
            spritePairs[base][sp[2].toLowerCase()] = u;
          }
        }
        // Поштучні іконки товарів поселення — за ТЕКОЮ (надійно):
        //   .../goods_100x100/fine_<key>-<hash>.png     (чиста іконка товару)
        //   .../production_icons/<key>_<n>-<hash>.png    (іконка рецепта)
        var mIcon = u.match(
          /\\/(goods_100x100|production_icons)\\/([a-z0-9_]+)-[a-f0-9]{5,}\\.png(?:[?#]|$)/i
        );
        if (mIcon) {
          var clean = /goods_100x100/i.test(mIcon[1]);
          var rkey = mIcon[2].toLowerCase()
            .replace(/^fine_/, '')
            .replace(/_[0-9]+$/, '');
          var existing = iconUrls[rkey];
          if (rkey && (!existing || (clean && !existing.clean))) {
            iconUrls[rkey] = { url: u, clean: clean };
          }
        }
        if (seenAssets[u]) { continue; }
        // Діагностика поселень: усі png/json/atlas (обрізаємо до шляху), щоб
        // побачити, під якою назвою лежить лист іконок товарів.
        if (
          /\\.(png|json|atlas)(\\?|#|$)/i.test(u) &&
          Object.keys(seenAssets).length < 600
        ) {
          seenAssets[u] = true;
          hits.push(u.replace(/^https?:\\/\\/[^/]+/i, '').split(/[?#]/)[0]);
        }
      }
      if (hits.length) { post({ __foeSync: true, kind: 'assets', urls: hits }); }
      for (var b in spritePairs) {
        if (!Object.prototype.hasOwnProperty.call(spritePairs, b)) { continue; }
        var pair = spritePairs[b];
        if (pair.png && pair.json && !spritePairsSent[b]) {
          spritePairsSent[b] = 1;
          post({ __foeSync: true, kind: 'spriteSheet', base: b, png: pair.png, json: pair.json });
        }
      }
      var flatIcons = {};
      for (var ik in iconUrls) {
        if (Object.prototype.hasOwnProperty.call(iconUrls, ik)) {
          flatIcons[ik] = iconUrls[ik].url;
        }
      }
      var iconSig = JSON.stringify(flatIcons);
      if (iconSig !== lastIconSig) {
        lastIconSig = iconSig;
        post({ __foeSync: true, kind: 'iconUrls', map: flatIcons });
      }
      if (!iconSheetSent && iconPng && iconJson) {
        iconSheetSent = true;
        post({ __foeSync: true, kind: 'iconSheet', png: iconPng, json: iconJson });
      }
      if (!goodsSheetSent && goodsPng && goodsJson) {
        goodsSheetSent = true;
        post({ __foeSync: true, kind: 'goodsSheet', png: goodsPng, json: goodsJson });
      }
      if (!lookupSent && lookupUrl) {
        lookupSent = true;
        post({ __foeSync: true, kind: 'buildingLookup', url: lookupUrl, metaExample: metaBase });
      }
      var n = Object.keys(buildingUrls).length;
      if (n > buildingUrlsSentCount) {
        buildingUrlsSentCount = n;
        post({ __foeSync: true, kind: 'buildingUrls', map: buildingUrls });
      }
    } catch (e) {}
  }
  setInterval(scanAssets, 4000);
  scanAssets();

  // --- ТИМЧАСОВО: дамп JS-середовища гри (шукаємо гачок «відкрити поселення») ---
  function jsKeys(o) {
    try { return Object.getOwnPropertyNames(o); } catch (e) { return []; }
  }
  function jsDescribe(v) {
    var t = typeof v;
    if (t === 'function') {
      var src = '';
      try { src = Function.prototype.toString.call(v).replace(/\\s+/g, ' ').slice(0, 700); } catch (e) {}
      var own = jsKeys(v).filter(function (k) {
        return k !== 'length' && k !== 'name' && k !== 'prototype' && k !== 'arguments' && k !== 'caller';
      }).slice(0, 40);
      var proto = [];
      try { if (v.prototype) { proto = jsKeys(v.prototype).slice(0, 40); } } catch (e) {}
      return { t: 'function', src: src, staticKeys: own, protoKeys: proto };
    }
    if (v && t === 'object') {
      var ks = jsKeys(v).slice(0, 80);
      var pk = [];
      try {
        var p = Object.getPrototypeOf(v);
        if (p && p !== Object.prototype) { pk = jsKeys(p).slice(0, 80); }
      } catch (e) {}
      return { t: 'object', keys: ks, protoKeys: pk };
    }
    return { t: t, v: (t === 'string' ? String(v).slice(0, 100) : v) };
  }
  var CLASS_RE = /outpost|settlement|cultur|citymap|CityMap|grid|parser|serverrequest|requestqueue|Ajax|proxy|quest|building|entity|hud|menu|view|navigat|context|StartupService|CityMapService/i;

  function dumpJsEnv(tag) {
    try {
      var wk = jsKeys(window);
      var out = { tag: tag, t: Date.now(), keyCount: wk.length };

      // 1) власні (не браузерні) глобали вікна
      var nonBuiltin = [];
      for (var i = 0; i < wk.length; i++) {
        var nm = wk[i];
        if (/^[A-Z]/.test(nm) && /Element$|Event$|Error$|Observer$|Node$|^Web|^SVG|^HTML|^RTC|^IDB|^Audio|^Media/.test(nm)) { continue; }
        if (/^(window|document|location|navigator|history|console|self|top|parent|frames|globalThis)$/.test(nm)) { continue; }
        var tv;
        try { tv = typeof window[nm]; } catch (e) { continue; }
        if (tv === 'object' || tv === 'function') { nonBuiltin.push(nm + ':' + tv); }
      }
      out.nonBuiltin = nonBuiltin.slice(0, 400).join(',');

      // 2) маркери Haxe / модульних систем
      var markers = {};
      ['$hxClasses', '$hx_exports', '$estr', '$s', 'haxe', 'js', 'HxOverrides',
       'Std', 'Reflect', 'Type', 'EReg', 'Lambda', 'webpackJsonp',
       '__webpack_require__', 'require', 'define', 'System', 'lime', 'openfl',
       'MainParser', 'ServerRequestQueue', 'FoEproxy', 'FoEProxy'].forEach(function (n) {
        try {
          var v = window[n];
          if (v == null) { return; }
          markers[n] = typeof v + (typeof v === 'object' ? ('/' + jsKeys(v).length + 'k') : '');
        } catch (e) {}
      });
      out.markers = markers;

      // 3) реєстр класів Haxe — головна ціль
      var reg = null;
      try { reg = window.$hxClasses; } catch (e) {}
      if (reg && typeof reg === 'object') {
        var rk = jsKeys(reg);
        out.hxClassCount = rk.length;
        var matched = [];
        for (var r = 0; r < rk.length; r++) {
          if (CLASS_RE.test(rk[r])) { matched.push(rk[r]); }
        }
        out.hxClassMatched = matched.slice(0, 200);
        // деталі кількох найцікавіших
        var detail = {};
        matched.slice(0, 25).forEach(function (cn) {
          try {
            var cls = reg[cn];
            var d = { staticKeys: jsKeys(cls).filter(function (k) {
              return ['length', 'name', 'prototype', '__name__', '__super__'].indexOf(k) < 0;
            }).slice(0, 50) };
            if (cls && cls.prototype) { d.protoKeys = jsKeys(cls.prototype).slice(0, 60); }
            detail[cn] = d;
          } catch (e) {}
        });
        out.hxClassDetail = detail;
      } else {
        out.hxClassCount = 0;
      }

      // 4) глибокий дамп window.foe і кількох кандидатів
      var deep = {};
      ['foe', 'startFoe', 'onGameLoaded', 'preloadFoe'].forEach(function (n) {
        try { if (window[n] != null) { deep[n] = jsDescribe(window[n]); } } catch (e) {}
      });
      out.deep = deep;

      post({ __foeSync: true, kind: 'jsenv', tag: tag, t: out.t, data: out });
    } catch (e) {
      post({ __foeSync: true, kind: 'jsenv', tag: tag, t: Date.now(), data: { error: String(e) } });
    }
  }
  setTimeout(function () { dumpJsEnv('t5'); }, 5000);
  setTimeout(function () { dumpJsEnv('t15'); }, 15000);
  setTimeout(function () { dumpJsEnv('t35'); }, 35000);

  post({ __foeSync: true, kind: 'ready' });
})();
true;
`;
