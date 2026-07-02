import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fabric from 'fabric'
import type { PageData } from './storage'

const addPage = vi.fn()
const addImage = vi.fn()
const line = vi.fn()
const setDrawColor = vi.fn()
const setLineWidth = vi.fn()
const save = vi.fn()

// Stand in for jsPDF so tests exercise our page-scoping/cut-mark logic without
// depending on real PDF byte generation or a browser download (jsPDF's .save()
// drives an anchor click, not worth wiring up in jsdom).
class FakeJsPDF {
  addPage = addPage
  addImage = addImage
  line = line
  setDrawColor = setDrawColor
  setLineWidth = setLineWidth
  save = save
}
vi.mock('jspdf', () => ({ jsPDF: FakeJsPDF }))

import { exportBookPDF } from './bookExport'

const blankCanvas = { objects: [] }

function page(overrides: Partial<PageData>): PageData {
  return { id: crypto.randomUUID(), canvas: blankCanvas, ...overrides }
}

describe('exportBookPDF', () => {
  beforeEach(() => {
    addPage.mockClear()
    addImage.mockClear()
    line.mockClear()
    save.mockClear()
  })

  it('scope "all" exports every page, one PDF page each', async () => {
    const cover = page({ type: 'cover', width: 200, height: 300, bleed: 20 })
    const spread1 = page({ type: 'spread', width: 400, height: 300, bleed: 20 })
    const spread2 = page({ type: 'spread', width: 400, height: 300, bleed: 20 })
    await exportBookPDF([cover, spread1, spread2], { width: 200, height: 300 }, 'My Book', 'all')

    expect(addImage).toHaveBeenCalledTimes(3)
    // The first page uses the constructor's own format; every page after
    // calls addPage to start a new one.
    expect(addPage).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenCalledWith('my-book.pdf')
  })

  it('scope "cover" exports only the cover page', async () => {
    const cover = page({ type: 'cover', width: 200, height: 300, bleed: 20 })
    const spread = page({ type: 'spread', width: 400, height: 300, bleed: 20 })
    await exportBookPDF([cover, spread], { width: 200, height: 300 }, 'B', 'cover')
    expect(addImage).toHaveBeenCalledTimes(1)
    expect(addPage).not.toHaveBeenCalled()
  })

  it('scope "spreads" exports only spread pages', async () => {
    const cover = page({ type: 'cover', width: 200, height: 300, bleed: 20 })
    const spread1 = page({ type: 'spread', width: 400, height: 300, bleed: 20 })
    const spread2 = page({ type: 'spread', width: 400, height: 300, bleed: 20 })
    await exportBookPDF([cover, spread1, spread2], { width: 200, height: 300 }, 'B', 'spreads')
    expect(addImage).toHaveBeenCalledTimes(2)
  })

  it('draws 4 corner cut marks (2 ticks each) for a cover', async () => {
    const cover = page({ type: 'cover', width: 200, height: 300, bleed: 20 })
    await exportBookPDF([cover], { width: 200, height: 300 }, 'B', 'cover')
    expect(line).toHaveBeenCalledTimes(8)
  })

  it('adds 2 spine cut marks on top of the corner marks for a spread', async () => {
    const spread = page({ type: 'spread', width: 400, height: 300, bleed: 20 })
    await exportBookPDF([spread], { width: 400, height: 300 }, 'B', 'spreads')
    expect(line).toHaveBeenCalledTimes(10)
  })

  it('does nothing when the scope matches no pages', async () => {
    const spread = page({ type: 'spread', width: 400, height: 300, bleed: 20 })
    await exportBookPDF([spread], { width: 400, height: 300 }, 'B', 'cover')
    expect(addImage).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })

  it('exports a page with no saved background without throwing (transparent-page flatten path)', async () => {
    // A page saved with a transparent background (backgroundColor '') serializes
    // with no `background` key at all — exactly what `blankCanvas` looks like
    // here — which is the case renderPageDataUrl's white-flatten guard covers.
    const cover = page({ type: 'cover', width: 200, height: 300, bleed: 20 })
    await expect(
      exportBookPDF([cover], { width: 200, height: 300 }, 'B', 'cover'),
    ).resolves.not.toThrow()
    expect(addImage).toHaveBeenCalledTimes(1)
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
