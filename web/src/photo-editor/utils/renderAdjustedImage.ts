import { cssFilterFor } from './adjustmentFilter'
import { buildToneLUT, applyToneLUT, needsToneMap } from './toneLUT'
import type { PhotoAdjustments } from '../store/usePhotoEditorStore'

/**
 * Draws `source` onto `canvas` at (width, height) with every adjustment
 * applied — brightness/contrast (PHOTO-004) as a cheap CSS filter, plus
 * exposure/highlights/shadows (PHOTO-007) as a getImageData/LUT/putImageData
 * pass, skipped entirely when all three are neutral. Shared by the live
 * preview canvas and flattenImage's bake (PHOTO-006) so the two can never
 * render differently. Returns false (nothing drawn) only if a 2d context
 * isn't available, so callers that need to report that failure don't have
 * to fetch their own context just to check.
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
  if (needsToneMap(adjustments)) {
    const imageData = ctx.getImageData(0, 0, width, height)
    applyToneLUT(imageData, buildToneLUT(adjustments))
    ctx.putImageData(imageData, 0, 0)
  }
  return true
}
