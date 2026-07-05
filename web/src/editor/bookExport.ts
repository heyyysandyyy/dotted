import * as fabric from 'fabric'
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
 *  interior directly — "both" (PrintFileScope) isn't a single export call,
 *  it's the modal calling this twice, once per label (PrintExportModal.tsx). */
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

/**
 * Export a book project's cover and/or interior as a print-oriented PDF or
 * PNG (BOOK-004) — cover and interior are always separate files (jsPDF has
 * no cross-document bundling; "both" just runs this twice, see
 * PrintExportModal.tsx). Each page renders off-screen at its own native
 * size; cut marks are drawn as PDF vector lines, never baked into the
 * canvas content itself.
 */
export async function exportBookPrint(
  pages: PageData[],
  fallbackSize: { width: number; height: number },
  name: string,
  fileLabel: 'cover' | 'interior',
  options: PrintExportOptions,
): Promise<void> {
  const targets = targetPages(pages, fileLabel, options.pageRange)
  if (targets.length === 0) return

  if (options.format === 'png') {
    // PNG has no multi-page concept — export one file per page in range.
    const multiplier = options.resolution / BOOK_DPI
    for (const page of targets) {
      const { pageSize, imageOffset, fullSize } = pageAndImageRect(page, fallbackSize, options.includeBleed)
      const dataUrl = await renderPageDataUrl(page, fullSize.width, fullSize.height, multiplier)
      if (imageOffset.x === 0 && imageOffset.y === 0) {
        downloadDataUrl(dataUrl, `${slugify(name)}-${fileLabel}${targets.length > 1 ? `-${targets.indexOf(page) + 1}` : ''}.png`)
      } else {
        // Crop to trim by drawing onto a canvas sized to the trim, offset —
        // toDataURL/addImage's "page boundary crops overflow" trick only
        // works for jsPDF; PNG needs an actual crop.
        const cropped = document.createElement('canvas')
        cropped.width = Math.round(pageSize.width * multiplier)
        cropped.height = Math.round(pageSize.height * multiplier)
        const ctx = cropped.getContext('2d')!
        const img = await loadImage(dataUrl)
        ctx.drawImage(img, imageOffset.x * multiplier, imageOffset.y * multiplier)
        downloadDataUrl(cropped.toDataURL('image/png'), `${slugify(name)}-${fileLabel}.png`)
      }
    }
    return
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

  pdf.save(`${slugify(name)}-${fileLabel}.pdf`)
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
