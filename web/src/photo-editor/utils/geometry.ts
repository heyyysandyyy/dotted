/**
 * PHOTO-009's geometry tools — crop, straighten, arbitrary rotate, flip,
 * resize/resample and perspective (keystone) correction — as one plan.
 *
 * This is the Photo Editor's own raster pipeline, deliberately separate from
 * Canvas's crop tools (UX-009, UX-021): those move a crop *window* over a
 * fabric object and never touch its pixels, where these bake a new image.
 *
 * Every tool is a step that maps the frame before it to a new frame. The
 * steps run in a fixed order, chosen so each one acts on what's on screen
 * after the ones before it:
 *
 *   quarter turns → flip → perspective → straighten → rotate → crop → resize
 *
 * So flipping after a 90° turn mirrors the image you're looking at, the
 * straighten slider always turns the displayed image clockwise however it's
 * been flipped, and keystone "vertical" always means the displayed verticals.
 *
 * Each step contributes an *inverse* map — a point in its output frame to the
 * matching point in its input — and those compose into one 3×3 matrix taking
 * a final output pixel straight back to a source pixel. Everything reads
 * that one matrix: the renderer (warp.ts), the port-back placement on Canvas
 * (geometryPlacement.ts) and the crop overlay's frame.
 */

/** A normalized rectangle — fractions of the frame it sits in, so a crop
 *  means the same thing at the capped preview size and the full-size bake. */
export interface NormRect {
  x: number
  y: number
  w: number
  h: number
}

export type QuarterTurns = 0 | 1 | 2 | 3
export type Resample = 'smooth' | 'nearest'

export interface PhotoGeometry {
  /** Clockwise 90° turns. */
  quarterTurns: QuarterTurns
  flipH: boolean
  flipV: boolean
  /** Keystone correction, -100..100. Positive vertical widens the top edge
   *  (fixing verticals that converge upward, from shooting a building from
   *  below); positive horizontal widens the left edge. */
  perspectiveV: number
  perspectiveH: number
  /** -45..45°. Rotates, then crops to the largest rectangle of the same
   *  proportions that fits inside, so no empty corners appear. */
  straighten: number
  /** -180..180°. Rotates freely; the frame grows to hold the whole turned
   *  image and the corners it uncovers are transparent. */
  angle: number
  /** Crop, normalized to the frame after rotation. */
  crop: NormRect
  /** Uniform output scale (1 = same pixel count as the cropped frame). */
  resizeScale: number
  /** How pixels are resampled: smooth (bilinear/high quality) for photos,
   *  nearest for pixel art that should stay crisp. */
  resample: Resample
}

export const FULL_CROP: NormRect = { x: 0, y: 0, w: 1, h: 1 }

export const DEFAULT_GEOMETRY: PhotoGeometry = {
  quarterTurns: 0,
  flipH: false,
  flipV: false,
  perspectiveV: 0,
  perspectiveH: 0,
  straighten: 0,
  angle: 0,
  crop: FULL_CROP,
  resizeScale: 1,
  resample: 'smooth',
}

/** How far the strongest keystone pulls an edge in: half the image's width
 *  (a quarter from each side) at ±100. Enough to square up a tall building
 *  shot from street level without collapsing the frame to a sliver. */
const MAX_KEYSTONE_INSET = 0.5

export const GEOMETRY_LIMITS = {
  perspective: { min: -100, max: 100 },
  straighten: { min: -45, max: 45 },
  angle: { min: -180, max: 180 },
  /** A crop narrower than this fraction of the frame is almost certainly a
   *  slipped drag, and a zero-size one has no pixels to render. */
  minCrop: 0.01,
  resizeScale: { min: 0.01, max: 4 },
  /** Longest output edge. Past this a canvas allocation starts failing on
   *  some browsers and the port-back data URL gets unwieldy for localStorage. */
  maxEdge: 8192,
} as const

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
const finiteOr = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback)

/** Clamp a crop into the frame, keeping it at least `minCrop` on each side. */
export function clampCrop(crop: NormRect): NormRect {
  const min = GEOMETRY_LIMITS.minCrop
  const w = clamp(finiteOr(crop.w, 1), min, 1)
  const h = clamp(finiteOr(crop.h, 1), min, 1)
  return {
    x: clamp(finiteOr(crop.x, 0), 0, 1 - w),
    y: clamp(finiteOr(crop.y, 0), 0, 1 - h),
    w,
    h,
  }
}

/**
 * Bring any geometry into range — every field, whatever sent it. Applied in
 * the store on the way in, so a value arriving from a restored history entry
 * or stored edit metadata can't put the pipeline somewhere its maths never
 * expects (a zero-width crop, a NaN angle).
 */
export function normalizeGeometry(g: PhotoGeometry): PhotoGeometry {
  const { perspective, straighten, angle, resizeScale } = GEOMETRY_LIMITS
  return {
    quarterTurns: ((((Math.round(finiteOr(g.quarterTurns, 0)) % 4) + 4) % 4) as QuarterTurns),
    flipH: !!g.flipH,
    flipV: !!g.flipV,
    perspectiveV: clamp(finiteOr(g.perspectiveV, 0), perspective.min, perspective.max),
    perspectiveH: clamp(finiteOr(g.perspectiveH, 0), perspective.min, perspective.max),
    straighten: clamp(finiteOr(g.straighten, 0), straighten.min, straighten.max),
    angle: clamp(finiteOr(g.angle, 0), angle.min, angle.max),
    crop: clampCrop(g.crop ?? FULL_CROP),
    resizeScale: clamp(finiteOr(g.resizeScale, 1), resizeScale.min, resizeScale.max),
    resample: g.resample === 'nearest' ? 'nearest' : 'smooth',
  }
}

export function sameGeometry(a: PhotoGeometry, b: PhotoGeometry): boolean {
  return (
    a === b ||
    (a.quarterTurns === b.quarterTurns &&
      a.flipH === b.flipH &&
      a.flipV === b.flipV &&
      a.perspectiveV === b.perspectiveV &&
      a.perspectiveH === b.perspectiveH &&
      a.straighten === b.straighten &&
      a.angle === b.angle &&
      a.crop.x === b.crop.x &&
      a.crop.y === b.crop.y &&
      a.crop.w === b.crop.w &&
      a.crop.h === b.crop.h &&
      a.resizeScale === b.resizeScale &&
      a.resample === b.resample)
  )
}

/** True when the geometry leaves the image exactly as it was — the pipeline
 *  (and PHOTO-006's port-back) then takes its original, untouched path. */
export function isIdentityGeometry(g: PhotoGeometry): boolean {
  return sameGeometry({ ...g, resample: 'smooth' }, DEFAULT_GEOMETRY)
}

// ---------------------------------------------------------------------------
// 3×3 matrices, row-major, acting on column vectors [x, y, 1].

export type Mat3 = readonly [number, number, number, number, number, number, number, number, number]

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1]

export function multiply(a: Mat3, b: Mat3): Mat3 {
  const r = new Array<number>(9)
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]
    }
  }
  return r as unknown as Mat3
}

export function invert(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  if (Math.abs(det) < 1e-12) throw new Error('Geometry matrix is not invertible')
  const k = 1 / det
  return [
    A * k,
    -(b * i - c * h) * k,
    (b * f - c * e) * k,
    B * k,
    (a * i - c * g) * k,
    -(a * f - c * d) * k,
    C * k,
    -(a * h - b * g) * k,
    (a * e - b * d) * k,
  ]
}

/** Apply a matrix to a point, with the perspective divide. */
export function apply(m: Mat3, x: number, y: number): { x: number; y: number } {
  const w = m[6] * x + m[7] * y + m[8]
  return { x: (m[0] * x + m[1] * y + m[2]) / w, y: (m[3] * x + m[4] * y + m[5]) / w }
}

/** No perspective terms — the whole map is a plain affine transform, which
 *  a 2d canvas can draw directly with setTransform. */
export function isAffine(m: Mat3): boolean {
  return Math.abs(m[6]) < 1e-12 && Math.abs(m[7]) < 1e-12
}

const translate = (x: number, y: number): Mat3 => [1, 0, x, 0, 1, y, 0, 0, 1]
const scale = (sx: number, sy: number): Mat3 => [sx, 0, 0, 0, sy, 0, 0, 0, 1]

/** Output-to-input map for a turn of `deg` clockwise (y-down) about the two
 *  frames' centres: input = R(-θ)·(output − outCentre) + inCentre. */
function rotationInverse(deg: number, inW: number, inH: number, outW: number, outH: number): Mat3 {
  const t = (deg * Math.PI) / 180
  const c = Math.cos(t)
  const s = Math.sin(t)
  const rot: Mat3 = [c, s, 0, -s, c, 0, 0, 0, 1]
  return multiply(translate(inW / 2, inH / 2), multiply(rot, translate(-outW / 2, -outH / 2)))
}

/**
 * The homography taking the unit square's corners (0,0) (1,0) (1,1) (0,1) to
 * the quad p0..p3 — Heckbert's closed form, affine when the quad is a
 * parallelogram.
 */
export function squareToQuad(p: readonly { x: number; y: number }[]): Mat3 {
  const [p0, p1, p2, p3] = p
  const dx1 = p1.x - p2.x
  const dx2 = p3.x - p2.x
  const dx3 = p0.x - p1.x + p2.x - p3.x
  const dy1 = p1.y - p2.y
  const dy2 = p3.y - p2.y
  const dy3 = p0.y - p1.y + p2.y - p3.y
  if (Math.abs(dx3) < 1e-12 && Math.abs(dy3) < 1e-12) {
    return [p1.x - p0.x, p3.x - p0.x, p0.x, p1.y - p0.y, p3.y - p0.y, p0.y, 0, 0, 1]
  }
  const det = dx1 * dy2 - dx2 * dy1
  const g = (dx3 * dy2 - dx2 * dy3) / det
  const h = (dx1 * dy3 - dx3 * dy1) / det
  return [
    p1.x - p0.x + g * p1.x,
    p3.x - p0.x + h * p3.x,
    p0.x,
    p1.y - p0.y + g * p1.y,
    p3.y - p0.y + h * p3.y,
    p0.y,
    g,
    h,
    1,
  ]
}

/**
 * The source quad a keystone correction pulls into the full frame: at
 * positive vertical the top corners move inward, so the narrow top of a
 * converging building is stretched out to the frame's full width. The quad
 * always lies inside the image, so the corrected frame is filled edge to
 * edge — the price is a little of the image at the pulled-in corners.
 */
export function keystoneQuad(w: number, h: number, vertical: number, horizontal: number) {
  const iv = (Math.abs(vertical) / 100) * MAX_KEYSTONE_INSET
  const ih = (Math.abs(horizontal) / 100) * MAX_KEYSTONE_INSET
  const tl = { x: 0, y: 0 }
  const tr = { x: w, y: 0 }
  const br = { x: w, y: h }
  const bl = { x: 0, y: h }
  const dx = (iv * w) / 2
  const dy = (ih * h) / 2
  if (vertical > 0) {
    tl.x += dx
    tr.x -= dx
  } else if (vertical < 0) {
    bl.x += dx
    br.x -= dx
  }
  if (horizontal > 0) {
    tl.y += dy
    bl.y -= dy
  } else if (horizontal < 0) {
    tr.y += dy
    br.y -= dy
  }
  return [tl, tr, br, bl]
}

/** The largest same-proportioned rectangle that fits inside a W×H frame
 *  turned by `deg`, as a fraction of the frame — straighten's auto-crop. */
export function straightenScale(w: number, h: number, deg: number): number {
  const t = (Math.abs(deg) * Math.PI) / 180
  const c = Math.cos(t)
  const s = Math.sin(t)
  return Math.min(w / (w * c + h * s), h / (w * s + h * c))
}

export interface GeometryPlan {
  /** Source image size the plan was built for. */
  sourceWidth: number
  sourceHeight: number
  /** Output size in whole pixels. */
  width: number
  height: number
  /** Output pixel → source pixel. */
  toSource: Mat3
  /** Whether the output has uncovered, transparent corners (a free rotation
   *  that isn't a multiple of 90°), so it must be saved as PNG. */
  transparent: boolean
  resample: Resample
  /** The frame the crop is expressed in (after rotation, before crop) —
   *  what the crop overlay draws over while cropping. */
  cropFrame: { width: number; height: number }
  /** Output pixels per frame pixel along each axis — the resize ratio after
   *  rounding to whole pixels. 1 when nothing was resized. */
  pixelScale: { x: number; y: number }
  identity: boolean
}

export interface PlanOptions {
  /** Plan the frame the crop is drawn over — rotation and perspective
   *  applied, but no crop and no resize — for the crop tool's preview. */
  cropEditing?: boolean
}

/** Fit a frame inside the output edge limit, preserving its proportions. */
function capEdge(w: number, h: number): number {
  const longest = Math.max(w, h)
  return longest > GEOMETRY_LIMITS.maxEdge ? GEOMETRY_LIMITS.maxEdge / longest : 1
}

/**
 * Build the output-to-source map for `geometry` on a sourceWidth×sourceHeight
 * image. Pure maths, no pixels — cheap enough to rebuild every render.
 */
export function planGeometry(
  geometry: PhotoGeometry,
  sourceWidth: number,
  sourceHeight: number,
  opts: PlanOptions = {},
): GeometryPlan {
  const g = normalizeGeometry(geometry)
  let w = sourceWidth
  let h = sourceHeight
  let m: Mat3 = IDENTITY
  const step = (inverse: Mat3, nextW: number, nextH: number) => {
    m = multiply(m, inverse)
    w = nextW
    h = nextH
  }

  // Quarter turns: exact index shuffles, so a 90° turn never resamples.
  if (g.quarterTurns === 1) step([0, 1, 0, -1, 0, h, 0, 0, 1], h, w)
  else if (g.quarterTurns === 2) step([-1, 0, w, 0, -1, h, 0, 0, 1], w, h)
  else if (g.quarterTurns === 3) step([0, -1, w, 1, 0, 0, 0, 0, 1], h, w)

  if (g.flipH) step([-1, 0, w, 0, 1, 0, 0, 0, 1], w, h)
  if (g.flipV) step([1, 0, 0, 0, -1, h, 0, 0, 1], w, h)

  if (g.perspectiveV !== 0 || g.perspectiveH !== 0) {
    const quad = keystoneQuad(w, h, g.perspectiveV, g.perspectiveH)
    step(multiply(squareToQuad(quad), scale(1 / w, 1 / h)), w, h)
  }

  if (g.straighten !== 0) {
    const s = straightenScale(w, h, g.straighten)
    step(rotationInverse(g.straighten, w, h, w * s, h * s), w * s, h * s)
  }

  if (g.angle !== 0) {
    const t = (g.angle * Math.PI) / 180
    const c = Math.abs(Math.cos(t))
    const s = Math.abs(Math.sin(t))
    const outW = w * c + h * s
    const outH = w * s + h * c
    step(rotationInverse(g.angle, w, h, outW, outH), outW, outH)
  }

  const cropFrame = { width: w, height: h }
  const crop = opts.cropEditing ? FULL_CROP : g.crop
  step(translate(crop.x * w, crop.y * h), crop.w * w, crop.h * h)

  const identity = isIdentityGeometry(g) && !opts.cropEditing
  // An untouched image keeps its own size whatever it is — the pre-PHOTO-009
  // path, unchanged. Anything geometry produces stays under the edge limit.
  const wanted = opts.cropEditing ? 1 : g.resizeScale
  const r = wanted * (identity ? 1 : capEdge(w * wanted, h * wanted))
  const width = Math.max(1, Math.round(w * r))
  const height = Math.max(1, Math.round(h * r))
  const pixelScale = { x: width / w, y: height / h }
  step(scale(1 / pixelScale.x, 1 / pixelScale.y), width, height)

  const rightAngle = Math.abs(g.angle % 90) < 1e-9
  return {
    sourceWidth,
    sourceHeight,
    width,
    height,
    toSource: m,
    transparent: !rightAngle,
    resample: g.resample,
    cropFrame,
    pixelScale,
    identity,
  }
}

/** The render size for a plan capped to `maxEdge` on its longest side. */
export function cappedSize(plan: GeometryPlan, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(plan.width, plan.height)
  const s = longest > maxEdge ? maxEdge / longest : 1
  return {
    width: Math.max(1, Math.round(plan.width * s)),
    height: Math.max(1, Math.round(plan.height * s)),
  }
}

/**
 * The plan's output→source map for rendering at `width`×`height` instead of
 * the plan's own size (the capped preview, the histogram's proxy).
 */
export function renderMatrix(plan: GeometryPlan, width: number, height: number): Mat3 {
  return multiply(plan.toSource, scale(plan.width / width, plan.height / height))
}

/**
 * The largest rect of `aspect` (width ÷ height, in pixels) centred on `crop`'s
 * centre that fits in the frame — how picking an aspect preset reshapes the
 * crop already on screen.
 */
export function fitCropToAspect(
  crop: NormRect,
  aspect: number,
  frameWidth: number,
  frameHeight: number,
): NormRect {
  // In normalized units the ratio w/h is aspect × frameH/frameW.
  const k = (aspect * frameHeight) / frameWidth
  const cx = crop.x + crop.w / 2
  const cy = crop.y + crop.h / 2
  // Keep the current crop's longer side where it can, then shrink to fit the
  // frame; clampCrop slides it back inside if the centre sits near an edge.
  let w = Math.max(crop.w, crop.h * k)
  let h = w / k
  if (w > 1) {
    w = 1
    h = w / k
  }
  if (h > 1) {
    h = 1
    w = h * k
  }
  return clampCrop({ x: cx - w / 2, y: cy - h / 2, w, h })
}
