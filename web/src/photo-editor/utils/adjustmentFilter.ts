import type { PhotoAdjustments } from '../store/usePhotoEditorStore'

/**
 * Brightness/contrast (PHOTO-004) as a CSS filter string — cheap and GPU-
 * composited, unlike exposure/highlights/shadows (PHOTO-007), which need a
 * real per-pixel pass (toneLUT.ts) CSS can't express. renderAdjustedImage.ts
 * uses this for both the live preview canvas and flattenImage's actual
 * pixel bake, so the two can't render differently.
 * -100..100 maps to 0..2 on each CSS filter function's own 1-is-neutral scale.
 */
export function cssFilterFor({ brightness, contrast }: PhotoAdjustments): string {
  return `brightness(${1 + brightness / 100}) contrast(${1 + contrast / 100})`
}
