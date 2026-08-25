import { renderAdjustedImage } from './renderAdjustedImage'
import type { PhotoAdjustments } from '../store/usePhotoEditorStore'

/**
 * Bakes the live preview (brightness/contrast PHOTO-004; exposure/
 * highlights/shadows PHOTO-007) into real pixel data (PHOTO-006) — a save
 * has to commit an actual image, not a filter/LUT that only exists as long
 * as the preview canvas is on screen. Matches the source's own format: PNG
 * stays PNG (preserves transparency), anything else becomes JPEG. Output
 * dimensions exactly match the input's natural size, so the Canvas object
 * being replaced needs no width/height/crop adjustment — see
 * objectsSlice.ts's port-back for why that matters.
 */
export function flattenImage(imageSrc: string, adjustments: PhotoAdjustments): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      if (!renderAdjustedImage(canvas, img, img.naturalWidth, img.naturalHeight, adjustments)) {
        reject(new Error('Could not flatten image'))
        return
      }
      const sourceMime = imageSrc.match(/^data:([^;]+);/)?.[1] ?? 'image/png'
      const outputMime = sourceMime === 'image/png' ? 'image/png' : 'image/jpeg'
      resolve(canvas.toDataURL(outputMime, outputMime === 'image/jpeg' ? 0.9 : undefined))
    }
    img.onerror = () => reject(new Error('Could not load image to flatten'))
    img.src = imageSrc
  })
}
