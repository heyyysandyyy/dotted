import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fabric from 'fabric'
import type { PageData } from './storage'

const addPage = vi.fn()
const addImage = vi.fn()
const line = vi.fn()
const setDrawColor = vi.fn()
const setLineWidth = vi.fn()
const output = vi.fn(() => new Blob(['fake-pdf-bytes']))

// Stand in for jsPDF so tests exercise our page-scoping/cut-mark logic without
// depending on real PDF byte generation.
class FakeJsPDF {
  addPage = addPage
  addImage = addImage
  line = line
  setDrawColor = setDrawColor
  setLineWidth = setLineWidth
  output = output
}
vi.mock('jspdf', () => ({ jsPDF: FakeJsPDF }))

import { exportBookPrint, exportBookPrintBoth, DEFAULT_PRINT_OPTIONS, type PrintExportOptions } from './bookExport'

const blankCanvas = { objects: [] }

function page(overrides: Partial<PageData>): PageData {
  return { id: crypto.randomUUID(), canvas: blankCanvas, ...overrides }
}

function opts(overrides: Partial<PrintExportOptions> = {}): PrintExportOptions {
  return { ...DEFAULT_PRINT_OPTIONS, ...overrides }
}

// jsdom doesn't implement URL.createObjectURL, and a real download would
// navigate the (fake) page — stub both so exportBookPrint's final download
// step is a no-op we can inspect instead of a crash.
let anchors: HTMLAnchorElement[]
beforeEach(() => {
  addPage.mockClear()
  addImage.mockClear()
  line.mockClear()
  setDrawColor.mockClear()
  output.mockClear()
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  URL.revokeObjectURL = vi.fn()
  anchors = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    anchors.push(this)
  })
})

describe('exportBookPrint — PDF', () => {
  it('fileLabel "cover" exports only the cover page, downloaded directly (one file, no zip)', async () => {
    const cover = page({ type: 'cover', width: 200, height: 300, bleed: 20 })
    const spread = page({ type: 'spread', width: 400, height: 300, bleed: 20 })
    await exportBookPrint([cover, spread], { width: 200, height: 300 }, 'My Book', 'cover', opts())
    expect(addImage).toHaveBeenCalledTimes(1)
    expect(addPage).not.toHaveBeenCalled()
    expect(output).toHaveBeenCalledWith('blob')
    expect(anchors).toHaveLength(1)
    expect(anchors[0].download).toBe('my-book-cover.pdf')
  })

  it('fileLabel "interior" exports every spread page, one PDF page each, as a single file', async () => {
    const cover = page({ type: 'cover', width: 200, height: 300, bleed: 20 })
    const spread1 = page({ type: 'spread', width: 400, height: 300, bleed: 20 })
    const spread2 = page({ type: 'spread', width: 400, height: 300, bleed: 20 })
    await exportBookPrint([cover, spread1, spread2], { width: 200, height: 300 }, 'B', 'interior', opts())
    expect(addImage).toHaveBeenCalledTimes(2)
    // The first page uses the constructor's own format; every page after
    // calls addPage to start a new one.
    expect(addPage).toHaveBeenCalledTimes(1)
    expect(anchors[0].download).toBe('b-interior.pdf')
  })

  it('a page range subsets which interior pages export', async () => {
    const spreads = [1, 2, 3, 4].map(() => page({ type: 'spread', width: 400, height: 300, bleed: 20 }))
    await exportBookPrint(spreads, { width: 400, height: 300 }, 'B', 'interior', opts({ pageRange: { from: 2, to: 3 } }))
    expect(addImage).toHaveBeenCalledTimes(2)
  })

  it('does nothing when fileLabel matches no pages', async () => {
    const spread = page({ type: 'spread', width: 400, height: 300, bleed: 20 })
    await exportBookPrint([spread], { width: 400, height: 300 }, 'B', 'cover', opts())
    expect(addImage).not.toHaveBeenCalled()
    expect(anchors).toHaveLength(0)
  })

  it('draws 4 corner cut marks (2 ticks each) for a cover when crop marks are on', async () => {
    const cover = page({ type: 'cover', width: 200, height: 300, bleed: 20 })
    await exportBookPrint([cover], { width: 200, height: 300 }, 'B', 'cover', opts())
    expect(line).toHaveBeenCalledTimes(8)
  })

  it('adds 2 spine cut marks on top of the corner marks for a spread', async () => {
    const spread = page({ type: 'spread', width: 400, height: 300, bleed: 20 })
    await exportBookPrint([spread], { width: 400, height: 300 }, 'B', 'interior', opts())
    expect(line).toHaveBeenCalledTimes(10)
  })

  it('crop marks off, spine marks on: only the 2 spine ticks draw', async () => {
    const spread = page({ type: 'spread', width: 400, height: 300, bleed: 20 })
    await exportBookPrint([spread], { width: 400, height: 300 }, 'B', 'interior', opts({ cropMarks: false }))
    expect(line).toHaveBeenCalledTimes(2)
  })

  it('both marks off: no lines drawn at all', async () => {
    const spread = page({ type: 'spread', width: 400, height: 300, bleed: 20 })
    await exportBookPrint(
      [spread],
      { width: 400, height: 300 },
      'B',
      'interior',
      opts({ cropMarks: false, spineMarks: false }),
    )
    expect(line).not.toHaveBeenCalled()
  })

  it('includeBleed false draws no marks at all, regardless of the mark toggles', async () => {
    const cover = page({ type: 'cover', width: 200, height: 300, bleed: 20 })
    await exportBookPrint([cover], { width: 200, height: 300 }, 'B', 'cover', opts({ includeBleed: false }))
    expect(line).not.toHaveBeenCalled()
    // Page (and image) shrink to the trim size — bleed stripped off each edge.
    expect(addImage).toHaveBeenCalledWith(expect.any(String), 'PNG', -20, -20, 200, 300)
  })

  it('CMYK colour profile sets a 4-channel draw colour for marks', async () => {
    const cover = page({ type: 'cover', width: 200, height: 300, bleed: 20 })
    await exportBookPrint([cover], { width: 200, height: 300 }, 'B', 'cover', opts({ colorProfile: 'cmyk' }))
    expect(setDrawColor).toHaveBeenCalledWith(0, 0, 0, 100)
  })

  it('RGB colour profile sets a 3-channel draw colour for marks', async () => {
    const cover = page({ type: 'cover', width: 200, height: 300, bleed: 20 })
    await exportBookPrint([cover], { width: 200, height: 300 }, 'B', 'cover', opts({ colorProfile: 'rgb' }))
    expect(setDrawColor).toHaveBeenCalledWith(0, 0, 0)
  })

  it('exports a page with no saved background without throwing (transparent-page flatten path)', async () => {
    // A page saved with a transparent background (backgroundColor '') serializes
    // with no `background` key at all — exactly what `blankCanvas` looks like
    // here — which is the case renderPageDataUrl's white-flatten guard covers.
    const cover = page({ type: 'cover', width: 200, height: 300, bleed: 20 })
    await expect(
      exportBookPrint([cover], { width: 200, height: 300 }, 'B', 'cover', opts()),
    ).resolves.not.toThrow()
    expect(addImage).toHaveBeenCalledTimes(1)
  })
})

describe('exportBookPrint — PNG', () => {
  it('a single-page PNG downloads directly, no zip', async () => {
    const cover = page({ type: 'cover', width: 200, height: 300, bleed: 20 })
    await exportBookPrint([cover], { width: 200, height: 300 }, 'B', 'cover', opts({ format: 'png' }))
    expect(addImage).not.toHaveBeenCalled()
    expect(anchors).toHaveLength(1)
    expect(anchors[0].download).toBe('b-cover.png')
  })

  it('a multi-page PNG interior bundles into one zip download instead of several direct downloads', async () => {
    // Regression test: browsers block/drop the second+ of several downloads
    // triggered back-to-back from one click without a fresh user gesture per
    // file — reported as "export only gives me the cover" for "Both files",
    // the same underlying issue as a multi-page PNG interior would hit.
    const spreads = [1, 2].map(() => page({ type: 'spread', width: 400, height: 300, bleed: 20 }))
    await exportBookPrint(spreads, { width: 400, height: 300 }, 'B', 'interior', opts({ format: 'png' }))
    expect(addImage).not.toHaveBeenCalled()
    // Exactly one download — the zip — not one per page.
    expect(anchors).toHaveLength(1)
    expect(anchors[0].download).toBe('b-interior.zip')
  })
})

describe('exportBookPrintBoth', () => {
  it('always bundles cover + interior into a single zip, never two separate downloads', async () => {
    const cover = page({ type: 'cover', width: 200, height: 300, bleed: 20 })
    const spread = page({ type: 'spread', width: 400, height: 300, bleed: 20 })
    await exportBookPrintBoth([cover, spread], { width: 200, height: 300 }, 'My Book', opts())
    expect(anchors).toHaveLength(1)
    expect(anchors[0].download).toBe('my-book-export.zip')
    // Both files actually got built into it: 2 PDF documents worth of content.
    expect(addImage).toHaveBeenCalledTimes(2)
  })
})

describe('fabric loadFromJSON background restore (documents the print-flatten fix)', () => {
  it('resets backgroundColor to falsy when the JSON has no background key', async () => {
    // A page with backgroundColor '' (transparent) serializes with the
    // `background` key omitted (fabric only writes it when truthy) — this
    // pins the fabric behaviour renderPageDataUrl's PRINT_FLATTEN_COLOR
    // reassertion in bookExport.ts depends on.
    const el = document.createElement('canvas')
    const sc = new fabric.StaticCanvas(el, { width: 10, height: 10, backgroundColor: '#ffffff' })
    await sc.loadFromJSON({ objects: [] })
    expect(sc.backgroundColor).toBeFalsy()
    sc.dispose()
  })
})
