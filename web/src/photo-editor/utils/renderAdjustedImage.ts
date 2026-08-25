import { cssFilterFor } from './adjustmentFilter'
import { buildToneLUT, applyToneLUT, needsToneMap } from './toneLUT'
import type { PhotoAdjustments } from '../store/usePhotoEditorStore'

/**
 * Draws `source` onto `canvas` at (width, height) with every adjustment
 * applied — brightness/contrast (PHOTO-004) as a cheap CSS filter, plus
 * exposure/highlights/shadows (PHOTO-007) as a getImageData/LUT/putImageData
 * pass, skipped entirely when all three are neutral. Shared by the live
 * preview canvas and flattenImage's bake (PHOTO-006) so the two can never
 * render differently.
 */
export function renderAdjustedImage(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  width: number,
  height: number,
  adjustments: PhotoAdjustments,
): void {
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.filter = cssFilterFor(adjustments)
  ctx.drawImage(source, 0, 0, width, height)
  if (needsToneMap(adjustments)) {
    const imageData = ctx.getImageData(0, 0, width, height)
    applyToneLUT(imageData, buildToneLUT(adjustments))
    ctx.putImageData(imageData, 0, 0)
  }
}
