// The same measured canvas coordinates used by the original settlement screen.
const DEFAULT_SHIP_CALIB = Object.freeze({
  canvasX: 696, canvasY: 228, canvasW: 1024, canvasH: 765,
  scrollDx: -708, scrollDy: 123,
});

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
  nativeGestures = true, timeoutMs = 75000,
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
      while (current() && !gesture) {
        const nonce = `settlement-probe-${generation}-${++sequence}`;
        const message = await waitForMessage('interactionProbe', nonce,
          `window.__foeProbeInteraction && window.__foeProbeInteraction(${JSON.stringify(nonce)}); true;`);
        if (!current()) return;
        // Only measurable canvas geometry is needed. In particular we do not
        // wait for document.readyState === 'complete' or a 25-second warm-up.
        gesture = scaleSettlementGesture(message?.probe);
        if (!gesture) await delay(150);
      }
      if (!current()) return;
      onState({ phase: 'opening', settlementId });
      if (!nativeGestures) {
        tapped = true;
        inject(`window.__foeAutoEnterTest && window.__foeAutoEnterTest(${gesture.x}, ${gesture.y}, ${gesture.dx}, ${gesture.dy}); true;`);
        return;
      }
      if (typeof swipe !== 'function' || typeof tap !== 'function') {
        fail('unsupported');
        return;
      }
      const tag = Number(getTag());
      if (!Number.isInteger(tag) || tag <= 0) { fail(); return; }
      await swipe(tag, gesture.dx / gesture.viewportW, gesture.dy / gesture.viewportH);
      if (!current()) return;
      await delay(600);
      if (!current()) return;
      attemptId = `settlement-tap-${generation}-${++sequence}`;
      const armed = await waitForMessage('watch_armed', attemptId,
        `window.__foeArmNativeAutoEnter && window.__foeArmNativeAutoEnter(${gesture.x}, ${gesture.y}, ${JSON.stringify(attemptId)}); true;`);
      if (!current()) return;
      if (!armed) { fail(); return; }
      // Retrying only the tap is safe: repeating the pan would move the camera
      // away from the recorded location. Stop as soon as the game sends a request.
      for (let attempt = 0; attempt < 4 && current() && !requestSent; attempt += 1) {
        tapped = true;
        await tap(tag, gesture.x / gesture.viewportW, gesture.y / gesture.viewportH, attemptId);
        if (current() && !requestSent && attempt < 3) await delay(2200);
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
      (message.kind === 'interactionProbe' && pending.kind === message.kind && message.nonce === pending.nonce) ||
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
      if (message.step === 'request_sent') requestSent = true;
      if (['wrong_grid', 'no_request', 'request_no_response', 'error'].includes(message.step)) fail();
      return;
    }
    if (message.kind !== 'data') return;
    const map = message.found?.settlementMap;
    if (tapped && requestSent && map?.gridId === 'cultural_outpost' && Array.isArray(map.entities)) {
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
    onState({ phase: 'loading', settlementId });
    void enter(epoch);
  }

  return { handleMessage, cancel, fail };
}

module.exports = {
  DEFAULT_SHIP_CALIB, settlementIdFromCityMap, scaleSettlementGesture,
  createSettlementPacketSession,
};
