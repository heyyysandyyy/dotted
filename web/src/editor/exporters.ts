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
