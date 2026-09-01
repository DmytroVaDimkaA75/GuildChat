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

      // Пакет "Управління армією" — може містити вже готові підсумки бонусів
      if (/ArmyUnitManagement|ArmyBonus|CombatBoost|MilitaryBoost/i.test(cls) && rd != null) {
        found.armyInfo = { from: key, data: rd };
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
          }
          found.cityGBs = gbs;
          found.cityGBsAll = gbs.length;

          // Виробничі будівлі: розбираємо продукцію кожної.
          var nowP = Math.floor(Date.now() / 1000);
          var stateCounts = {};
          var buildings = [];        // по одній на будівлю
          var unknownStates = {};    // стани, з яких не змогли витягти продукт

          function flattenProducts(po) {
            // playerResources.resources — це вже конкретний готовий приз,
            // навіть коли isRandom:true (просто щоразу випадає різне).
            var out = { det: {}, rnd: false, other: [] };
            var arr = (po && po.products) || [];
            for (var q = 0; q < arr.length; q++) {
              var pr = arr[q];
              if (!pr) { continue; }
              if (pr.isRandom || pr.type === 'random') { out.rnd = true; }
              var res = pr.playerResources && pr.playerResources.resources;
              if (res && typeof res === 'object') {
                for (var rk in res) {
                  if (Object.prototype.hasOwnProperty.call(res, rk)) {
                    out.det[rk] = (out.det[rk] || 0) + (Number(res[rk]) || 0);
                  }
                }
              } else if (pr.type && pr.type !== 'resources') {
                out.other.push({ type: pr.type, clazz: pr.__class__ });
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
              type: pt,
              st: pstc,
              ready: !!ready,
              readyAt: pst.next_state_transition_at || null
            };
            if (po2 && po2.products) {
              var fl = flattenProducts(po2);
              b.det = fl.det;
              if (fl.rnd) { b.rnd = true; }
              if (fl.other.length) { b.other = fl.other; }
            } else if (!/Idle|Construction|Unconnected|None|none/i.test(pstc)) {
              unknownStates[pstc] = (unknownStates[pstc] || 0) + 1;
              b.stateKeys = Object.keys(pst);
            }
            buildings.push(b);
          }

          found.prodStateCounts = stateCounts;
          found.prodUnknownStates = unknownStates;
          found.prodBuildings = buildings;
          found.cityEntitiesAll = list.length;
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
  // Портал памʼятає користувача, тож просто тиснемо "Грати" і потрібний світ.
  function clickByText(re) {
    var els = document.querySelectorAll('a, button, input[type="button"], input[type="submit"]');
    for (var i = 0; i < els.length; i++) {
      var t = (els[i].textContent || els[i].value || '').trim();
      if (t && re.test(t)) { els[i].click(); return true; }
    }
    return false;
  }
  var lastAdvance = 0;
  function autoAdvance() {
    try {
      var w = window.__FOE_WORLD;
      var href = String(location.href || '');
      // всередині гри вже — нічого не робимо
      if (/\\/game\\/index/.test(href) && !/master-page-login/.test(href)) { return; }
      var now = Date.now();
      if (now - lastAdvance < 2500) { return; }

      // Сторінка входу порталу: кнопка "Грати" / "Играть" / "Play"
      if (/\\/page/.test(href) || /master-page-login/.test(href)) {
        var play = document.querySelector('a.launcher-play, a.play-now, a[href*="/game/index"], .browser-warning ~ * a[href*="game"]');
        if (play) { play.click(); lastAdvance = now; return; }
        if (clickByText(/^(грати|играть|play)$/i)) { lastAdvance = now; return; }
      }

      // Вибір світу: клікаємо елемент, що веде на потрібний worldId
      if (w) {
        var cand = document.querySelectorAll('a, button, [onclick], [data-world], .world-select-button');
        for (var j = 0; j < cand.length; j++) {
          var el = cand[j];
          var blob = (el.getAttribute('href') || '') + ' ' +
                     (el.getAttribute('onclick') || '') + ' ' +
                     (el.getAttribute('data-world') || '') + ' ' +
                     (el.className || '');
          if (blob.indexOf(w + '.') !== -1 ||
              blob.indexOf('"' + w + '"') !== -1 ||
              blob.indexOf("'" + w + "'") !== -1 ||
              blob.indexOf('world=' + w) !== -1 ||
              blob.indexOf('/' + w + '/') !== -1) {
            el.click();
            lastAdvance = now;
            return;
          }
        }
      }
    } catch (e) {}
  }
  setInterval(autoAdvance, 1200);

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

  post({ __foeSync: true, kind: 'ready' });
})();
true;
`;
