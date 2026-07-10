import type { PhotoAdjustments } from '../store/usePhotoEditorStore'

/**
 * Live preview only (PHOTO-004) — a CSS filter on the displayed <img>, not a
 * pixel bake. PHOTO-006 (flatten-on-exit) is what commits the adjustment to
 * actual pixel data before porting back to Canvas.
 * -100..100 maps to 0..2 on each CSS filter function's own 1-is-neutral scale.
 */
export function cssFilterFor({ brightness, contrast }: PhotoAdjustments): string {
  return `brightness(${1 + brightness / 100}) contrast(${1 + contrast / 100})`
}
