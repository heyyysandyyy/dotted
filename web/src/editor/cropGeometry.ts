/** Pure 2D rotation helpers for the crop overlay (UX-021). No fabric import —
 *  this only needs to match fabric's own rotation convention (degrees,
 *  clockwise-positive in scene/screen's y-down space), not fabric itself, so
 *  it lives outside components/ purely for testability, same as
 *  layerTree.ts/pageGuides.ts.
 *
 * Fabric's own `calcRotateMatrix` builds `[cos, sin, -sin, cos]` from an
 * angle in degrees — i.e. `x' = cos*x - sin*y, y' = sin*x + cos*y` — the
 * standard rotation matrix applied directly to scene-space (y-down)
 * coordinates. Matching that formula exactly here means these helpers rotate
 * in the same visual direction fabric does, with no sign flip needed. */

export interface Vec2 {
  x: number
  y: number
}

/** Rotate a vector (a delta — no fixed point) by `angleDeg`. */
export function rotateVector(v: Vec2, angleDeg: number): Vec2 {
  const rad = (angleDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos }
}

/** Rotate `point` around `pivot` by `angleDeg`. */
export function rotateAround(point: Vec2, pivot: Vec2, angleDeg: number): Vec2 {
  const r = rotateVector({ x: point.x - pivot.x, y: point.y - pivot.y }, angleDeg)
  return { x: pivot.x + r.x, y: pivot.y + r.y }
}

/** The pieces of `fabric.util.qrDecompose(obj.calcTransformMatrix())` this
 *  file needs — spelled out here instead of importing fabric's own type, so
 *  this stays a plain-math file with no fabric dependency at all. */
export interface SceneTransform {
  translateX: number
  translateY: number
  angle: number
}

/** Convert a point in the crop's local frame (unrotated, relative to the
 *  image's own centre — see CropBox in storeTypes.ts) into an absolute scene
 *  position, given the image's scene transform. */
export function localToScene(localX: number, localY: number, t: SceneTransform): Vec2 {
  const r = rotateVector({ x: localX, y: localY }, t.angle)
  return { x: t.translateX + r.x, y: t.translateY + r.y }
}

/** Inverse direction: a delta already in scene units (e.g. a pointer drag
 *  divided by zoom) rotated into the same local frame localToScene uses —
 *  for interpreting drag deltas while the image is rotated. */
export function sceneDeltaToLocal(delta: Vec2, angleDeg: number): Vec2 {
  return rotateVector(delta, -angleDeg)
}
