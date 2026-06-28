import type { fabric } from 'fabric'
import { downloadUrl } from './utils'

/** Make a filesystem-friendly base filename from a design name. */
export function slugify(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || 'design'
}

/**
 * Export the canvas as a transparent PNG at native pixel dimensions.
 * Per the export rule, backgroundColor is set to "" (empty string) — not null
 * or 'transparent' — before reading the pixels, then restored.
 */
export function exportPNG(canvas: fabric.Canvas, name: string, scale = 1) {
  const prevBg = canvas.backgroundColor
  canvas.backgroundColor = ''
  canvas.renderAll()

  const dataUrl = canvas.toDataURL({ format: 'png', multiplier: scale })

  canvas.backgroundColor = prevBg
  canvas.renderAll()

  downloadUrl(dataUrl, `${slugify(name)}.png`)
}

/** Default JPEG quality (0–1). 0.92 matches typical "high quality" exports. */
export const DEFAULT_JPEG_QUALITY = 0.92
/** Fallback fill used when the artboard has no opaque background. */
const JPEG_FLATTEN_COLOR = '#ffffff'

/**
 * Export the canvas as a JPEG. JPEG has no alpha channel, so any transparent
 * area would otherwise render as black — we flatten onto a solid background
 * (the artboard's own colour, or white if it is transparent), then restore.
 */
export function exportJPEG(
  canvas: fabric.Canvas,
  name: string,
  scale = 1,
  quality = DEFAULT_JPEG_QUALITY,
) {
  const prevBg = canvas.backgroundColor
  // An empty/undefined background would flatten to black in JPEG; use white.
  if (!prevBg || typeof prevBg !== 'string') canvas.backgroundColor = JPEG_FLATTEN_COLOR
  canvas.renderAll()

  const dataUrl = canvas.toDataURL({ format: 'jpeg', quality, multiplier: scale })

  canvas.backgroundColor = prevBg
  canvas.renderAll()

  downloadUrl(dataUrl, `${slugify(name)}.jpg`)
}
