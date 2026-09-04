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
  // Сигнал застосунку: вхід у гру підтверджено (логін/пароль прийнято).
  // Далі вікно гри можна прибрати з екрана — автоперехід доробить у фоні.
  function markAuthed() {
    if (authedSent) { return; }
    authedSent = true;
    post({ __foeSync: true, kind: 'authed' });
  }
  function autoAdvance() {
    try {
      var w = window.__FOE_WORLD || '';
      var href = String(location.href || '');
      if (/\\/game\\/index/.test(href) && !/master-page-login/.test(href)) { markAuthed(); return; }

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
      if (wsb.length) { markAuthed(); }
      for (var wi = 0; wi < wsb.length; wi++) {
        var wv = wsb[wi].getAttribute('value') || wsb[wi].getAttribute('data-world') || '';
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
        var blob = outer(wb.anc) + ' ' + (wb.anc.href || '') + ' ' + (wb.anc.getAttribute && wb.anc.getAttribute('onclick') || '');
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
        if (seenAssets[u]) { continue; }
        if (/\\.(png|json)(\\?|$)/i.test(u) && /(good|resource|icon|sprite|atlas)/i.test(u)) {
          seenAssets[u] = true;
          hits.push(u);
        }
      }
      if (hits.length) { post({ __foeSync: true, kind: 'assets', urls: hits }); }
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

  post({ __foeSync: true, kind: 'ready' });
})();
true;
`;
