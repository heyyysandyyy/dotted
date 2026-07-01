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
 * Run an export render with the canvas's before:/after:render hooks suspended.
 *
 * Fabric nulls the upper-canvas context while building the export image
 * (toCanvasElement), and the CLR-004 alignment-guides extension's
 * before:render handler clears that now-undefined context — which throws and
 * aborts every export. Guides never belong in an export, so we detach the
 * render hooks for the duration and restore them afterwards.
 */
/**
 * The artboard's logical size. Since UX-013 the live canvas is viewport-sized
 * (zoom/pan live in its viewportTransform), so CanvasStage stashes the artboard
 * dimensions on the canvas; fall back to the canvas size for older setups/tests.
 */
export function artboardSize(canvas: fabric.Canvas): { width: number; height: number } {
  const a = (canvas as unknown as { __artboardSize?: { width: number; height: number } }).__artboardSize
  return {
    width: a?.width ?? canvas.getWidth(),
    height: a?.height ?? canvas.getHeight(),
  }
}

/**
 * Run an export render with the viewport transform reset to identity, so the
 * artboard renders at its native position/scale regardless of the current
 * on-screen zoom and pan (fabric bakes the viewport zoom into exports).
 */
function atNativeArtboard<T>(canvas: fabric.Canvas, fn: () => T): T {
  const vpt = canvas.viewportTransform
  canvas.viewportTransform = [1, 0, 0, 1, 0, 0]
  try {
    return fn()
  } finally {
    canvas.viewportTransform = vpt
  }
}

function withoutRenderHooks<T>(canvas: fabric.Canvas, fn: () => T): T {
  const listeners = (canvas as unknown as { __eventListeners?: Record<string, unknown[]> })
    .__eventListeners
  if (!listeners) return fn()
  const before = listeners['before:render']
  const after = listeners['after:render']
  listeners['before:render'] = []
  listeners['after:render'] = []
  try {
    return fn()
  } finally {
    if (before) listeners['before:render'] = before
    if (after) listeners['after:render'] = after
  }
}

/**
 * Export the canvas as a PNG at native pixel dimensions. PNG preserves alpha,
 * so the artboard is exported exactly as set — the result is transparent only
 * when the user's canvas background is transparent (CLR-001).
 */
export function exportPNG(canvas: fabric.Canvas, name: string, scale = 1) {
  const { width, height } = artboardSize(canvas)
  const dataUrl = atNativeArtboard(canvas, () =>
    withoutRenderHooks(canvas, () =>
      canvas.toDataURL({ format: 'png', multiplier: scale, width, height }),
    ),
  )
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
  const { width, height } = artboardSize(canvas)
  const prevBg = canvas.backgroundColor
  // An empty/undefined background would flatten to black in JPEG; use white.
  if (!prevBg || typeof prevBg !== 'string') canvas.backgroundColor = JPEG_FLATTEN_COLOR
  canvas.renderAll()

  let dataUrl: string
  try {
    dataUrl = atNativeArtboard(canvas, () =>
      withoutRenderHooks(canvas, () =>
        canvas.toDataURL({ format: 'jpeg', quality, multiplier: scale, width, height }),
      ),
    )
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
  const { width: pageW, height: pageH } = artboardSize(canvas)
  const dataUrl = atNativeArtboard(canvas, () =>
    withoutRenderHooks(canvas, () =>
      canvas.toDataURL({ format: 'png', multiplier: scale, width: pageW, height: pageH }),
    ),
  )

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
  const { width, height } = artboardSize(canvas)
  const svg = atNativeArtboard(canvas, () =>
    withoutRenderHooks(canvas, () =>
      canvas.toSVG({ width: `${width}`, height: `${height}`, viewBox: { x: 0, y: 0, width, height } }),
    ),
  )
  const blob = new Blob([svg], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  downloadUrl(url, `${slugify(name)}.svg`)
  // Free the object URL after the synchronous download click has fired.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
