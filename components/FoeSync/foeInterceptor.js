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

  // requestClass.requestMethod -> під якою назвою покласти сирі дані
  var WANTED = {
    'ResourceService.getPlayerResourceBag': 'goods',
    'ResourceService.getResourceBag': 'goods',
    'ResourceService.getResourceDefinitions': 'resourceDefs'
  };

  function post(payload) {
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
    } catch (e) {}
  }

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

  function handleBody(body) {
    var data;
    try { data = JSON.parse(body); } catch (e) { return; }
    if (!Array.isArray(data)) { return; }

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

      if (cls === 'StartupService' && mth === 'getData' && rd && typeof rd === 'object') {
        var ud = rd.user_data || rd.userData || {};
        if (ud.user_id || ud.id) {
          player = {
            id: String(ud.user_id || ud.id),
            name: String(ud.user_name || ud.name || '')
          };
          got = true;
        }
        if (Array.isArray(rd.boosts)) {
          found.boostStartupAgg = aggregateBoosts(rd.boosts);
          got = true;
        }
        // Огляд стартового пакета: назви ключів верхнього рівня + усе, де є "boost"
        var startupKeys = [];
        for (var sk in rd) {
          if (!Object.prototype.hasOwnProperty.call(rd, sk)) { continue; }
          var sv = rd[sk];
          var kind = Array.isArray(sv) ? ('array[' + sv.length + ']') : (sv && typeof sv === 'object' ? 'object' : typeof sv);
          startupKeys.push(sk + ':' + kind);
        }
        found.startupKeys = startupKeys;
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
        return origFetch.apply(this, args).then(function (res) {
          try {
            res.clone().text().then(function (t) { maybeHandle(url, t); }).catch(function () {});
          } catch (e) {}
          return res;
        });
      };
    }
  } catch (e) {}

  post({ __foeSync: true, kind: 'ready' });
})();
true;
`;
