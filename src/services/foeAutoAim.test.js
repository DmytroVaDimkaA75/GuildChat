const test = require('node:test');
const assert = require('node:assert/strict');

const { createAutoAimPlan, sameAutoAimGeometry } = require('./foeAutoAim');

// These tests cover the CSS-to-native coordinate contract. They do not model
// FoE's camera or prove that its scene scales with the canvas on another device.
const probeFor = (width = 1024, height = 908) => ({
  rect: { left: 0, top: 0, width, height },
  viewportW: width,
  viewportH: height,
});

const closeTo = (actual, expected) => {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
};

test('preserves the measured 1024 CSS-pixel displacement and target', () => {
  const plan = createAutoAimPlan(probeFor());

  assert.equal(plan.dragX, -673);
  assert.equal(plan.dragY, 2270);
  closeTo(plan.tap.x, 443.392);
  closeTo(plan.tap.y, 209.748);
  closeTo(plan.swipe.xRatio, -0.6572265625);
  closeTo(plan.swipe.yRatio, 2.5);
  closeTo(plan.tap.xRatio, 0.433);
  closeTo(plan.tap.yRatio, 0.231);
});

test('scales the CSS displacement at smaller and larger canvas widths', () => {
  const cases = [
    { width: 768, height: 600, dragX: -504.75, x: 332.544 },
    { width: 1280, height: 1100, dragX: -841.25, x: 554.24 },
  ];

  for (const { width, height, dragX, x } of cases) {
    const plan = createAutoAimPlan(probeFor(width, height));
    closeTo(plan.dragX, dragX);
    closeTo(plan.tap.x, x);
    closeTo(plan.tap.y, height * 0.231);
    closeTo(plan.swipe.xRatio, -0.6572265625);
    closeTo(plan.swipe.yRatio, 2.5);
    closeTo(plan.tap.xRatio, 0.433);
  }
});

test('uses canvas-relative positions but viewport-relative native ratios', () => {
  const probe = {
    rect: { left: 128, top: 100, width: 768, height: 600 },
    viewportW: 1024,
    viewportH: 1000,
  };
  const plan = createAutoAimPlan(probe);

  closeTo(plan.tap.x, 460.544);
  closeTo(plan.tap.y, 238.6);
  closeTo(plan.tap.xRatio, 0.44975);
  closeTo(plan.tap.yRatio, 0.2386);
  closeTo(plan.swipe.xRatio, -0.492919921875);
  closeTo(plan.swipe.yRatio, 1.5);
});

test('ignores DPR and canvas backing-store resolution for CSS input mapping', () => {
  const baseline = createAutoAimPlan(probeFor());

  for (const dpr of [1, 2, 2.625, 3.5]) {
    const probe = {
      ...probeFor(),
      dpr,
      canvasBufferW: 1024 * dpr,
      canvasBufferH: 908 * dpr,
    };
    assert.deepEqual(createAutoAimPlan(probe), baseline);
    assert.equal(sameAutoAimGeometry(probeFor(), probe), true);
  }
});

test('native-size multiplication round-trips to the same CSS coordinates', () => {
  const probe = probeFor();
  const plan = createAutoAimPlan(probe);

  for (const nativeWidth of [720, 1080, 1440]) {
    const nativePixelsPerCssPixel = nativeWidth / probe.viewportW;
    const nativeTapX = plan.tap.xRatio * nativeWidth;
    const nativeDragX = plan.swipe.xRatio * nativeWidth;
    closeTo(nativeTapX / nativePixelsPerCssPixel, plan.tap.x);
    closeTo(nativeDragX / nativePixelsPerCssPixel, -673);
  }
});

test('maps page zoom and visual viewport offsets without shifting the CSS watcher target', () => {
  const probe = {
    ...probeFor(),
    visualViewport: { width: 512, height: 454, offsetLeft: 200, offsetTop: 100, scale: 2 },
  };
  const plan = createAutoAimPlan(probe);

  closeTo(plan.tap.x, 443.392);
  closeTo(plan.tap.y, 209.748);
  closeTo(plan.tap.xRatio, 0.475375);
  closeTo(plan.tap.yRatio, 109.748 / 454);
  closeTo(plan.swipe.xRatio, -1.314453125);
  closeTo(plan.swipe.yRatio, 5);
  closeTo(plan.tap.xRatio * 512 + 200, plan.tap.x);
  closeTo(plan.tap.yRatio * 454 + 100, plan.tap.y);
});

test('rejects missing, non-finite and non-positive geometry', () => {
  for (const probe of [undefined, null, {}, { viewportW: 1024, viewportH: 908 }]) {
    assert.equal(createAutoAimPlan(probe), null);
  }
  for (const value of [undefined, null, '', 'bad', NaN, Infinity, -Infinity, 0, -1]) {
    for (const key of ['width', 'height']) {
      const probe = probeFor();
      probe.rect[key] = value;
      assert.equal(createAutoAimPlan(probe), null, `rect.${key}=${String(value)}`);
    }
    for (const key of ['viewportW', 'viewportH']) {
      const probe = probeFor();
      probe[key] = value;
      assert.equal(createAutoAimPlan(probe), null, `${key}=${String(value)}`);
    }
  }
  for (const key of ['left', 'top']) {
    const probe = probeFor();
    probe.rect[key] = NaN;
    assert.equal(createAutoAimPlan(probe), null);
  }
});

test('rejects invalid live visual viewport dimensions instead of trusting the layout viewport', () => {
  for (const value of [0, -1, NaN, Infinity]) {
    const probe = {
      ...probeFor(),
      visualViewport: { width: value, height: 908, offsetLeft: 0, offsetTop: 0 },
    };
    assert.equal(createAutoAimPlan(probe), null);
  }
});

test('rejects targets outside the visible viewport instead of clamping taps to its edge', () => {
  for (const offsets of [{ left: -500, top: 0 }, { left: 1024, top: 0 }, { left: 0, top: -500 }]) {
    const probe = probeFor();
    Object.assign(probe.rect, offsets);
    assert.equal(createAutoAimPlan(probe), null);
  }

  const zoomedPastTarget = {
    ...probeFor(),
    visualViewport: { width: 512, height: 454, offsetLeft: 500, offsetTop: 0 },
  };
  assert.equal(createAutoAimPlan(zoomedPastTarget), null);
});

test('rejects a visible target when the required swipe exceeds the native bridge limit', () => {
  const probe = {
    ...probeFor(),
    visualViewport: { width: 50, height: 50, offsetLeft: 425, offsetTop: 200 },
  };
  assert.equal(createAutoAimPlan(probe), null);
});

test('detects a changed canvas or viewport before reusing gesture coordinates', () => {
  const original = probeFor();
  assert.equal(sameAutoAimGeometry(original, probeFor()), true);
  assert.equal(sameAutoAimGeometry(original, null), false);
  assert.equal(sameAutoAimGeometry(null, null), false);

  for (const key of ['left', 'top', 'width', 'height']) {
    const resized = probeFor();
    resized.rect[key] += 1;
    assert.equal(sameAutoAimGeometry(original, resized), false, key);
  }
  for (const key of ['viewportW', 'viewportH']) {
    const resized = probeFor();
    resized[key] += 1;
    assert.equal(sameAutoAimGeometry(original, resized), false, key);
  }
  for (const key of ['width', 'height', 'offsetLeft', 'offsetTop']) {
    const resized = {
      ...probeFor(),
      visualViewport: { width: 1024, height: 908, offsetLeft: 0, offsetTop: 0 },
    };
    resized.visualViewport[key] += 1;
    assert.equal(sameAutoAimGeometry(original, resized), false, `visualViewport.${key}`);
  }
});

test('tolerates subpixel layout noise but detects an actual resize', () => {
  const original = probeFor();
  const near = probeFor();
  near.rect.left = 0.5;
  near.rect.width += 0.25;
  assert.equal(sameAutoAimGeometry(original, near), true);
  near.rect.left = 0.51;
  assert.equal(sameAutoAimGeometry(original, near), false);
});
