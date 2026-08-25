import type { PhotoAdjustments } from '../store/usePhotoEditorStore'

/**
 * Brightness/contrast (PHOTO-004) as a CSS filter string — cheap and GPU-
 * composited, unlike PHOTO-007's tone and colour controls, which need real
 * per-pixel passes (channelLUT.ts, colorPass.ts) CSS can't express.
 * renderAdjustedImage.ts uses this for both the live preview canvas and
 * flattenImage's actual pixel bake, so the two can't render differently.
 * -100..100 maps to 0..2 on each CSS filter function's own 1-is-neutral scale.
 */
export function cssFilterFor({ brightness, contrast }: Pick<PhotoAdjustments, 'brightness' | 'contrast'>): string {
  return `brightness(${1 + brightness / 100}) contrast(${1 + contrast / 100})`
}
