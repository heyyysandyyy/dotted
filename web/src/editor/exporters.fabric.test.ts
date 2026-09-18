import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fabric from 'fabric'
import { Image, createCanvas } from 'canvas'

// Capture the download instead of touching the DOM.
vi.mock('./utils', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('./utils')
  return { ...actual, downloadUrl: vi.fn() }
})

import { exportPNG, exportSVG } from './exporters'
import { downloadUrl } from './utils'

const downloadMock = vi.mocked(downloadUrl)

/**
 * The export-scope pass against real fabric rather than a stand-in (UX-028):
 * scene-plane bounding boxes under a zoomed/panned viewport, object hiding in
 * the raster render, and group children dropped from the SVG. The fake
 * canvases in exporters.test.ts can only assume those fabric behaviours.
 */

/** Decode the PNG handed to downloadUrl and read pixels out of it. */
function exportedPixels() {
  const dataUrl = downloadMock.mock.calls.at(-1)![0]
  const img = new Image()
  img.src = dataUrl
  const el = createCanvas(img.width, img.height)
  const ctx = el.getContext('2d')
  ctx.drawImage(img, 0, 0)
  return {
    width: img.width,
    height: img.height,
    at: (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data),
  }
}

// fabric 7 positions from the centre by default; these boxes read easier by corner.
const TOP_LEFT = { originX: 'left', originY: 'top' } as const

const RED = [255, 0, 0, 255]
const BLUE = [0, 0, 255, 255]
const CLEAR = [0, 0, 0, 0]

function scene() {
  const canvas = new fabric.Canvas(document.createElement('canvas'), { width: 800, height: 600 })
  // The artboard is 200×100; the live canvas is viewport-sized and zoomed
  // and panned, as CanvasStage leaves it (UX-013).
  ;(canvas as unknown as { __artboardSize: { width: number; height: number } }).__artboardSize = {
    width: 200,
    height: 100,
  }
  canvas.setViewportTransform([2, 0, 0, 2, 120, 80])
  canvas.backgroundColor = '#00ff00'
  const red = new fabric.Rect({ left: 10, top: 10, width: 20, height: 20, fill: '#ff0000', strokeWidth: 0, ...TOP_LEFT })
  const blue = new fabric.Rect({ left: 40, top: 10, width: 20, height: 20, fill: '#0000ff', strokeWidth: 0, ...TOP_LEFT })
  // Off the artboard, on the pasteboard.
  const stray = new fabric.Rect({ left: 250, top: 10, width: 20, height: 20, fill: '#0000ff', strokeWidth: 0, ...TOP_LEFT })
  canvas.add(red, blue, stray)
  return { canvas, red, blue, stray }
}

describe('export scope against real fabric (UX-028)', () => {
  beforeEach(() => downloadMock.mockClear())

  it('exports the artboard only, at native size, whatever the zoom and pan', () => {
    const { canvas } = scene()
    exportPNG(canvas, 'x', { transparent: false })

    const px = exportedPixels()
    expect([px.width, px.height]).toEqual([200, 100])
    expect(px.at(15, 15)).toEqual(RED)
    expect(px.at(45, 15)).toEqual(BLUE)
    expect(px.at(150, 50)).toEqual([0, 255, 0, 255])
    expect(canvas.viewportTransform).toEqual([2, 0, 0, 2, 120, 80])
  })

  it('exports a transparent PNG by default', () => {
    const { canvas } = scene()
    exportPNG(canvas, 'x')

    const px = exportedPixels()
    expect(px.at(150, 50)).toEqual(CLEAR)
    expect(canvas.backgroundColor).toBe('#00ff00')
  })

  it('crops to the selection and leaves out the rest, even where it overlaps the box', () => {
    const { canvas, red, blue } = scene()
    // Widen the red box over the blue one: the crop covers both, only red renders.
    red.set({ width: 60 })
    red.setCoords()
    exportPNG(canvas, 'x', { selection: [red] })

    const px = exportedPixels()
    expect([px.width, px.height]).toEqual([60, 20])
    expect(px.at(45, 5)).toEqual(RED) // red was drawn under blue on screen
    expect(blue.visible).toBe(true)
  })

  it('keeps a selection export inside the artboard', () => {
    const { canvas, red } = scene()
    red.set({ left: 190 })
    red.setCoords()
    exportPNG(canvas, 'x', { selection: [red] })

    expect(exportedPixels().width).toBe(10)
  })

  it('leaves a group’s unselected children out of an SVG', async () => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:svg', revokeObjectURL: () => {} })
    const canvas = new fabric.Canvas(document.createElement('canvas'), { width: 400, height: 300 })
    const keep = new fabric.Rect({ left: 0, top: 0, width: 10, height: 10, fill: '#123456', ...TOP_LEFT })
    const drop = new fabric.Rect({ left: 20, top: 0, width: 10, height: 10, fill: '#abcdef', ...TOP_LEFT })
    canvas.add(new fabric.Group([keep, drop]))
    let markup = ''
    const blobSpy = vi.spyOn(globalThis, 'Blob').mockImplementation(function (this: Blob, parts?: BlobPart[]) {
      markup = String(parts?.[0])
      return this
    } as unknown as typeof Blob)

    await exportSVG(canvas, 'x', { selection: [keep] })
    blobSpy.mockRestore()

    expect(markup).toContain('rgb(18,52,86)')
    expect(markup).not.toContain('rgb(171,205,239)')
    // Put back to the prototype's own serializer.
    expect(Object.prototype.hasOwnProperty.call(drop, 'toSVG')).toBe(false)
  })
})
