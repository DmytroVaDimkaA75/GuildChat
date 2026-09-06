const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const {
  DEFAULT_SHIP_CALIB,
  settlementIdFromCityMap,
  scaleSettlementGesture,
  createSettlementPacketSession,
} = require('./settlementPacketSession');

const GENERATION = 7;
const HOST = 'en1.forgeofempires.com';
const DOCUMENT = 'document-1';
const TAG = 42;
const CITY_MAP = {
  entities: [{ id: 1, cid: 'Y_Pirates_Ship1', type: 'outpost_ship' }],
};
const SETTLEMENT_MAP = {
  gridId: 'cultural_outpost',
  entities: [{ id: 2, cid: 'H_Pirates_Townhall', x: 0, y: 0 }],
};
const PROBE = {
  readyState: 'loading',
  visibilityState: 'visible',
  hidden: false,
  pageHost: HOST,
  viewportW: 1024,
  viewportH: 765,
  canvasTag: 'canvas',
  rect: { left: 0, top: 0, width: 1024, height: 765 },
  targetVisible: true,
  stable: true,
};

const flushPromises = async () => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
};

function createHarness(t, options = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = { probes: [], arms: [], swipes: [], taps: [], fallbacks: [], states: [] };
  const window = {
    __foeProbeInteraction: (...args) => calls.probes.push(args),
    __foeArmNativeAutoEnter: (...args) => {
      calls.arms.push(args);
      return true;
    },
    __foeAutoEnterTest: (...args) => calls.fallbacks.push(args),
  };
  const session = createSettlementPacketSession({
    generation: GENERATION,
    expectedHost: HOST,
    inject: (script) => vm.runInNewContext(script, { window }),
    getTag: () => TAG,
    swipe: (...args) => {
      calls.swipes.push(args);
      return options.swipe ? options.swipe(...args) : Promise.resolve(true);
    },
    tap: (...args) => {
      calls.taps.push(args);
      return options.tap ? options.tap(...args) : Promise.resolve(true);
    },
    onState: (state) => calls.states.push(state),
    ...options.session,
  });
  t.after(() => session.cancel());
  const send = (message) => session.handleMessage({
    __foeSync: true,
    generation: GENERATION,
    pageHost: HOST,
    documentId: DOCUMENT,
    ...message,
  });
  send({ kind: 'ready', documentStartedAt: 1000 });
  const sendShip = () => send({ kind: 'data', found: { cityMap: CITY_MAP } });
  const sendProbe = (probe = PROBE) => {
    assert.ok(calls.probes.length, 'the settlement signal must request a viewport probe');
    const [nonce] = calls.probes.at(-1);
    send({ kind: 'interactionProbe', nonce, probe });
  };
  const settleSwipe = async () => {
    await flushPromises();
    t.mock.timers.tick(600);
    await flushPromises();
  };
  const armAndTap = async () => {
    sendShip();
    sendProbe();
    await settleSwipe();
    assert.equal(calls.arms.length, 1);
    const [, , attemptId] = calls.arms[0];
    send({ kind: 'autoEnter', step: 'watch_armed', attemptId });
    await flushPromises();
    assert.equal(calls.taps.length, 1);
    return attemptId;
  };
  return { session, calls, send, sendShip, sendProbe, settleSwipe, armAndTap };
}

test('recognizes the active settlement only from a supported outpost ship', () => {
  for (const [cid, expected] of [
    ['Y_Pirates_Ship1', 'pirates'],
    ['Y_Viking_Ship1', 'vikings'],
    ['Y_Japan_Ship1', 'japanese'],
    ['Y_Egypt_Ship1', 'egyptians'],
    ['Y_Aztec_Ship1', 'aztecs'],
    ['Y_Mughal_Ship1', 'mughals'],
    ['Y_Polynesian_Ship1', 'polynesia'],
  ]) {
    assert.equal(settlementIdFromCityMap({ entities: [{ cid, type: 'outpost_ship' }] }), expected);
  }
  for (const cityMap of [
    null,
    {},
    { entities: {} },
    { entities: [null] },
    { entities: [{ cid: 'Y_Pirates_Ship1', type: 'residential' }] },
    { entities: [{ cid: 'Y_Unrecognized_Ship1', type: 'outpost_ship' }] },
  ]) {
    assert.equal(settlementIdFromCityMap(cityMap), null);
  }
});

test('retains the calibrated scroll distance and tap point at the original canvas size', () => {
  assert.deepEqual(scaleSettlementGesture(PROBE), {
    x: DEFAULT_SHIP_CALIB.canvasX,
    y: DEFAULT_SHIP_CALIB.canvasY,
    dx: DEFAULT_SHIP_CALIB.scrollDx,
    dy: DEFAULT_SHIP_CALIB.scrollDy,
    viewportW: PROBE.viewportW,
    viewportH: PROBE.viewportH,
  });
});

test('scales to the canvas bounds and adds offsets without using the canvas as the native viewport', async (t) => {
  const probe = {
    ...PROBE,
    viewportW: 800,
    viewportH: 600,
    rect: { left: 100, top: 20, width: 512, height: 382.5 },
  };
  assert.deepEqual(scaleSettlementGesture(probe), {
    x: 448, y: 134, dx: -354, dy: 61.5, viewportW: 800, viewportH: 600,
  });
  const harness = createHarness(t);
  harness.sendShip();
  harness.sendProbe(probe);
  await harness.settleSwipe();
  assert.deepEqual(harness.calls.swipes, [[TAG, -354 / 800, 61.5 / 600]]);
  const [x, y, attemptId] = harness.calls.arms[0];
  assert.equal(x, 448);
  assert.equal(y, 134);
  harness.send({ kind: 'autoEnter', step: 'watch_armed', attemptId });
  await flushPromises();
  assert.deepEqual(harness.calls.taps, [[TAG, 448 / 800, 134 / 600, attemptId]]);
});

test('rejects unmeasurable, nonfinite and offscreen gesture geometry', () => {
  for (const probe of [
    null,
    {},
    { ...PROBE, canvasTag: 'div' },
    { ...PROBE, viewportW: 0 },
    { ...PROBE, viewportH: Infinity },
    { ...PROBE, rect: { ...PROBE.rect, width: -1 } },
    { ...PROBE, rect: { ...PROBE.rect, height: NaN } },
    { ...PROBE, rect: { ...PROBE.rect, left: 1000 } },
    { ...PROBE, rect: { ...PROBE.rect, top: -300 } },
  ]) {
    assert.equal(scaleSettlementGesture(probe), null);
  }
  assert.equal(scaleSettlementGesture(PROBE, { ...DEFAULT_SHIP_CALIB, canvasW: 0 }), null);
});

test('starts the swipe from the first settlement packet while the page is still loading', async (t) => {
  const harness = createHarness(t);
  harness.sendShip();
  assert.equal(harness.calls.probes.length, 1);
  harness.sendProbe({ ...PROBE, readyState: 'loading', stable: false });
  await flushPromises();
  assert.equal(harness.calls.swipes.length, 1, 'no startup delay or completed document is required');
  assert.equal(harness.calls.arms.length, 0);
  t.mock.timers.tick(599);
  await flushPromises();
  assert.equal(harness.calls.arms.length, 0, 'the native swipe still needs its settling interval');
  t.mock.timers.tick(1);
  await flushPromises();
  assert.equal(harness.calls.arms.length, 1);
  assert.equal(harness.calls.taps.length, 0, 'a tap must wait for the page to arm its request watcher');
});

test('ignores duplicate ship packets and probes with a different nonce', async (t) => {
  const harness = createHarness(t);
  harness.sendShip();
  harness.sendShip();
  assert.equal(harness.calls.probes.length, 1);
  harness.send({ kind: 'interactionProbe', nonce: 'stale-probe', probe: PROBE });
  await flushPromises();
  assert.equal(harness.calls.swipes.length, 0);
  harness.sendProbe();
  await harness.settleSwipe();
  harness.sendShip();
  assert.equal(harness.calls.swipes.length, 1);
  assert.equal(harness.calls.probes.length, 1);
  const [, , attemptId] = harness.calls.arms[0];
  harness.send({ kind: 'autoEnter', step: 'watch_armed', attemptId: 'stale-tap' });
  await flushPromises();
  assert.equal(harness.calls.taps.length, 0);
  harness.send({ kind: 'autoEnter', step: 'watch_armed', attemptId });
  await flushPromises();
  assert.equal(harness.calls.taps.length, 1);
});

test('rejects malformed messages and messages from another world, generation or document', async (t) => {
  const harness = createHarness(t);
  const initialStateCount = harness.calls.states.length;
  const packet = { kind: 'data', found: { cityMap: CITY_MAP } };
  for (const message of [null, false, 1, {}, { kind: 'data' }]) harness.session.handleMessage(message);
  for (const overrides of [
    { __foeSync: false },
    { generation: GENERATION - 1 },
    { generation: null },
    { pageHost: 'en2.forgeofempires.com' },
    { pageHost: 'en1.forgeofempires.com.attacker.example' },
    { pageHost: '' },
    { documentId: 'old-document' },
    { documentId: null },
  ]) harness.send({ ...packet, ...overrides });
  harness.send({ kind: 'data', found: { cityMap: { entities: {} } } });
  await flushPromises();
  assert.equal(harness.calls.probes.length, 0);
  assert.equal(harness.calls.states.length, initialStateCount);
  harness.sendShip();
  assert.equal(harness.calls.probes.length, 1);
});

test('cancels all subsequent input when an in-flight native swipe resolves after unmount', async (t) => {
  let resolveSwipe;
  const swipe = new Promise((resolve) => { resolveSwipe = resolve; });
  const harness = createHarness(t, { swipe: () => swipe });
  harness.sendShip();
  harness.sendProbe();
  await flushPromises();
  assert.equal(harness.calls.swipes.length, 1);
  harness.session.cancel();
  const stateCount = harness.calls.states.length;
  resolveSwipe(true);
  await flushPromises();
  t.mock.timers.tick(100000);
  await flushPromises();
  harness.sendShip();
  assert.equal(harness.calls.arms.length, 0);
  assert.equal(harness.calls.taps.length, 0);
  assert.equal(harness.calls.states.length, stateCount);
});

test('a newer document invalidates the previous probe and waits for its own settlement signal', async (t) => {
  const harness = createHarness(t);
  harness.sendShip();
  const [oldNonce] = harness.calls.probes[0];
  harness.send({ kind: 'ready', documentId: 'document-2', documentStartedAt: 2000 });
  harness.send({ kind: 'interactionProbe', nonce: oldNonce, probe: PROBE });
  harness.sendShip();
  harness.send({ kind: 'ready', documentStartedAt: 1000 });
  await flushPromises();
  assert.equal(harness.calls.swipes.length, 0);
  assert.equal(harness.calls.probes.length, 1);
  assert.deepEqual(harness.calls.states.at(-1), { phase: 'loading', settlementId: null });
  harness.send({ kind: 'data', documentId: 'document-2', found: { cityMap: CITY_MAP } });
  const [newNonce] = harness.calls.probes[1];
  assert.notEqual(oldNonce, newNonce);
  harness.send({ kind: 'interactionProbe', documentId: 'document-2', nonce: oldNonce, probe: PROBE });
  await flushPromises();
  assert.equal(harness.calls.swipes.length, 0);
  harness.send({ kind: 'interactionProbe', documentId: 'document-2', nonce: newNonce, probe: PROBE });
  await flushPromises();
  assert.equal(harness.calls.swipes.length, 1);
});

test('a redirect to the login portal invalidates a pending gesture from the game document', async (t) => {
  let resolveSwipe;
  const swipe = new Promise((resolve) => { resolveSwipe = resolve; });
  const harness = createHarness(t, { swipe: () => swipe });
  harness.sendShip();
  harness.sendProbe();
  await flushPromises();
  harness.send({
    kind: 'ready', documentId: 'portal-document', documentStartedAt: 2000,
    pageHost: 'en.forgeofempires.com',
  });
  resolveSwipe(true);
  await flushPromises();
  t.mock.timers.tick(600);
  await flushPromises();
  harness.sendShip();
  assert.equal(harness.calls.arms.length, 0);
  assert.equal(harness.calls.taps.length, 0);
  assert.equal(harness.calls.states.at(-1).settlementId, null);
});

test('a viewport change during a swipe aborts subsequent taps and allows an explicit retry', async (t) => {
  let resolveSwipe;
  const swipe = new Promise((resolve) => { resolveSwipe = resolve; });
  const harness = createHarness(t, { swipe: () => swipe });
  harness.sendShip();
  harness.sendProbe();
  await flushPromises();
  harness.session.fail('layout');
  resolveSwipe(true);
  await flushPromises();
  t.mock.timers.tick(100000);
  await flushPromises();
  assert.deepEqual(harness.calls.states.at(-1), {
    phase: 'error', settlementId: 'pirates', error: 'layout',
  });
  assert.equal(harness.calls.arms.length, 0);
  assert.equal(harness.calls.taps.length, 0);
});

test('accepts only a cultural map arriving after both the tap and its matching request', async (t) => {
  const harness = createHarness(t);
  const sendMap = (map = SETTLEMENT_MAP) => harness.send({ kind: 'data', found: { settlementMap: map } });
  sendMap();
  assert.equal(harness.calls.states.some((state) => state.phase === 'ready'), false);
  const attemptId = await harness.armAndTap();
  sendMap();
  harness.send({ kind: 'autoEnter', step: 'request_sent', attemptId: 'different-attempt' });
  sendMap();
  assert.equal(harness.calls.states.some((state) => state.phase === 'ready'), false);
  harness.send({ kind: 'autoEnter', step: 'request_sent', attemptId });
  sendMap({ gridId: 'main', entities: [] });
  sendMap({ gridId: 'quantum_incursions', entities: [] });
  sendMap({ gridId: 'cultural_outpost', entities: null });
  assert.equal(harness.calls.states.some((state) => state.phase === 'ready'), false);
  sendMap();
  assert.deepEqual(harness.calls.states.at(-1), { phase: 'ready', settlementId: 'pirates' });
  const stateCount = harness.calls.states.length;
  t.mock.timers.tick(100000);
  await flushPromises();
  sendMap();
  assert.equal(harness.calls.states.length, stateCount);
  assert.equal(harness.calls.taps.length, 1);
});

test('an early request acknowledgement before the tap cannot confirm a settlement map', async (t) => {
  const harness = createHarness(t);
  harness.sendShip();
  harness.sendProbe();
  await harness.settleSwipe();
  const [, , attemptId] = harness.calls.arms[0];
  harness.send({ kind: 'autoEnter', step: 'request_sent', attemptId });
  harness.send({ kind: 'autoEnter', step: 'watch_armed', attemptId });
  await flushPromises();
  harness.send({ kind: 'data', found: { settlementMap: SETTLEMENT_MAP } });
  assert.equal(harness.calls.states.some((state) => state.phase === 'ready'), false);
  harness.send({ kind: 'autoEnter', step: 'request_sent', attemptId });
  harness.send({ kind: 'data', found: { settlementMap: SETTLEMENT_MAP } });
  assert.equal(harness.calls.states.at(-1).phase, 'ready');
});

test('missing native support and navigation to the wrong grid produce recoverable errors', async (t) => {
  await t.test('native gesture implementation is unavailable', async (t) => {
    const harness = createHarness(t, { session: { tap: undefined } });
    harness.sendShip();
    harness.sendProbe();
    await flushPromises();
    assert.deepEqual(harness.calls.states.at(-1), {
      phase: 'error', settlementId: 'pirates', error: 'unsupported',
    });
    assert.equal(harness.calls.swipes.length, 0);
  });
  await t.test('the tap opens another game map', async (t) => {
    const harness = createHarness(t);
    const attemptId = await harness.armAndTap();
    harness.send({ kind: 'autoEnter', step: 'wrong_grid', gridId: 'main', attemptId });
    assert.equal(harness.calls.states.at(-1).phase, 'error');
    const stateCount = harness.calls.states.length;
    t.mock.timers.tick(100000);
    await flushPromises();
    assert.equal(harness.calls.taps.length, 1);
    assert.equal(harness.calls.states.length, stateCount);
  });
});

test('the run times out once and ignores late game packets', async (t) => {
  const harness = createHarness(t, { session: { timeoutMs: 1000 } });
  t.mock.timers.tick(1000);
  assert.deepEqual(harness.calls.states.at(-1), {
    phase: 'error', settlementId: null, error: 'timeout',
  });
  const stateCount = harness.calls.states.length;
  harness.sendShip();
  harness.session.fail();
  await flushPromises();
  assert.equal(harness.calls.states.length, stateCount);
  assert.equal(harness.calls.probes.length, 0);
});

test('reports no settlement for an empty city map and keeps waiting for an unknown ship type', async (t) => {
  await t.test('no ship exists in the city', (t) => {
    const harness = createHarness(t);
    harness.send({ kind: 'data', found: { cityMap: { entities: [] } } });
    assert.deepEqual(harness.calls.states.at(-1), { phase: 'empty', settlementId: null });
    assert.equal(harness.calls.probes.length, 0);
  });
  await t.test('the game introduces an unfamiliar settlement', (t) => {
    const harness = createHarness(t);
    harness.send({ kind: 'data', found: { cityMap: {
      entities: [{ type: 'outpost_ship', cid: 'Y_Unknown_Ship1' }],
    } } });
    assert.equal(harness.calls.states.at(-1).phase, 'loading');
    assert.equal(harness.calls.probes.length, 0);
  });
});

test('the non-native fallback also requires a post-tap game request and cultural map', async (t) => {
  const harness = createHarness(t, { session: { nativeGestures: false } });
  harness.sendShip();
  harness.sendProbe();
  await flushPromises();
  assert.deepEqual(harness.calls.fallbacks, [[696, 228, -708, 123]]);
  assert.equal(harness.calls.swipes.length, 0);
  assert.equal(harness.calls.taps.length, 0);
  harness.send({ kind: 'data', found: { settlementMap: SETTLEMENT_MAP } });
  assert.equal(harness.calls.states.at(-1).phase, 'opening');
  harness.send({ kind: 'autoEnter', step: 'request_sent', attemptId: null });
  harness.send({ kind: 'data', found: { settlementMap: SETTLEMENT_MAP } });
  assert.deepEqual(harness.calls.states.at(-1), { phase: 'ready', settlementId: 'pirates' });
});
