import * as fabric from 'fabric'
import JSZip from 'jszip'
import type { jsPDF } from 'jspdf'
import type { PageData } from './storage'
import { slugify } from './exporters'
import { BOOK_DPI } from './constants'

/** Which file(s) a print export produces (BOOK-004). */
export type PrintFileScope = 'cover' | 'interior' | 'both'

/**
 * BOOK-004 print export options.
 *
 * `colorProfile` only affects the vector print marks (crop/spine/bleed
 * guides), drawn directly as PDF vector graphics — jsPDF's draw calls accept
 * real CMYK there. It does *not* make the page content itself CMYK: that
 * content is a rasterized PNG of the fabric canvas (canvas 2D is sRGB-only,
 * and there is no in-browser path to encode a CMYK JPEG), embedded as an
 * RGB image regardless of this setting. This means a "PDF/X-1a" export from
 * this app is not a genuinely compliant PDF/X-1a file — real compliance
 * requires zero RGB objects anywhere in the document, which a canvas-based,
 * client-only, no-backend architecture cannot produce. The format option is
 * kept (relabeled honestly in the UI) because it's still the right default
 * posture for print — CMYK marks, embedded fonts where possible — just not
 * a certifiable one.
 */
export interface PrintExportOptions {
  format: 'pdf' | 'png'
  colorProfile: 'cmyk' | 'rgb'
  /** PNG only: export resolution in dpi (page pixels are authored at BOOK_DPI). */
  resolution: number
  includeBleed: boolean
  cropMarks: boolean
  spineMarks: boolean
  /** 1-based inclusive page range within the interior (spread) pages only;
   *  null exports every interior page. Ignored when exporting the cover. */
  pageRange: { from: number; to: number } | null
}

export const DEFAULT_PRINT_OPTIONS: PrintExportOptions = {
  format: 'pdf',
  colorProfile: 'cmyk',
  resolution: BOOK_DPI,
  includeBleed: true,
  cropMarks: true,
  spineMarks: true,
  pageRange: null,
}

/** Cut-mark length/gap in px at the book pages' own 300dpi resolution — a
 *  print-standard ~3mm mark, offset from the trim line into the bleed margin. */
const CUT_MARK_LEN = 38
const CUT_MARK_GAP = 10

/** The pages one export call needs, in order. `fileLabel` picks cover vs.
 *  interior directly — "both" isn't a single call, see exportBookPrintBoth. */
function targetPages(pages: PageData[], fileLabel: 'cover' | 'interior', range: { from: number; to: number } | null): PageData[] {
  if (fileLabel === 'cover') return pages.filter((p) => p.type === 'cover')
  const spreads = pages.filter((p) => p.type === 'spread')
  if (!range) return spreads
  // 1-based, inclusive, clamped to the actual page count.
  const from = Math.max(1, range.from)
  const to = Math.min(spreads.length, range.to)
  return spreads.slice(from - 1, to)
}

function pageDims(page: PageData, fallback: { width: number; height: number }) {
  return { width: page.width ?? fallback.width, height: page.height ?? fallback.height }
}

/** Fallback fill for print: a page with a transparent background (backgroundColor
 *  === '') has nothing behind it once rasterized, unlike PNG/JPEG export where
 *  the surface it lands on is known — flatten to white paper instead. */
const PRINT_FLATTEN_COLOR = '#ffffff'

/**
 * Render one page's serialized canvas to a PNG data URL at its own native
 * size (times `multiplier`), off-screen — never touches the live editing
 * canvas (a StaticCanvas on a detached <canvas> element, same read-only
 * render approach as preview.ts).
 */
async function renderPageDataUrl(
  page: PageData,
  width: number,
  height: number,
  multiplier: number,
): Promise<string> {
  const el = document.createElement('canvas')
  const sc = new fabric.StaticCanvas(el, { width, height, backgroundColor: PRINT_FLATTEN_COLOR })
  await sc.loadFromJSON(page.canvas)
  // A transparent page (backgroundColor '') serializes with no `background` key
  // at all, so loadFromJSON restores it as undefined rather than leaving the
  // constructor's default in place — reassert the white flatten in that case.
  if (!sc.backgroundColor) sc.backgroundColor = PRINT_FLATTEN_COLOR
  sc.renderAll()
  const dataUrl = sc.toDataURL({ format: 'png', multiplier })
  sc.dispose()
  return dataUrl
}

/** Pure K black for CMYK marks (a "rich" 4-channel black reads muddier once
 *  printed) vs plain RGB black — the only place colorProfile has any real
 *  effect, since the page content itself is always an RGB raster. */
function setMarkColor(pdf: jsPDF, profile: PrintExportOptions['colorProfile']) {
  if (profile === 'cmyk') pdf.setDrawColor(0, 0, 0, 100)
  else pdf.setDrawColor(0, 0, 0)
}

/** Draw corner cut marks (+ centre spine marks, for spreads) onto a PDF page,
 *  offset from the trim line into the bleed margin (UX-015; toggles + colour
 *  profile added in BOOK-004). Meaningless without bleed actually present in
 *  the export (there's no bleed margin to mark up), so callers should only
 *  reach here when includeBleed is true. */
function drawCutMarks(
  pdf: jsPDF,
  width: number,
  height: number,
  bleed: number,
  isSpread: boolean,
  options: Pick<PrintExportOptions, 'colorProfile' | 'cropMarks' | 'spineMarks'>,
) {
  if (!options.cropMarks && !(isSpread && options.spineMarks)) return
  setMarkColor(pdf, options.colorProfile)
  pdf.setLineWidth(1)
  if (options.cropMarks) {
    const corners: [number, number, 1 | -1, 1 | -1][] = [
      [bleed, bleed, -1, -1],
      [width - bleed, bleed, 1, -1],
      [bleed, height - bleed, -1, 1],
      [width - bleed, height - bleed, 1, 1],
    ]
    for (const [cx, cy, dx, dy] of corners) {
      pdf.line(cx + dx * CUT_MARK_GAP, cy, cx + dx * (CUT_MARK_GAP + CUT_MARK_LEN), cy)
      pdf.line(cx, cy + dy * CUT_MARK_GAP, cx, cy + dy * (CUT_MARK_GAP + CUT_MARK_LEN))
    }
  }
  if (isSpread && options.spineMarks) {
    const midX = width / 2
    pdf.line(midX, bleed - CUT_MARK_GAP, midX, bleed - CUT_MARK_GAP - CUT_MARK_LEN)
    pdf.line(midX, height - bleed + CUT_MARK_GAP, midX, height - bleed + CUT_MARK_GAP + CUT_MARK_LEN)
  }
}

/** A page's full (bleed-inclusive) size, and — when includeBleed is off —
 *  the trim-only size the PDF page itself should be, with the full-size
 *  image offset so the page's own boundary crops away the bleed margin for
 *  free (a PDF page doesn't render content placed outside its own bounds). */
function pageAndImageRect(page: PageData, fallback: { width: number; height: number }, includeBleed: boolean) {
  const full = pageDims(page, fallback)
  const bleed = page.bleed ?? 0
  if (includeBleed || bleed === 0) {
    return { pageSize: full, imageOffset: { x: 0, y: 0 }, fullSize: full }
  }
  return {
    pageSize: { width: full.width - bleed * 2, height: full.height - bleed * 2 },
    imageOffset: { x: -bleed, y: -bleed },
    fullSize: full,
  }
}

function orientationOf(size: { width: number; height: number }): 'landscape' | 'portrait' {
  return size.width > size.height ? 'landscape' : 'portrait'
}

interface BuiltFile {
  blob: Blob
  filename: string
}

/** Build every file one export call needs, as in-memory blobs — nothing is
 *  downloaded here. PDF is always exactly one file (a multi-page document);
 *  PNG has no multi-page concept, so it's one file per targeted page. */
async function buildFiles(
  pages: PageData[],
  fallbackSize: { width: number; height: number },
  name: string,
  fileLabel: 'cover' | 'interior',
  options: PrintExportOptions,
): Promise<BuiltFile[]> {
  const targets = targetPages(pages, fileLabel, options.pageRange)
  if (targets.length === 0) return []

  if (options.format === 'png') {
    const multiplier = options.resolution / BOOK_DPI
    const files: BuiltFile[] = []
    for (let i = 0; i < targets.length; i++) {
      const page = targets[i]
      const { pageSize, imageOffset, fullSize } = pageAndImageRect(page, fallbackSize, options.includeBleed)
      const dataUrl = await renderPageDataUrl(page, fullSize.width, fullSize.height, multiplier)
      const suffix = targets.length > 1 ? `-${i + 1}` : ''
      const filename = `${slugify(name)}-${fileLabel}${suffix}.png`
      if (imageOffset.x === 0 && imageOffset.y === 0) {
        files.push({ blob: dataUrlToBlob(dataUrl), filename })
      } else {
        // Crop to trim by drawing onto a canvas sized to the trim, offset —
        // jsPDF's "page boundary crops overflow" trick only works for PDF
        // pages; PNG needs an actual crop.
        const cropped = document.createElement('canvas')
        cropped.width = Math.round(pageSize.width * multiplier)
        cropped.height = Math.round(pageSize.height * multiplier)
        const ctx = cropped.getContext('2d')!
        const img = await loadImage(dataUrl)
        ctx.drawImage(img, imageOffset.x * multiplier, imageOffset.y * multiplier)
        const blob = await new Promise<Blob>((resolve) => cropped.toBlob((b) => resolve(b!), 'image/png'))
        files.push({ blob, filename })
      }
    }
    return files
  }

  const { jsPDF: JsPDF } = await import('jspdf')
  const first = pageAndImageRect(targets[0], fallbackSize, options.includeBleed)
  const pdf = new JsPDF({ orientation: orientationOf(first.pageSize), unit: 'px', format: [first.pageSize.width, first.pageSize.height] })

  for (let i = 0; i < targets.length; i++) {
    const page = targets[i]
    const { pageSize, imageOffset, fullSize } = pageAndImageRect(page, fallbackSize, options.includeBleed)
    if (i > 0) pdf.addPage([pageSize.width, pageSize.height], orientationOf(pageSize))
    const dataUrl = await renderPageDataUrl(page, fullSize.width, fullSize.height, 1)
    pdf.addImage(dataUrl, 'PNG', imageOffset.x, imageOffset.y, fullSize.width, fullSize.height)
    if (options.includeBleed && typeof page.bleed === 'number') {
      drawCutMarks(pdf, fullSize.width, fullSize.height, page.bleed, page.type === 'spread', options)
    }
  }

  return [{ blob: pdf.output('blob'), filename: `${slugify(name)}-${fileLabel}.pdf` }]
}

/**
 * Export a book project's cover or interior as a print-oriented PDF or PNG
 * (BOOK-004). Downloads the file directly when there's exactly one (a PDF,
 * or a single-page PNG); bundles into a zip when there's more than one (a
 * multi-page PNG interior) — browsers block/silently drop the second and
 * later of several downloads triggered back-to-back without an explicit
 * click on each one, so more than one file from a single Export click has
 * to go out as one zip, not several direct downloads. See
 * exportBookPrintBoth for the cover+interior "Both files" case, which hits
 * this same constraint for the same reason.
 */
export async function exportBookPrint(
  pages: PageData[],
  fallbackSize: { width: number; height: number },
  name: string,
  fileLabel: 'cover' | 'interior',
  options: PrintExportOptions,
): Promise<void> {
  const files = await buildFiles(pages, fallbackSize, name, fileLabel, options)
  await downloadFiles(files, `${slugify(name)}-${fileLabel}.zip`)
}

/** "Both files" (BOOK-004): cover and interior are unconditionally zipped
 *  together, regardless of format — this is always at least 2 downloads
 *  otherwise, which browsers don't reliably allow back-to-back (see
 *  exportBookPrint's doc comment). */
export async function exportBookPrintBoth(
  pages: PageData[],
  fallbackSize: { width: number; height: number },
  name: string,
  options: PrintExportOptions,
): Promise<void> {
  const cover = await buildFiles(pages, fallbackSize, name, 'cover', options)
  const interior = await buildFiles(pages, fallbackSize, name, 'interior', options)
  await downloadFiles([...cover, ...interior], `${slugify(name)}-export.zip`)
}

async function downloadFiles(files: BuiltFile[], zipFilename: string): Promise<void> {
  if (files.length === 0) return
  if (files.length === 1) {
    downloadBlob(files[0].blob, files[0].filename)
    return
  }
  const zip = new JSZip()
  for (const f of files) zip.file(f.filename, f.blob)
  const zipBlob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(zipBlob, zipFilename)
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Decodes the base64 payload directly rather than `fetch(dataUrl).blob()` —
 *  the fetch route works in real browsers but produces a Blob jsdom's own
 *  FileReader (which JSZip uses internally) can't read in tests; this path
 *  has no such interop gap either way. */
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',')
  const mime = /data:(.*);base64/.exec(header)?.[1] ?? 'image/png'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
