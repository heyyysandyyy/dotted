import { renderAdjustedImage } from './renderAdjustedImage'
import { planGeometry } from './geometry'
import { placementFor } from './geometryPlacement'
import type { GeometryPlacement } from './geometryPlacement'
import type { PhotoAdjustments } from '../store/usePhotoEditorStore'

export interface FlattenResult {
  dataUrl: string
  /** How the new image maps onto the old one, when geometry (PHOTO-009)
   *  changed its framing or size — null when it's pixel-for-pixel the same
   *  size as the source. */
  placement: GeometryPlacement | null
}

/**
 * Bakes the live preview (brightness/contrast PHOTO-004; every tone,
 * colour, levels and curve control from PHOTO-007; PHOTO-008's detail
 * tools; PHOTO-009's geometry) into real pixel data (PHOTO-006) — a save has
 * to commit an actual image, not a filter/LUT that only exists as long as the
 * preview canvas is on screen.
 *
 * Matches the source's own format: PNG stays PNG (preserves transparency),
 * anything else becomes JPEG — unless a free rotation has uncovered corners,
 * which only PNG can keep clear. Without geometry the output is exactly the
 * source's natural size, so the Canvas object being replaced needs no
 * width/height/crop adjustment (see projectSlice.ts's port-back); with it,
 * `placement` says how to reposition it.
 */
export function flattenImage(imageSrc: string, adjustments: PhotoAdjustments): Promise<FlattenResult> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const plan = planGeometry(adjustments.geometry, img.naturalWidth, img.naturalHeight)
      const canvas = document.createElement('canvas')
      if (!renderAdjustedImage(canvas, img, plan.width, plan.height, adjustments, plan)) {
        reject(new Error('Could not flatten image'))
        return
      }
      const sourceMime = imageSrc.match(/^data:([^;]+);/)?.[1] ?? 'image/png'
      const outputMime = sourceMime === 'image/png' || (!plan.identity && plan.transparent) ? 'image/png' : 'image/jpeg'
      resolve({
        dataUrl: canvas.toDataURL(outputMime, outputMime === 'image/jpeg' ? 0.9 : undefined),
        placement: placementFor(plan),
      })
    }
    img.onerror = () => reject(new Error('Could not load image to flatten'))
    img.src = imageSrc
  })
}
