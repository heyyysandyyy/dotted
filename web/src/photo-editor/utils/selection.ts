import { apply, invert, renderMatrix } from './geometry'
import type { GeometryPlan } from './geometry'
import { drawGeometry } from './warp'

/**
 * PHOTO-011 (phase 1): selections — rectangle and ellipse marquee, lasso and
 * magic wand — that confine every tonal, colour and detail adjustment to part
 * of the photo.
 *
 * A selection is kept as the list of operations that built it, not as a
 * bitmap: each rectangle, ellipse or lasso is a polygon and each wand click a
 * seed, adding to or subtracting from what came before, in *source image*
 * coordinates normalized to 0..1. So the same selection rasterizes crisply at
 * the capped preview size and at the full-size bake, and it stays on the same
 * part of the photo when the geometry (PHOTO-009) is changed afterwards.
 */

export interface Point {
  x: number
  y: number
}

export type SelectionMode = 'add' | 'subtract'

/** A marquee or lasso outline — normalized source coordinates. */
export interface PolygonOp {
  kind: 'polygon'
  mode: SelectionMode
  points: Point[]
}

/** A magic-wand click: everything close enough in colour to the pixel at
 *  `seed` (and, if `contiguous`, connected to it). */
export interface WandOp {
  kind: 'wand'
  mode: SelectionMode
  seed: Point
  /** 0..100 — how far a colour may drift from the seed and still count. */
  tolerance: number
  contiguous: boolean
}

/**
 * A brush stroke (PHOTO-011 phase 3): the path painted, as normalized source
 * points. `radius` is a fraction of the source's shorter edge — like every
 * other radius in the pipeline — so the stroke is the same thickness at the
 * capped preview and the full-size bake. `hardness` 100 is a crisp edge, 0
 * fades out over the whole radius.
 */
export interface StrokeOp {
  kind: 'stroke'
  mode: SelectionMode
  points: Point[]
  radius: number
  hardness: number
}

/**
 * A graduated (linear) or radial gradient mask (PHOTO-011 phase 3) — the
 * classic "darken the sky" / "brighten the subject" tool. Coverage is full at
 * `from` and fades to nothing at `to`: along the line for a linear gradient,
 * or outward from the centre for a radial one, where `to` sits on its edge.
 */
export interface GradientOp {
  kind: 'gradient'
  mode: SelectionMode
  shape: 'linear' | 'radial'
  from: Point
  to: Point
}

export type SelectionOp = PolygonOp | WandOp | StrokeOp | GradientOp

export interface PhotoSelection {
  ops: SelectionOp[]
  /** 0..100 — softens the selection's edge (see MAX_FEATHER_FRACTION). */
  feather: number
  /** Select everything that the ops *don't* cover. */
  inverted: boolean
}

export const EMPTY_SELECTION: PhotoSelection = { ops: [], feather: 0, inverted: false }

/** Feather at 100: a soft edge this fraction of the render's shorter side.
 *  A fraction rather than pixels, like PHOTO-008's radii, so the preview and
 *  the full-size bake feather identically. */
const MAX_FEATHER_FRACTION = 0.05

/** The wand floods a copy of the source at most this big — plenty to find
 *  a region's edge, and fast enough to feel instant on a click. The mask is
 *  scaled up (smoothly) to whatever size it's rendered at. */
const WAND_MAX_EDGE = 1600

/** Brush size at 100, as a fraction of the source's shorter edge. */
export const MAX_BRUSH_FRACTION = 0.2

/** A UI brush size (1..100) as the stored radius fraction. */
export function brushRadius(size: number): number {
  return (Math.max(1, Math.min(100, size)) / 100) * MAX_BRUSH_FRACTION
}

/** True when there's anything selected at all. Only subtractions (from
 *  nothing) select nothing, so they don't count. */
export function hasSelection(selection: PhotoSelection): boolean {
  return selection.ops.some((op) => op.mode === 'add')
}

export function sameSelection(a: PhotoSelection, b: PhotoSelection): boolean {
  if (a === b) return true
  return (
    a.feather === b.feather &&
    a.inverted === b.inverted &&
    a.ops.length === b.ops.length &&
    JSON.stringify(a.ops) === JSON.stringify(b.ops)
  )
}

/**
 * Fold a new operation into the selection the way the combine mode says:
 * 'new' replaces it outright; 'add' and 'subtract' grow or cut it.
 *
 * An inverted selection is the complement of its ops, so growing *what's
 * shown* means cutting the ops underneath, and vice versa — the op's mode is
 * flipped to keep "add" meaning add to what you see.
 */
export function combineSelection(
  selection: PhotoSelection,
  op: SelectionOp,
  combine: 'new' | 'add' | 'subtract',
): PhotoSelection {
  if (combine === 'new') return { ...selection, ops: [{ ...op, mode: 'add' }], inverted: false }
  const wanted: SelectionMode = combine
  const mode: SelectionMode = selection.inverted ? (wanted === 'add' ? 'subtract' : 'add') : wanted
  return { ...selection, ops: [...selection.ops, { ...op, mode }] }
}

/** Drop junk from ops arriving from anywhere (history, stored edits). */
export function normalizeSelection(s: PhotoSelection): PhotoSelection {
  const finite = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y)
  const usable = (op: SelectionOp) => {
    if (op.kind === 'polygon') return op.points.length >= 3 && op.points.every(finite)
    if (op.kind === 'stroke') return op.points.length >= 1 && op.points.every(finite) && op.radius > 0
    if (op.kind === 'gradient') return finite(op.from) && finite(op.to)
    return finite(op.seed)
  }
  const ops = (s.ops ?? []).filter(usable)
  return {
    ops,
    feather: Math.max(0, Math.min(100, Number.isFinite(s.feather) ? s.feather : 0)),
    inverted: !!s.inverted,
  }
}

// ---------------------------------------------------------------------------
// Magic wand

/**
 * Which pixels the wand picks, as a 0/1 flag per pixel: those whose colour
 * is within `tolerance` (0..100 → 0..255 on the largest channel difference,
 * alpha included) of the seed's, and — when `contiguous` — reachable from the
 * seed through such pixels, 4-connected.
 */
export function wandSelect(
  data: ImageData,
  seedX: number,
  seedY: number,
  tolerance: number,
  contiguous: boolean,
): Uint8Array {
  const { width, height } = data
  const d = data.data
  const out = new Uint8Array(width * height)
  const sx = Math.max(0, Math.min(width - 1, Math.floor(seedX)))
  const sy = Math.max(0, Math.min(height - 1, Math.floor(seedY)))
  const si = (sy * width + sx) * 4
  const r = d[si]
  const g = d[si + 1]
  const b = d[si + 2]
  const a = d[si + 3]
  const limit = (Math.max(0, Math.min(100, tolerance)) / 100) * 255
  const near = (i: number) => {
    const p = i * 4
    return (
      Math.abs(d[p] - r) <= limit &&
      Math.abs(d[p + 1] - g) <= limit &&
      Math.abs(d[p + 2] - b) <= limit &&
      Math.abs(d[p + 3] - a) <= limit
    )
  }

  if (!contiguous) {
    for (let i = 0; i < out.length; i++) if (near(i)) out[i] = 1
    return out
  }

  // Explicit stack, not recursion: a big flat sky is millions of pixels deep.
  const seen = new Uint8Array(width * height)
  const stack = [sy * width + sx]
  seen[stack[0]] = 1
  const visit = (n: number) => {
    if (seen[n]) return
    seen[n] = 1
    stack.push(n)
  }
  while (stack.length > 0) {
    const i = stack.pop()!
    if (!near(i)) continue
    out[i] = 1
    const x = i % width
    const y = (i - x) / width
    if (x > 0) visit(i - 1)
    if (x < width - 1) visit(i + 1)
    if (y > 0) visit(i - width)
    if (y < height - 1) visit(i + width)
  }
  return out
}

/** A small, drawable copy of the source, per source (and size) — the wand
 *  and every click on the same photo share it. */
const wandSources = new WeakMap<object, { canvas: HTMLCanvasElement; data: ImageData }>()
/** Wand masks already worked out, per source and click. */
const wandMasks = new WeakMap<object, Map<string, HTMLCanvasElement>>()
const WAND_CACHE_LIMIT = 24

function wandSource(source: CanvasImageSource, srcW: number, srcH: number) {
  const cached = wandSources.get(source as object)
  if (cached) return cached
  const s = Math.min(1, WAND_MAX_EDGE / Math.max(srcW, srcH))
  const w = Math.max(1, Math.round(srcW * s))
  const h = Math.max(1, Math.round(srcH * s))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(source, 0, 0, w, h)
  const entry = { canvas, data: ctx.getImageData(0, 0, w, h) }
  wandSources.set(source as object, entry)
  return entry
}

/** The wand's pick as a white-on-clear canvas at the wand's working size. */
function wandMaskCanvas(source: CanvasImageSource, srcW: number, srcH: number, op: WandOp) {
  const key = `${op.seed.x},${op.seed.y},${op.tolerance},${op.contiguous}`
  let perSource = wandMasks.get(source as object)
  const hit = perSource?.get(key)
  if (hit) return hit
  const src = wandSource(source, srcW, srcH)
  if (!src) return null
  const { width, height } = src.data
  const picked = wandSelect(src.data, op.seed.x * width, op.seed.y * height, op.tolerance, op.contiguous)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const img = ctx.createImageData(width, height)
  for (let i = 0; i < picked.length; i++) {
    if (!picked[i]) continue
    const p = i * 4
    img.data[p] = img.data[p + 1] = img.data[p + 2] = img.data[p + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  if (!perSource) wandMasks.set(source as object, (perSource = new Map()))
  if (perSource.size >= WAND_CACHE_LIMIT) perSource.clear()
  perSource.set(key, canvas)
  return canvas
}

// ---------------------------------------------------------------------------
// Rasterizing

/** One box-blur pass along an axis of a single-channel plane, with a running
 *  sum (O(1) per pixel in the radius), edges clamped. */
function boxBlurPlane(src: Float32Array, dst: Float32Array, w: number, h: number, r: number, horizontal: boolean) {
  const len = horizontal ? w : h
  const lines = horizontal ? h : w
  const step = horizontal ? 1 : w
  const lineStep = horizontal ? w : 1
  const inv = 1 / (2 * r + 1)
  const last = len - 1
  for (let line = 0; line < lines; line++) {
    const o = line * lineStep
    const first = src[o]
    const end = src[o + last * step]
    let sum = first * (r + 1)
    for (let i = 1; i <= r; i++) sum += src[o + Math.min(i, last) * step]
    for (let i = 0; i < len; i++) {
      dst[o + i * step] = sum * inv
      const enter = i + r + 1
      const leave = i - r
      sum += (enter > last ? end : src[o + enter * step]) - (leave < 0 ? first : src[o + leave * step])
    }
  }
}

/** Gaussian-ish feather: three box passes per axis, like spatialPass.ts's
 *  blur, on the mask's one channel. */
export function featherMask(mask: Uint8ClampedArray, w: number, h: number, radius: number): void {
  if (radius < 1) return
  const a = Float32Array.from(mask)
  const b = new Float32Array(a.length)
  for (let pass = 0; pass < 3; pass++) {
    boxBlurPlane(a, b, w, h, radius, true)
    boxBlurPlane(b, a, w, h, radius, false)
  }
  for (let i = 0; i < mask.length; i++) mask[i] = a[i]
}

/** Map normalized source points to render pixels through the plan. */
function toRender(points: Point[], forward: ReturnType<typeof invert>, plan: GeometryPlan): Point[] {
  return points.map((p) => apply(forward, p.x * plan.sourceWidth, p.y * plan.sourceHeight))
}

/**
 * The selection as a 0..255 coverage mask at `width`×`height` — the render of
 * `plan`'s output — or null when nothing is selected. Polygons are filled
 * through the plan's forward map (a homography keeps straight edges straight,
 * so mapping the vertices is exact); wand picks are drawn through the same
 * renderer as the photo, so they land on exactly the pixels they picked.
 */
export function renderSelectionMask(
  source: CanvasImageSource,
  plan: GeometryPlan,
  width: number,
  height: number,
  selection: PhotoSelection,
): Uint8ClampedArray | null {
  if (!hasSelection(selection)) return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const forward = invert(renderMatrix(plan, width, height))
  let scratch: HTMLCanvasElement | null = null

  // Render pixels per source pixel, for radii that are stored against the
  // source: the average linear scale of the (possibly rotated, cropped,
  // resized) forward map.
  const pixelsPerSource = Math.sqrt(Math.abs(forward[0] * forward[4] - forward[1] * forward[3])) || 1
  const shortSourceEdge = Math.min(plan.sourceWidth, plan.sourceHeight)
  const scratchContext = () => {
    if (!scratch) {
      scratch = document.createElement('canvas')
      scratch.width = width
      scratch.height = height
    }
    const sctx = scratch.getContext('2d')
    sctx?.clearRect(0, 0, width, height)
    return sctx
  }

  for (const op of selection.ops) {
    ctx.globalCompositeOperation = op.mode === 'add' ? 'source-over' : 'destination-out'
    if (op.kind === 'stroke') {
      const sctx = scratchContext()
      if (!sctx) continue
      const pts = toRender(op.points, forward, plan)
      const radiusPx = Math.max(0.5, op.radius * shortSourceEdge * pixelsPerSource)
      sctx.strokeStyle = '#ffffff'
      sctx.fillStyle = '#ffffff'
      sctx.lineWidth = radiusPx * 2
      sctx.lineCap = 'round'
      sctx.lineJoin = 'round'
      if (pts.length === 1) {
        // A single dab — a click rather than a drag.
        sctx.beginPath()
        sctx.arc(pts[0].x, pts[0].y, radiusPx, 0, Math.PI * 2)
        sctx.fill()
      } else {
        sctx.beginPath()
        sctx.moveTo(pts[0].x, pts[0].y)
        for (let i = 1; i < pts.length; i++) sctx.lineTo(pts[i].x, pts[i].y)
        sctx.stroke()
      }
      // Hardness softens the edge: the blur eats into the stroke, so the
      // painted radius above already includes what the blur will spread.
      const soft = Math.round(((100 - op.hardness) / 100) * radiusPx)
      if (soft >= 1) {
        const strokeImage = sctx.getImageData(0, 0, width, height)
        const alpha = new Uint8ClampedArray(width * height)
        for (let i = 0; i < alpha.length; i++) alpha[i] = strokeImage.data[i * 4 + 3]
        featherMask(alpha, width, height, soft)
        for (let i = 0; i < alpha.length; i++) strokeImage.data[i * 4 + 3] = alpha[i]
        sctx.putImageData(strokeImage, 0, 0)
      }
      ctx.drawImage(sctx.canvas, 0, 0)
      continue
    }
    if (op.kind === 'gradient') {
      const [from, to] = toRender([op.from, op.to], forward, plan)
      const gradient =
        op.shape === 'linear'
          ? ctx.createLinearGradient(from.x, from.y, to.x, to.y)
          : ctx.createRadialGradient(from.x, from.y, 0, from.x, from.y, Math.hypot(to.x - from.x, to.y - from.y) || 1)
      gradient.addColorStop(0, 'rgba(255,255,255,1)')
      gradient.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, width, height)
      continue
    }
    if (op.kind === 'polygon') {
      const pts = toRender(op.points, forward, plan)
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
      ctx.closePath()
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      continue
    }
    const pick = wandMaskCanvas(source, plan.sourceWidth, plan.sourceHeight, op)
    if (!pick) continue
    const sctx = scratchContext()
    if (!sctx) continue
    // Always smooth: the mask is upscaled from the wand's working size.
    drawGeometry(sctx, pick, { ...plan, resample: 'smooth' }, width, height)
    ctx.drawImage(sctx.canvas, 0, 0)
  }

  const pixels = ctx.getImageData(0, 0, width, height).data
  const mask = new Uint8ClampedArray(width * height)
  for (let i = 0; i < mask.length; i++) mask[i] = pixels[i * 4 + 3]
  const radius = Math.round((selection.feather / 100) * MAX_FEATHER_FRACTION * Math.min(width, height))
  featherMask(mask, width, height, radius)
  if (selection.inverted) for (let i = 0; i < mask.length; i++) mask[i] = 255 - mask[i]
  return mask
}

/**
 * Blend `adjusted` back towards `original` outside the selection:
 * each pixel moves from the original to the adjusted value by the mask's
 * coverage, so a feathered edge fades the adjustment out smoothly.
 */
export function blendByMask(adjusted: ImageData, original: ImageData, mask: Uint8ClampedArray): void {
  const a = adjusted.data
  const o = original.data
  for (let i = 0; i < mask.length; i++) {
    const m = mask[i]
    if (m === 255) continue
    const p = i * 4
    if (m === 0) {
      a[p] = o[p]
      a[p + 1] = o[p + 1]
      a[p + 2] = o[p + 2]
      a[p + 3] = o[p + 3]
      continue
    }
    const t = m / 255
    for (let k = 0; k < 4; k++) a[p + k] = o[p + k] + (a[p + k] - o[p + k]) * t
  }
}

/**
 * The selection's outline as a list of edge pixels at `width`×`height` —
 * pixels at least half covered with a less-than-half-covered neighbour —
 * for the "marching ants" drawn over the preview.
 */
export function selectionEdges(mask: Uint8ClampedArray, width: number, height: number): Uint32Array {
  const edges: number[] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (mask[i] < 128) continue
      if (
        x === 0 ||
        y === 0 ||
        x === width - 1 ||
        y === height - 1 ||
        mask[i - 1] < 128 ||
        mask[i + 1] < 128 ||
        mask[i - width] < 128 ||
        mask[i + width] < 128
      ) {
        edges.push(i)
      }
    }
  }
  return Uint32Array.from(edges)
}

// ---------------------------------------------------------------------------
// Gestures

/** A drag shorter than this is a click, not a shape. */
const CLICK_PX = 3
/** Vertices the ellipse marquee is traced with — smooth at any size. */
const ELLIPSE_SEGMENTS = 72

/**
 * The outline a gesture describes, in screen points: a rectangle or ellipse
 * spanning the drag, or the lasso's path. Null for a drag too small to be a
 * shape. `live` keeps a lasso of two points drawable while it's still going.
 */
export function gestureOutline(tool: 'rect' | 'ellipse' | 'lasso' | 'wand' | null, points: Point[], live = false): Point[] | null {
  if (!tool || tool === 'wand' || points.length < 2) return null
  if (tool === 'lasso') {
    if (points.length < (live ? 2 : 3)) return null
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
    return span < CLICK_PX ? null : points
  }
  const [a, b] = [points[0], points[points.length - 1]]
  if (Math.abs(b.x - a.x) < CLICK_PX || Math.abs(b.y - a.y) < CLICK_PX) return null
  const left = Math.min(a.x, b.x)
  const top = Math.min(a.y, b.y)
  const right = Math.max(a.x, b.x)
  const bottom = Math.max(a.y, b.y)
  if (tool === 'rect') {
    return [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
    ]
  }
  const cx = (left + right) / 2
  const cy = (top + bottom) / 2
  const rx = (right - left) / 2
  const ry = (bottom - top) / 2
  return Array.from({ length: ELLIPSE_SEGMENTS }, (_, i) => {
    const t = (i / ELLIPSE_SEGMENTS) * Math.PI * 2
    return { x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) }
  })
}


/** The most vertices a stored outline keeps. Every point is saved with the
 *  edit (PHOTO-006's `edits` metadata, in localStorage), so a long freehand
 *  lasso is thinned to this rather than stored point for point. */
export const MAX_OUTLINE_POINTS = 400

/**
 * Thin an outline to at most MAX_OUTLINE_POINTS by keeping evenly spaced
 * vertices (always including the first). At screen resolution a lasso that
 * long is already far denser than the eye can follow, so the shape survives.
 */
export function simplifyPath(points: Point[]): Point[] {
  if (points.length <= MAX_OUTLINE_POINTS) return points
  const step = points.length / MAX_OUTLINE_POINTS
  return Array.from({ length: MAX_OUTLINE_POINTS }, (_, i) => points[Math.floor(i * step)])
}
