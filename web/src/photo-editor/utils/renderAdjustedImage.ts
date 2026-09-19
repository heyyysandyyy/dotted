import { cssFilterFor } from './adjustmentFilter'
import { buildChannelLUTs, applyChannelLUTs, needsChannelLUTs } from './channelLUT'
import { applyColorPass, needsColorPass } from './colorPass'
import { applySpatialPass, needsSpatialPass } from './spatialPass'
import { drawGeometry } from './warp'
import { blendByMask, hasSelection, renderSelectionMask } from './selection'
import type { PhotoSelection } from './selection'
import type { GeometryPlan } from './geometry'
import { isNeutralTone } from '../store/usePhotoEditorStore'
import type { PhotoAdjustments, ToneAdjustments } from '../store/usePhotoEditorStore'

/**
 * Draws `source` onto `canvas` at (width, height) with every adjustment
 * applied, in four stages:
 *
 * 1. brightness/contrast (PHOTO-004) as a cheap, GPU-composited CSS filter,
 *    applied in the same draw that puts the image through its geometry
 *    (PHOTO-009's crop/rotate/flip/perspective/resize — see geometry.ts) when
 *    a non-identity `plan` is given
 * 2. the per-channel LUT trio (channelLUT.ts) — exposure/highlights/shadows
 *    plus white balance and colour balance
 * 3. the cross-channel colour pass (colorPass.ts) — hue, saturation,
 *    vibrance, black & white, invert
 * 4. the neighbourhood pass (spatialPass.ts) — noise reduction, blur,
 *    sharpen, grain (PHOTO-008)
 *
 * Stages 2 to 4 share one getImageData/putImageData round trip, and it's
 * skipped entirely when all three report they'd be no-ops — which is the
 * common case while only the CSS-filter controls are being dragged.
 *
 * The spatial pass goes last because it is the only one that reads a pixel's
 * neighbours: running it before the colour work would sharpen and grain an
 * image that then got re-graded underneath the result, so the halos and
 * texture would no longer sit where they were judged.
 *
 * Geometry comes first so every later stage works on the image as framed:
 * the histogram counts only what survives the crop, and PHOTO-008's radii —
 * fractions of the render's shorter edge — are fractions of the cropped
 * result, the same at every render size.
 *
 * `width`×`height` is the render size of the plan's output (the plan's own
 * size for the bake, capped for the preview and histogram).
 *
 * A selection (PHOTO-011) confines stages 1 to 4 to part of the photo: the
 * framed original is drawn once without them, and the adjusted result is
 * blended back over it by the selection's feathered mask. Adjustment layers
 * (PHOTO-011 phase 2) then repeat stages 1 to 4 with their own settings, each
 * on the result so far, inside its own mask and at its own opacity. Geometry
 * is never confined — it reframes the whole photo.
 *
 * Shared by the live preview canvas and flattenImage's bake (PHOTO-006) so
 * the two can never render differently. Returns false (nothing drawn) only
 * if a 2d context isn't available, so callers that need to report that
 * failure don't have to fetch their own context just to check.
 */
export function renderAdjustedImage(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  width: number,
  height: number,
  adjustments: PhotoAdjustments,
  plan?: GeometryPlan | null,
): boolean {
  // Reassigning canvas.width/height resets its backing bitmap even when set
  // to the same value it already holds — skip that on every redraw tick when
  // the image's own dimensions (not the adjustments) haven't changed.
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  const draw = (filter: string) => {
    ctx.filter = filter
    if (plan && !plan.identity) {
      drawGeometry(ctx, source, plan, width, height)
      return
    }
    // Cleared first: a photo with transparency would otherwise composite
    // over the previous frame left on a reused canvas.
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(source, 0, 0, width, height)
  }

  const layers = adjustments.layers.filter((l) => l.visible && l.opacity > 0 && !isNeutralTone(l.adjustments))
  const baseMask =
    plan && hasSelection(adjustments.selection) ? cachedMask(source, plan, width, height, adjustments.selection) : null

  // The common case — no selection, no layers: one filtered draw and, only
  // when a per-pixel control is touched, one getImageData round trip.
  if (!baseMask && layers.length === 0) {
    draw(cssFilterFor(adjustments))
    if (needsPixelPasses(adjustments)) {
      const imageData = ctx.getImageData(0, 0, width, height)
      applyPixelPasses(imageData, adjustments)
      ctx.putImageData(imageData, 0, 0)
    }
    return true
  }

  // Confined or layered (PHOTO-011): work from the framed original's pixels.
  // The base settings apply first, inside the base selection; then each
  // visible layer applies to the result so far, inside its own mask and at
  // its own opacity, in stack order.
  draw('none')
  let current = applyTone(ctx.getImageData(0, 0, width, height), adjustments, baseMask, 100)
  for (const layer of layers) {
    const masked = hasSelection(layer.selection)
    const mask = masked && plan ? cachedMask(source, plan, width, height, layer.selection) : null
    // A mask that can't be built must not turn into "the whole photo".
    if (masked && !mask) continue
    current = applyTone(current, layer.adjustments, mask, layer.opacity)
  }
  ctx.putImageData(current, 0, 0)
  return true
}

function needsPixelPasses(tone: ToneAdjustments): boolean {
  return needsChannelLUTs(tone) || needsColorPass(tone) || needsSpatialPass(tone)
}

function applyPixelPasses(imageData: ImageData, tone: ToneAdjustments): void {
  if (needsChannelLUTs(tone)) applyChannelLUTs(imageData, buildChannelLUTs(tone))
  if (needsColorPass(tone)) applyColorPass(imageData, tone)
  if (needsSpatialPass(tone)) applySpatialPass(imageData, tone)
}

/** Two reusable off-screen canvases for the CSS-filter step of a masked or
 *  layered render — allocated once, not once per frame. */
const scratch: HTMLCanvasElement[] = []
function scratchContext(i: number, width: number, height: number): CanvasRenderingContext2D | null {
  const canvas = (scratch[i] ??= document.createElement('canvas'))
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  return canvas.getContext('2d')
}

/**
 * One tone set applied to `input`, returned as new pixels: brightness and
 * contrast through the CSS filter (drawn between two scratch canvases, since
 * a filter only applies to a draw), then the per-pixel passes, then blended
 * back towards `input` by the mask and opacity. `input` is left untouched.
 */
function applyTone(
  input: ImageData,
  tone: ToneAdjustments,
  mask: Uint8ClampedArray | null,
  opacity: number,
): ImageData {
  if (isNeutralTone(tone)) return input
  const { width, height } = input
  let out: ImageData | null = null
  if (tone.brightness !== 0 || tone.contrast !== 0) {
    const from = scratchContext(0, width, height)
    const to = scratchContext(1, width, height)
    if (from && to) {
      from.putImageData(input, 0, 0)
      to.clearRect(0, 0, width, height)
      to.filter = cssFilterFor(tone)
      to.drawImage(scratch[0], 0, 0)
      to.filter = 'none'
      out = to.getImageData(0, 0, width, height)
    }
  }
  if (!out) {
    const ctx = scratchContext(1, width, height)
    if (!ctx) return input
    out = ctx.createImageData(width, height)
    out.data.set(input.data)
  }
  applyPixelPasses(out, tone)
  const coverage = coverageFor(mask, opacity, width * height)
  if (coverage) blendByMask(out, input, coverage)
  return out
}

/** The mask scaled by opacity (0..100) — null when that's full coverage. */
function coverageFor(mask: Uint8ClampedArray | null, opacity: number, length: number): Uint8ClampedArray | null {
  if (opacity >= 100) return mask
  const k = Math.max(0, opacity) / 100
  if (!mask) return new Uint8ClampedArray(length).fill(Math.round(255 * k))
  const scaled = new Uint8ClampedArray(mask.length)
  for (let i = 0; i < mask.length; i++) scaled[i] = mask[i] * k
  return scaled
}

/**
 * The selection masks for recent renders, remembered against the selection
 * object itself. A slider drag re-renders every frame with the same selection,
 * so each mask (polygon fill, wand pick, feather blur) is built once per
 * selection change and render size rather than once per frame. Keyed by size
 * and framing within a selection, because the preview and the histogram
 * render the same selection at two sizes on every frame.
 */
const maskCache = new WeakMap<PhotoSelection, Map<string, { source: CanvasImageSource; mask: Uint8ClampedArray | null }>>()
const MASKS_PER_SELECTION = 4

function cachedMask(
  source: CanvasImageSource,
  plan: GeometryPlan,
  width: number,
  height: number,
  selection: PhotoSelection,
): Uint8ClampedArray | null {
  const key = `${width}x${height}|${plan.sourceWidth}x${plan.sourceHeight}|${plan.toSource.join(',')}`
  let masks = maskCache.get(selection)
  const hit = masks?.get(key)
  if (hit && hit.source === source) return hit.mask
  const mask = renderSelectionMask(source, plan, width, height, selection)
  if (!masks) maskCache.set(selection, (masks = new Map()))
  if (masks.size >= MASKS_PER_SELECTION) masks.clear()
  masks.set(key, { source, mask })
  return mask
}
