// The reference was measured in CSS pixels, not Android display pixels.
// DESKTOP_UA does not guarantee a 1024-wide viewport. See docs/foe-autoaim.md.
const SHIP_REFERENCE_CANVAS_WIDTH = 1024;
const SHIP_DRAG_X_RATIO = -673 / SHIP_REFERENCE_CANVAS_WIDTH;
const SHIP_TARGET_X_RATIO = 0.433;
const SHIP_TARGET_Y_RATIO = 0.231;
const SHIP_DRAG_Y_RATIO = 2.5;

const numeric = (value) => value == null || value === '' ? NaN : Number(value);

function getAutoAimGeometry(probe) {
  const rect = probe?.rect;
  const visual = probe?.visualViewport;
  const geometry = {
    left: numeric(rect?.left),
    top: numeric(rect?.top),
    width: numeric(rect?.width),
    height: numeric(rect?.height),
    viewportWidth: numeric(visual?.width ?? probe?.viewportW),
    viewportHeight: numeric(visual?.height ?? probe?.viewportH),
    viewportLeft: numeric(visual?.offsetLeft ?? 0),
    viewportTop: numeric(visual?.offsetTop ?? 0),
  };
  if (!Object.values(geometry).every(Number.isFinite)) return null;
  if ([geometry.width, geometry.height, geometry.viewportWidth, geometry.viewportHeight]
    .some((value) => value <= 0)) return null;
  return geometry;
}

function createAutoAimPlan(probe) {
  const geometry = getAutoAimGeometry(probe);
  if (!geometry) return null;
  const { left, top, width, height, viewportWidth, viewportHeight, viewportLeft, viewportTop } = geometry;
  const dragX = SHIP_DRAG_X_RATIO * width;
  const dragY = SHIP_DRAG_Y_RATIO * height;
  const x = left + SHIP_TARGET_X_RATIO * width;
  const y = top + SHIP_TARGET_Y_RATIO * height;
  // Native swipe/tap multiply ratios by the entire WebView, not the canvas.
  // visualViewport accounts for page zoom; DPR/backing-store size are NOT divisors.
  const swipe = { xRatio: dragX / viewportWidth, yRatio: dragY / viewportHeight };
  const tap = { x, y, xRatio: (x - viewportLeft) / viewportWidth, yRatio: (y - viewportTop) / viewportHeight };
  if ([tap.xRatio, tap.yRatio].some((value) => value < 0 || value >= 1)) return null;
  if ([swipe.xRatio, swipe.yRatio].some((value) => Math.abs(value) > 16)) return null;
  return { geometry, dragX, dragY, swipe, tap };
}

function sameAutoAimGeometry(first, second) {
  const a = getAutoAimGeometry(first);
  const b = getAutoAimGeometry(second);
  return !!a && !!b && Object.keys(a).every((key) => Math.abs(a[key] - b[key]) <= 0.5);
}

module.exports = {
  SHIP_REFERENCE_CANVAS_WIDTH,
  SHIP_DRAG_X_RATIO,
  createAutoAimPlan,
  sameAutoAimGeometry,
};
