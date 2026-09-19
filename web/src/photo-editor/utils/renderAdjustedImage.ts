import { cssFilterFor } from './adjustmentFilter'
import { buildChannelLUTs, applyChannelLUTs, needsChannelLUTs } from './channelLUT'
import { applyColorPass, needsColorPass } from './colorPass'
import { applySpatialPass, needsSpatialPass } from './spatialPass'
import { drawGeometry } from './warp'
import { blendByMask, hasSelection, renderSelectionMask } from './selection'
import type { PhotoSelection } from './selection'
import type { GeometryPlan } from './geometry'
import type { PhotoAdjustments } from '../store/usePhotoEditorStore'

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
 * blended back over it by the selection's feathered mask. Geometry is never
 * confined — it reframes the whole photo.
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

  const selection = adjustments.selection
  let original: ImageData | null = null
  let mask: Uint8ClampedArray | null = null
  if (hasSelection(selection)) {
    mask = plan ? cachedMask(source, plan, width, height, selection) : null
    if (mask) {
      draw('none')
      original = ctx.getImageData(0, 0, width, height)
    }
  }

  draw(cssFilterFor(adjustments))
  const channels = needsChannelLUTs(adjustments)
  const color = needsColorPass(adjustments)
  const spatial = needsSpatialPass(adjustments)
  if (channels || color || spatial || (mask && original)) {
    const imageData = ctx.getImageData(0, 0, width, height)
    if (channels) applyChannelLUTs(imageData, buildChannelLUTs(adjustments))
    if (color) applyColorPass(imageData, adjustments)
    if (spatial) applySpatialPass(imageData, adjustments)
    if (mask && original) blendByMask(imageData, original, mask)
    ctx.putImageData(imageData, 0, 0)
  }
  return true
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
