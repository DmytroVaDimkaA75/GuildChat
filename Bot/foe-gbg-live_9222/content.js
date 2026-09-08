(function inject() {
  const s = document.createElement('script');
  s.src = chrome.runtime.getURL('injected.js');
  s.async = false;
  (document.head || document.documentElement).appendChild(s);
  s.onload = () => s.remove();
})();

let lastState = null;

window.addEventListener('foe:gbg-update', (e) => {
  const st = e?.detail;
  if (!st) return;
  lastState = st;

  console.log('[Content Script] Отримав дані від injected.js! Намагаюся відправити у background.js. Дані:', st);

  chrome.runtime.sendMessage({ type: 'GBG_PUSH', payload: st }).catch((error) => {
      console.error('[Content Script] Помилка при відправці повідомлення у background.js:', error);
  });
}, false);

window.addEventListener('foe:gbg-event', (e) => {
  const eventData = e?.detail;
  if (!eventData || !eventData.eventType) return;

  chrome.runtime.sendMessage({ type: 'GBG_EVENT', payload: eventData }).catch(() => {});
}, false);
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === 'GET_STATE_FROM_PAGE') {
    if (lastState) {
      sendResponse({ ok: true, state: lastState });
      return;
    }

    const reqType = 'foe:get-state';
    const resType = 'foe:state';

    const listener = (evt) => {
      const d = evt?.data;
      if (d && d.type === resType && d.state) {
        window.removeEventListener('message', listener);
        lastState = d.state;
        sendResponse({ ok: true, state: d.state });
      }
    };
    window.addEventListener('message', listener, { once: true });
    window.postMessage({ type: reqType }, '*');
    return true;
  }
});
