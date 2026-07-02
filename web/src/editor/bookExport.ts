import * as fabric from 'fabric'
import type { jsPDF } from 'jspdf'
import type { PageData } from './storage'
import { slugify } from './exporters'

export type BookExportScope = 'all' | 'cover' | 'spreads'

/** Cut-mark length/gap in px at the book pages' own 300dpi resolution — a
 *  print-standard ~3mm mark, offset from the trim line into the bleed margin. */
const CUT_MARK_LEN = 38
const CUT_MARK_GAP = 10

function scopedPages(pages: PageData[], scope: BookExportScope): PageData[] {
  if (scope === 'cover') return pages.filter((p) => p.type === 'cover')
  if (scope === 'spreads') return pages.filter((p) => p.type === 'spread')
  return pages
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
 * size, off-screen — never touches the live editing canvas (a StaticCanvas on
 * a detached <canvas> element, same read-only render approach as preview.ts).
 */
async function renderPageDataUrl(page: PageData, width: number, height: number): Promise<string> {
  const el = document.createElement('canvas')
  const sc = new fabric.StaticCanvas(el, { width, height, backgroundColor: PRINT_FLATTEN_COLOR })
  await sc.loadFromJSON(page.canvas)
  // A transparent page (backgroundColor '') serializes with no `background` key
  // at all, so loadFromJSON restores it as undefined rather than leaving the
  // constructor's default in place — reassert the white flatten in that case.
  if (!sc.backgroundColor) sc.backgroundColor = PRINT_FLATTEN_COLOR
  sc.renderAll()
  const dataUrl = sc.toDataURL({ format: 'png', multiplier: 1 })
  sc.dispose()
  return dataUrl
}

/** Draw corner cut marks (+ centre spine marks, for spreads) onto a PDF page,
 *  offset from the trim line into the bleed margin (UX-015). */
function drawCutMarks(pdf: jsPDF, width: number, height: number, bleed: number, isSpread: boolean) {
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(1)
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
  if (isSpread) {
    const midX = width / 2
    pdf.line(midX, bleed - CUT_MARK_GAP, midX, bleed - CUT_MARK_GAP - CUT_MARK_LEN)
    pdf.line(midX, height - bleed + CUT_MARK_GAP, midX, height - bleed + CUT_MARK_GAP + CUT_MARK_LEN)
  }
}

/**
 * Export a book project as a single multi-page PDF (UX-015): each page renders
 * off-screen at its own native size (a cover and its spreads can differ), with
 * cut marks drawn at each trim corner (+ the spine, for spreads). Bleed is
 * already baked into every page's width/height (set at book creation, UX-015
 * phase 2), so the PDF page dimensions include it with no extra math.
 */
export async function exportBookPDF(
  pages: PageData[],
  fallbackSize: { width: number; height: number },
  name: string,
  scope: BookExportScope,
) {
  const targets = scopedPages(pages, scope)
  if (targets.length === 0) return

  const { jsPDF: JsPDF } = await import('jspdf')
  const firstSize = pageDims(targets[0], fallbackSize)
  const pdf = new JsPDF({
    orientation: firstSize.width > firstSize.height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [firstSize.width, firstSize.height],
  })

  for (let i = 0; i < targets.length; i++) {
    const page = targets[i]
    const size = pageDims(page, fallbackSize)
    if (i > 0) pdf.addPage([size.width, size.height], size.width > size.height ? 'landscape' : 'portrait')
    const dataUrl = await renderPageDataUrl(page, size.width, size.height)
    pdf.addImage(dataUrl, 'PNG', 0, 0, size.width, size.height)
    if (typeof page.bleed === 'number') drawCutMarks(pdf, size.width, size.height, page.bleed, page.type === 'spread')
  }

  pdf.save(`${slugify(name)}.pdf`)
}
