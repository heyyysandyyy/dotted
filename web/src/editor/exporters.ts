import type * as fabric from 'fabric'
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

  let dataUrl: string
  try {
    dataUrl = canvas.toDataURL({ format: 'png', multiplier: scale })
  } finally {
    canvas.backgroundColor = prevBg
    canvas.renderAll()
  }

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

  let dataUrl: string
  try {
    dataUrl = canvas.toDataURL({ format: 'jpeg', quality, multiplier: scale })
  } finally {
    canvas.backgroundColor = prevBg
    canvas.renderAll()
  }

  downloadUrl(dataUrl, `${slugify(name)}.jpg`)
}

/**
 * Export the canvas as a single-page PDF. The page matches the artboard's
 * logical dimensions; `scale` raises the embedded raster's resolution (DPI)
 * rather than the page size, so a 2× export is sharper, not bigger.
 *
 * The artboard is embedded as a PNG so its background (and any transparency)
 * is reproduced exactly over the PDF's white page.
 *
 * jsPDF is a large dependency only needed for this path, so it is lazy-loaded
 * on demand to keep it out of the initial bundle.
 */
export async function exportPDF(canvas: fabric.Canvas, name: string, scale = 1) {
  const pageW = canvas.getWidth()
  const pageH = canvas.getHeight()
  const dataUrl = canvas.toDataURL({ format: 'png', multiplier: scale })

  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({
    orientation: pageW > pageH ? 'landscape' : 'portrait',
    unit: 'px',
    format: [pageW, pageH],
  })
  pdf.addImage(dataUrl, 'PNG', 0, 0, pageW, pageH)
  pdf.save(`${slugify(name)}.pdf`)
}

/**
 * Export the canvas as an SVG. SVG is vector and resolution-independent, so
 * there is no scale or quality option. fabric's toSVG serializes the artboard
 * (including its background) to markup, which we hand to the browser as a Blob.
 *
 * fabric 7 escapes text and gradient colour stops during SVG serialization
 * (the fix for the SVG-export stored-XSS advisories), so no extra sanitization
 * is needed here.
 */
export function exportSVG(canvas: fabric.Canvas, name: string) {
  const svg = canvas.toSVG()
  const blob = new Blob([svg], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  downloadUrl(url, `${slugify(name)}.svg`)
  // Free the object URL after the synchronous download click has fired.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
