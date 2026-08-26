import type { ChannelLUTs } from './channelLUT'

/** One control point on a tone curve, in input(x) -> output(y) byte space
 *  — both axes are 0..255, the same units the pixel data itself uses, so
 *  the curve editor's geometry and the tables built here share one
 *  coordinate space with no scaling in between. */
export interface CurvePoint {
  x: number
  y: number
}

/** Which curve a set of control points belongs to: the composite curve
 *  (applied to all three channels) or one single channel. */
export type CurveChannel = 'rgb' | 'r' | 'g' | 'b'

export const CURVE_CHANNELS: readonly CurveChannel[] = ['rgb', 'r', 'g', 'b']

export type PhotoCurves = Record<CurveChannel, CurvePoint[]>

/**
 * Input levels: everything at or below `black` clips to 0, everything at or
 * above `white` clips to 255, and `gamma` reshapes the midtones in between
 * (> 1 brightens, < 1 darkens).
 *
 * Output levels — remapping the *result* into a narrower range — are
 * deliberately absent: dragging a curve's endpoints down/up is exactly that
 * control, and Curves ships in this same phase.
 */
export interface PhotoLevels {
  black: number
  white: number
  gamma: number
}

/** Per-field limits for `levels`, shared by the store's clamping and the
 *  panel's slider bounds so the two can't drift apart. `black`/`white` stop
 *  one step short of the full range because they may never cross. */
export const LEVELS_LIMITS: Record<keyof PhotoLevels, { min: number; max: number; step: number }> = {
  black: { min: 0, max: 254, step: 1 },
  white: { min: 1, max: 255, step: 1 },
  gamma: { min: 0.1, max: 3, step: 0.01 },
}

export const DEFAULT_LEVELS: PhotoLevels = { black: 0, white: 255, gamma: 1 }

/** The straight-through curve — input maps to itself. Shared by all four
 *  channels in DEFAULT_CURVES: curve points are only ever replaced
 *  wholesale (setCurve), never mutated in place, so one array can back
 *  every neutral channel. */
export const IDENTITY_CURVE: CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 255, y: 255 },
]

export const DEFAULT_CURVES: PhotoCurves = {
  rgb: IDENTITY_CURVE,
  r: IDENTITY_CURVE,
  g: IDENTITY_CURVE,
  b: IDENTITY_CURVE,
}

/** How many control points one curve may hold. Enough for any realistic
 *  tone curve, and low enough that the editor stays draggable at the
 *  sidebar's width — the point radius alone eats most of the space past
 *  this. */
export const MAX_CURVE_POINTS = 16

function clampByte(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(255, Math.round(v))) : 0
}

/**
 * Puts a control-point list into the shape every consumer here assumes:
 * integer bytes on both axes, ascending x, at most one point per x (the
 * later one wins, so a point dragged onto a neighbour replaces it rather
 * than creating a zero-width segment that would divide by zero below), and
 * no more than MAX_CURVE_POINTS of them.
 *
 * The store runs this on the way in (setCurve), so state is always already
 * normalized; buildCurveLUT runs it again because it's also called directly
 * with editor-local, mid-drag point lists.
 */
export function normalizeCurvePoints(points: CurvePoint[]): CurvePoint[] {
  const sorted = points.map((p) => ({ x: clampByte(p.x), y: clampByte(p.y) })).sort((a, b) => a.x - b.x)
  const deduped: CurvePoint[] = []
  for (const point of sorted) {
    if (deduped.length > 0 && deduped[deduped.length - 1].x === point.x) deduped[deduped.length - 1] = point
    else deduped.push(point)
  }
  if (deduped.length === 0) return IDENTITY_CURVE
  return deduped.length > MAX_CURVE_POINTS ? deduped.slice(0, MAX_CURVE_POINTS) : deduped
}

/** True for the straight-through curve — the cheap test that lets callers
 *  skip building (and applying) a table that maps every byte to itself. */
export function isIdentityCurve(points: CurvePoint[]): boolean {
  return (
    points.length === 2 &&
    points[0].x === 0 &&
    points[0].y === 0 &&
    points[1].x === 255 &&
    points[1].y === 255
  )
}

/** True when the levels controls would move a pixel. */
export function needsLevels(levels: PhotoLevels): boolean {
  return (
    levels.black !== DEFAULT_LEVELS.black ||
    levels.white !== DEFAULT_LEVELS.white ||
    levels.gamma !== DEFAULT_LEVELS.gamma
  )
}

/** True when levels or any of the four curves would move a pixel. */
export function needsLevelsCurves({ levels, curves }: { levels: PhotoLevels; curves: PhotoCurves }): boolean {
  return needsLevels(levels) || CURVE_CHANNELS.some((channel) => !isIdentityCurve(curves[channel]))
}

/**
 * Input levels as a 256-entry table: `black` and everything below it maps to
 * 0, `white` and everything above to 255, the range in between stretches to
 * fill 0..255, and `gamma` bends the midtones inside that stretch (the
 * 1/gamma exponent is the Photoshop convention — a midtone slider above 1
 * brightens).
 */
export function buildLevelsLUT({ black, white, gamma }: PhotoLevels): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256)
  // The store keeps black < white, but this is also called straight from
  // tests and stored edit metadata, so the span guard stays.
  const span = Math.max(1, white - black)
  const exponent = 1 / gamma
  for (let v = 0; v < 256; v++) {
    const t = Math.max(0, Math.min(1, (v - black) / span))
    lut[v] = 255 * Math.pow(t, exponent)
  }
  return lut
}

/**
 * A curve's control points as a 256-entry table, interpolated with a
 * monotone cubic (Fritsch–Carlson) spline: smooth through every point like
 * a plain cubic, but with tangents limited so the curve can't overshoot
 * between them. That limiter is the whole reason for the extra maths — a
 * natural spline through a steep contrast S-curve dips *below* its own
 * control points near the ends, which shows up as inverted bands in the
 * shadows and highlights.
 *
 * Outside the first and last point the table holds flat, so a curve whose
 * endpoints have been dragged inwards clips rather than extrapolating off
 * the top or bottom of the range.
 */
export function buildCurveLUT(points: CurvePoint[]): Uint8ClampedArray {
  const pts = normalizeCurvePoints(points)
  const lut = new Uint8ClampedArray(256)
  const n = pts.length
  if (n === 1) {
    lut.fill(pts[0].y)
    return lut
  }

  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  // Secant slope of each segment, then a tangent per point: one-sided at
  // the two ends, the average of the neighbouring secants in between.
  const secants: number[] = []
  for (let i = 0; i < n - 1; i++) secants.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]))
  const tangents: number[] = new Array(n)
  tangents[0] = secants[0]
  tangents[n - 1] = secants[n - 2]
  for (let i = 1; i < n - 1; i++) tangents[i] = (secants[i - 1] + secants[i]) / 2

  for (let i = 0; i < n - 1; i++) {
    if (secants[i] === 0) {
      // A flat segment: both its tangents must be flat too, or the curve
      // bulges away from two points that share a y.
      tangents[i] = 0
      tangents[i + 1] = 0
      continue
    }
    if (tangents[i] / secants[i] < 0) tangents[i] = 0
    if (tangents[i + 1] / secants[i] < 0) tangents[i + 1] = 0
    const alpha = tangents[i] / secants[i]
    const beta = tangents[i + 1] / secants[i]
    const magnitude = Math.hypot(alpha, beta)
    if (magnitude > 3) {
      const scale = 3 / magnitude
      tangents[i] = scale * alpha * secants[i]
      tangents[i + 1] = scale * beta * secants[i]
    }
  }

  let segment = 0
  for (let v = 0; v < 256; v++) {
    if (v <= xs[0]) {
      lut[v] = ys[0]
      continue
    }
    if (v >= xs[n - 1]) {
      lut[v] = ys[n - 1]
      continue
    }
    while (segment < n - 2 && v > xs[segment + 1]) segment++
    const width = xs[segment + 1] - xs[segment]
    const t = (v - xs[segment]) / width
    const t2 = t * t
    const t3 = t2 * t
    lut[v] =
      (2 * t3 - 3 * t2 + 1) * ys[segment] +
      (t3 - 2 * t2 + t) * width * tangents[segment] +
      (-2 * t3 + 3 * t2) * ys[segment + 1] +
      (t3 - t2) * width * tangents[segment + 1]
  }
  return lut
}

/**
 * Levels and all four curves folded into one R/G/B table trio, applied in
 * the order a photo editor's own Levels-then-Curves stack would: levels
 * first (it sets the black/white points the curve is then drawn against),
 * then the composite RGB curve on every channel, then that channel's own
 * curve. Each stage is a plain byte -> byte table, so composing them is a
 * lookup rather than another pass over the pixels.
 *
 * channelLUT.ts folds the result into its own table trio, which is what
 * actually touches the image — nothing here reads or writes pixels.
 */
export function buildLevelsCurveLUTs({ levels, curves }: { levels: PhotoLevels; curves: PhotoCurves }): ChannelLUTs {
  const levelsLUT = needsLevels(levels) ? buildLevelsLUT(levels) : null
  const composite = isIdentityCurve(curves.rgb) ? null : buildCurveLUT(curves.rgb)

  const channel = (points: CurvePoint[]): Uint8ClampedArray => {
    const own = isIdentityCurve(points) ? null : buildCurveLUT(points)
    const lut = new Uint8ClampedArray(256)
    for (let v = 0; v < 256; v++) {
      let out = levelsLUT ? levelsLUT[v] : v
      if (composite) out = composite[out]
      if (own) out = own[out]
      lut[v] = out
    }
    return lut
  }

  return { r: channel(curves.r), g: channel(curves.g), b: channel(curves.b) }
}
