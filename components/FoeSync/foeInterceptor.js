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
    'BoostService.getAllBoosts': 'boosts',
    'BoostService.getLimitedBonuses': 'boostsLimited',
    'BoostService.getTimerBoosts': 'boostsTimer',
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

      if (cls === 'StartupService' && mth === 'getData' && rd && typeof rd === 'object') {
        var ud = rd.user_data || rd.userData || {};
        if (ud.user_id || ud.id) {
          player = {
            id: String(ud.user_id || ud.id),
            name: String(ud.user_name || ud.name || '')
          };
          got = true;
        }
        // у стартовому пакеті теж інколи є зведення бонусів
        if (rd.boosts && !found.boosts) { found.boostsStartup = rd.boosts; got = true; }
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
