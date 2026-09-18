import type * as fabric from 'fabric'
import { downloadUrl } from './utils'
import { drawProductCutLines, productCutLinesSVG } from './productGuides'
import { fontFaceMarkup, withFontFaces } from './svgFonts'
import { isEffectClone } from './effectsEngine'
import type { ProductGuideSpec } from './products'

/**
 * The print-product page being exported, when there is one (PROD-001).
 *
 * Its cut line is composited into the export — that's the guide a printer or
 * a button maker actually needs, the same way exportBookPDF draws cut marks
 * into a book PDF. The bleed tint and safe-zone circle are screen-only and
 * never come along.
 */
export type CutLines = ProductGuideSpec | null | undefined

/**
 * The region of the artboard an export covers, in untransformed (scene)
 * coordinates — the artboard's own space, where (0,0) is its top-left corner
 * whatever the on-screen zoom and pan (UX-028).
 *
 * Every format crops to one of these, so nothing on the pasteboard around the
 * artboard ever reaches a file: the whole artboard for a full export, or the
 * selection's box clipped to the artboard for a selection export.
 */
export interface ExportBounds {
  left: number
  top: number
  width: number
  height: number
}

/**
 * What an export covers. `selection` narrows it to those objects: everything
 * else is left out of the render and the output is cropped to their box.
 * Absent or empty means the full artboard.
 */
export interface ExportScopeOptions {
  selection?: readonly fabric.FabricObject[] | null
  cutLines?: CutLines
}

export interface RasterExportOptions extends ExportScopeOptions {
  /** Output pixels per artboard pixel (1 = native size). */
  scale?: number
}

/** The largest canvas edge browsers will reliably allocate; a bigger export
 *  comes back blank rather than failing loudly, so the dialog refuses it. */
export const MAX_EXPORT_EDGE = 16384

/** The custom-scale field's range. The upper end is generous — the
 *  MAX_EXPORT_EDGE check is what actually bounds a large artboard. */
export const MIN_EXPORT_SCALE = 0.1
export const MAX_EXPORT_SCALE = 10

/** File extensions a user might type into the file-name field themselves. */
const EXPORT_EXTENSIONS = /\.(png|jpe?g|pdf|svg)$/i
/** Windows device names, which can't be used as a file name with any extension. */
const RESERVED_NAMES = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i
const MAX_FILE_NAME_LENGTH = 120

/**
 * Make a user-typed file name safe to save (UX-028): the characters no
 * mainstream filesystem accepts (`<>:"/\|?*` and control characters) are
 * dropped, whitespace is collapsed, leading dots (hidden files) and trailing
 * dots/spaces (which Windows strips) are removed, an extension the user typed
 * is dropped so it isn't doubled, and a Windows device name gets a suffix.
 * Case and spaces are kept — it's the user's name for their file.
 */
export function sanitizeFileName(name: string): string {
  let s = name
    .replace(/\s+/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim()
    .replace(EXPORT_EXTENSIONS, '')
    .replace(/^[.\s]+/, '')
    .slice(0, MAX_FILE_NAME_LENGTH)
    .replace(/[.\s]+$/, '')
  if (RESERVED_NAMES.test(s)) s = `${s}_`
  return s || 'design'
}

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

type WithId = fabric.FabricObject & { id?: string; effectHostId?: string }

/** The selected objects plus the synthetic effect visuals (drop shadow, glow,
 *  inner shadow) that belong to them — a selection export of a shadowed shape
 *  should carry its shadow. */
function selectionVisuals(
  canvas: fabric.Canvas,
  selection: readonly fabric.FabricObject[],
): fabric.FabricObject[] {
  const ids = new Set(selection.map((o) => (o as WithId).id).filter((id): id is string => !!id))
  const effects = canvas
    .getObjects()
    .filter((o) => isEffectClone(o) && ids.has((o as WithId).effectHostId ?? ''))
  return [...selection, ...effects]
}

/**
 * The region an export covers: the whole artboard, or — for a selection — the
 * box around the selected objects (and their effect visuals) clipped to the
 * artboard, rounded out to whole pixels. `null` when the selection lies
 * entirely off the artboard, so there is nothing to export.
 */
export function exportBounds(
  canvas: fabric.Canvas,
  selection?: readonly fabric.FabricObject[] | null,
): ExportBounds | null {
  const { width, height } = artboardSize(canvas)
  if (!selection || selection.length === 0) return { left: 0, top: 0, width, height }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const obj of selectionVisuals(canvas, selection)) {
    // Scene-plane box: fabric 7 resolves any parent group's transform and
    // ignores the viewport, so zoom/pan and in-place group editing don't skew it.
    const r = obj.getBoundingRect()
    minX = Math.min(minX, r.left)
    minY = Math.min(minY, r.top)
    maxX = Math.max(maxX, r.left + r.width)
    maxY = Math.max(maxY, r.top + r.height)
  }
  const left = Math.max(0, Math.floor(minX))
  const top = Math.max(0, Math.floor(minY))
  const right = Math.min(width, Math.ceil(maxX))
  const bottom = Math.min(height, Math.ceil(maxY))
  if (right <= left || bottom <= top) return null
  return { left, top, width: right - left, height: bottom - top }
}

/** Resolve the options' scope to bounds, or explain why there are none. */
function requireBounds(canvas: fabric.Canvas, opts: ExportScopeOptions): ExportBounds {
  const bounds = exportBounds(canvas, opts.selection)
  if (!bounds) throw new Error('The selection is entirely outside the artboard')
  return bounds
}

type ToSVG = fabric.FabricObject['toSVG']

/** Hidden state of one object, as it was before an export touched it. */
interface Saved {
  obj: fabric.FabricObject
  visible: boolean
  /** An own-property toSVG the object already had (normally none — it's the
   *  prototype's), to put back afterwards. */
  ownToSVG: ToSVG | undefined
}

/** Mark an object's group ancestors dirty, so their render caches are
 *  rebuilt with a child's changed visibility. */
function dirtyAncestors(obj: fabric.FabricObject) {
  for (let p = obj.parent; p; p = p.parent) p.dirty = true
}

const emptySVG: ToSVG = () => ''

/**
 * Run an export render with everything outside the selection taken out of it
 * (UX-028's selection scope), then put back exactly as it was.
 *
 * A dropped object is hidden from the raster render (`visible`) and
 * serializes to nothing (an own `toSVG` returning '', shadowing the
 * prototype's). Not `excludeFromExport`: fabric's canvas honours that for
 * top-level objects, but a group serializes every child regardless — a
 * hidden one merely gets `visibility: hidden`, so its content would still be
 * in the file.
 *
 * A selected object keeps its whole subtree; a group that only *contains* a
 * selected object (in-place group editing, UX-016) stays in the render so its
 * transform applies, but its other children are dropped. Direct property
 * writes like the background swap below, never a store change — nothing here
 * reaches history.
 */
function withOnlySelection<T>(
  canvas: fabric.Canvas,
  selection: readonly fabric.FabricObject[] | null | undefined,
  fn: () => T,
): T {
  if (!selection || selection.length === 0) return fn()
  const keep = new Set(selectionVisuals(canvas, selection))
  const ancestors = new Set<fabric.FabricObject>()
  for (const obj of selection) for (let p = obj.parent; p; p = p.parent) ancestors.add(p)

  const saved: Saved[] = []
  const visit = (obj: fabric.FabricObject) => {
    if (keep.has(obj)) return
    if (ancestors.has(obj)) {
      for (const child of (obj as fabric.Group).getObjects()) visit(child)
      return
    }
    const ownToSVG = Object.prototype.hasOwnProperty.call(obj, 'toSVG') ? obj.toSVG : undefined
    saved.push({ obj, visible: obj.visible, ownToSVG })
    obj.visible = false
    obj.toSVG = emptySVG
    dirtyAncestors(obj)
  }
  canvas.getObjects().forEach(visit)

  try {
    return fn()
  } finally {
    for (const { obj, visible, ownToSVG } of saved) {
      obj.visible = visible
      if (ownToSVG) obj.toSVG = ownToSVG
      else delete (obj as Partial<Pick<fabric.FabricObject, 'toSVG'>>).toSVG
      dirtyAncestors(obj)
    }
    canvas.requestRenderAll()
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

/**
 * Run an export render with the canvas's before:/after:render hooks suspended.
 *
 * Fabric nulls the upper-canvas context while building the export image
 * (toCanvasElement), and the CLR-004 alignment-guides extension's
 * before:render handler clears that now-undefined context — which throws and
 * aborts every export. Guides never belong in an export, so we detach the
 * render hooks for the duration and restore them afterwards.
 */
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

/** Every export render goes through the same three guards. */
function exportRender<T>(canvas: fabric.Canvas, selection: ExportScopeOptions['selection'], fn: () => T): T {
  return atNativeArtboard(canvas, () =>
    withoutRenderHooks(canvas, () => withOnlySelection(canvas, selection, fn)),
  )
}

/**
 * The export region as a data URL, with the product cut line composited on
 * top when there is one.
 *
 * Without cut lines this is fabric's own toDataURL, cropped to `bounds` — the
 * path every non-product design takes. With them, the region is rendered to a
 * canvas element first so the outlines can be stroked onto the finished
 * raster at the export's own scale, positioned where the artboard falls in it.
 */
function rasterDataUrl(
  canvas: fabric.Canvas,
  format: 'png' | 'jpeg',
  scale: number,
  bounds: ExportBounds,
  quality: number | undefined,
  opts: ExportScopeOptions,
): string {
  const { cutLines } = opts
  return exportRender(canvas, opts.selection, () => {
    if (!cutLines) return canvas.toDataURL({ format, quality, multiplier: scale, ...bounds })
    const element = canvas.toCanvasElement(scale, bounds)
    const ctx = element.getContext('2d')
    if (ctx) {
      const artboard = artboardSize(canvas)
      drawProductCutLines(
        ctx,
        {
          x: -bounds.left * scale,
          y: -bounds.top * scale,
          width: artboard.width * scale,
          height: artboard.height * scale,
        },
        cutLines,
        scale,
      )
    }
    return element.toDataURL(format === 'png' ? 'image/png' : 'image/jpeg', quality)
  })
}

/** Append the cut-line circles inside fabric's own `</svg>`. Matched from the
 *  end: an embedded image could carry the string earlier in the markup. */
export function withCutLinesSVG(
  svg: string,
  size: { width: number; height: number },
  cutLines: CutLines,
): string {
  if (!cutLines) return svg
  const close = svg.lastIndexOf('</svg>')
  if (close < 0) return svg
  return svg.slice(0, close) + productCutLinesSVG(cutLines, size) + svg.slice(close)
}

type Background = fabric.Canvas['backgroundColor']

/**
 * Run `fn` with the canvas background swapped for `background` (a colour, or
 * '' for none), restoring colour and image afterwards. `dropImage` also takes
 * the background image out for the duration.
 */
function withBackground<T>(
  canvas: fabric.Canvas,
  background: Background,
  dropImage: boolean,
  fn: () => T,
): T {
  const prevBg = canvas.backgroundColor
  const prevImage = canvas.backgroundImage
  canvas.backgroundColor = background
  if (dropImage) canvas.backgroundImage = undefined
  try {
    return fn()
  } finally {
    canvas.backgroundColor = prevBg
    canvas.backgroundImage = prevImage
    canvas.renderAll()
  }
}

/** Fallback fill used when the artboard has no opaque background. */
const FLATTEN_COLOR = '#ffffff'

/** The artboard's own background colour, or white when it has none — what a
 *  format without alpha (or an opaque PNG) is flattened onto, since an empty
 *  background would otherwise come out black. */
function opaqueBackground(canvas: fabric.Canvas): Background {
  return canvas.backgroundColor || FLATTEN_COLOR
}

export interface PNGExportOptions extends RasterExportOptions {
  /**
   * Leave the background out (UX-028, default on): the background colour is
   * set to '' — the empty string, the project's "transparent" — and any
   * background image is dropped, both restored afterwards. Off, the PNG is
   * opaque: the background colour as set, or white when there is none.
   */
  transparent?: boolean
}

/** Export the export region as a PNG. */
export function exportPNG(canvas: fabric.Canvas, name: string, opts: PNGExportOptions = {}) {
  const { scale = 1, transparent = true } = opts
  const bounds = requireBounds(canvas, opts)
  const dataUrl = withBackground(
    canvas,
    transparent ? '' : opaqueBackground(canvas),
    transparent,
    () => rasterDataUrl(canvas, 'png', scale, bounds, undefined, opts),
  )
  downloadUrl(dataUrl, `${sanitizeFileName(name)}.png`)
}

/** Default JPEG quality (0–1). 0.92 matches typical "high quality" exports. */
export const DEFAULT_JPEG_QUALITY = 0.92

export interface JPEGExportOptions extends RasterExportOptions {
  /** 0–1. */
  quality?: number
}

/**
 * Export the export region as a JPEG. JPEG has no alpha channel, so any
 * transparent area would otherwise render as black — we flatten onto a solid
 * background (the artboard's own colour, or white if it is transparent), then
 * restore.
 */
export function exportJPEG(canvas: fabric.Canvas, name: string, opts: JPEGExportOptions = {}) {
  const { scale = 1, quality = DEFAULT_JPEG_QUALITY } = opts
  const bounds = requireBounds(canvas, opts)
  const dataUrl = withBackground(canvas, opaqueBackground(canvas), false, () =>
    rasterDataUrl(canvas, 'jpeg', scale, bounds, quality, opts),
  )
  downloadUrl(dataUrl, `${sanitizeFileName(name)}.jpg`)
}

/**
 * Export the export region as a single-page PDF. The page matches the
 * region's logical dimensions; `scale` raises the embedded raster's
 * resolution (DPI) rather than the page size, so a 2× export is sharper, not
 * bigger.
 *
 * The region is embedded as a PNG so its background (and any transparency)
 * is reproduced exactly over the PDF's white page.
 *
 * jsPDF is a large dependency only needed for this path, so it is lazy-loaded
 * on demand to keep it out of the initial bundle.
 */
export async function exportPDF(canvas: fabric.Canvas, name: string, opts: RasterExportOptions = {}) {
  const { scale = 1 } = opts
  const bounds = requireBounds(canvas, opts)
  const { width: pageW, height: pageH } = bounds
  const dataUrl = rasterDataUrl(canvas, 'png', scale, bounds, undefined, opts)

  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({
    orientation: pageW > pageH ? 'landscape' : 'portrait',
    unit: 'px',
    format: [pageW, pageH],
  })
  pdf.addImage(dataUrl, 'PNG', 0, 0, pageW, pageH)
  pdf.save(`${sanitizeFileName(name)}.pdf`)
}

/**
 * Export the export region as an SVG. SVG is vector and resolution-
 * independent, so there is no scale or quality option. fabric's toSVG
 * serializes the canvas (including its background) to markup, and the viewBox
 * crops it to the region — the rest of the scene is outside the viewport.
 * The markup is handed to the browser as a Blob.
 *
 * fabric's markup names each font but carries none of it, so the fonts the
 * exported objects were set in are embedded as `@font-face` rules before the
 * file leaves the app — without them a viewer substitutes its own default
 * (BUG-006) and the export does not match the design. Fetching those faces is
 * what makes this export async; a fetch failure just falls back to naming the
 * font.
 *
 * fabric 7 escapes text and gradient colour stops during SVG serialization
 * (the fix for the SVG-export stored-XSS advisories), so no extra sanitization
 * is needed here.
 */
export async function exportSVG(canvas: fabric.Canvas, name: string, opts: ExportScopeOptions = {}) {
  const bounds = requireBounds(canvas, opts)
  const { left, top, width, height } = bounds
  const svg = exportRender(canvas, opts.selection, () =>
    canvas.toSVG({ width: `${width}`, height: `${height}`, viewBox: { x: left, y: top, width, height } }),
  )
  const fontSources = opts.selection?.length ? opts.selection : canvas.getObjects()
  const withFonts = withFontFaces(svg, await fontFaceMarkup(fontSources))
  // The cut line is drawn in artboard coordinates, like everything else the
  // viewBox crops, so it lands in place whatever the region.
  const blob = new Blob([withCutLinesSVG(withFonts, artboardSize(canvas), opts.cutLines)], {
    type: 'image/svg+xml',
  })
  const url = URL.createObjectURL(blob)
  downloadUrl(url, `${sanitizeFileName(name)}.svg`)
  // Free the object URL after the synchronous download click has fired.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
