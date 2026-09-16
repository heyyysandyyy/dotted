import { cssFilterFor } from './adjustmentFilter'
import { buildChannelLUTs, applyChannelLUTs, needsChannelLUTs } from './channelLUT'
import { applyColorPass, needsColorPass } from './colorPass'
import { applySpatialPass, needsSpatialPass } from './spatialPass'
import type { PhotoAdjustments } from '../store/usePhotoEditorStore'

/**
 * Draws `source` onto `canvas` at (width, height) with every adjustment
 * applied, in four stages:
 *
 * 1. brightness/contrast (PHOTO-004) as a cheap, GPU-composited CSS filter
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
): boolean {
  // Reassigning canvas.width/height resets its backing bitmap even when set
  // to the same value it already holds — skip that on every redraw tick when
  // the image's own dimensions (not the adjustments) haven't changed.
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  ctx.filter = cssFilterFor(adjustments)
  ctx.drawImage(source, 0, 0, width, height)

  const channels = needsChannelLUTs(adjustments)
  const color = needsColorPass(adjustments)
  const spatial = needsSpatialPass(adjustments)
  if (channels || color || spatial) {
    const imageData = ctx.getImageData(0, 0, width, height)
    if (channels) applyChannelLUTs(imageData, buildChannelLUTs(adjustments))
    if (color) applyColorPass(imageData, adjustments)
    if (spatial) applySpatialPass(imageData, adjustments)
    ctx.putImageData(imageData, 0, 0)
  }
  return true
}
