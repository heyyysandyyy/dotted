import { describe, it, expect, vi, beforeEach } from 'vitest'
import type * as fabric from 'fabric'

// Capture downloads instead of touching the DOM.
vi.mock('./utils', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('./utils')
  return { ...actual, downloadUrl: vi.fn() }
})

vi.mock('./productGuides', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('./productGuides')
  return { ...actual, drawProductGuides: vi.fn() }
})
vi.mock('./pageGuides', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('./pageGuides')
  return { ...actual, drawPageGuides: vi.fn() }
})

import { slugify, exportPNG, exportJPEG, exportSVG, withCutLinesSVG } from './exporters'
import { downloadUrl } from './utils'
import { drawProductGuides } from './productGuides'
import { drawPageGuides } from './pageGuides'
import { findProductTemplate, productGuideSpec } from './products'

const drawProductGuidesMock = vi.mocked(drawProductGuides)
const drawPageGuidesMock = vi.mocked(drawPageGuides)

const downloadMock = vi.mocked(downloadUrl)

/**
 * A minimal stand-in for the Fabric canvas that reproduces the export crash:
 * `toDataURL` nulls the upper-canvas context and fires the render hooks, exactly
 * like fabric's `toCanvasElement`. A guides-style `before:render` listener then
 * touches that nulled context and throws — unless the export suspends the hooks.
 */
/** The canvas element fabric hands back from toCanvasElement, with a context
 *  the cut-line pass can draw into. */
const exportCtx = {
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  arc: vi.fn(),
  stroke: vi.fn(),
  setLineDash: vi.fn(),
  strokeStyle: '',
  lineWidth: 0,
}
const exportedElement = {
  width: 825,
  height: 825,
  getContext: () => exportCtx,
  toDataURL: () => 'data:image/png;base64,WITHCUTLINE',
}

function makeCanvas() {
  const listeners: Record<string, Array<() => void>> = {
    'before:render': [],
    'after:render': [],
  }
  const canvas = {
    __eventListeners: listeners,
    backgroundColor: '#ffffff',
    topContext: { clearRect: () => {} } as { clearRect: (...a: number[]) => void } | undefined,
    renderAll() {},
    getWidth: () => 100,
    getHeight: () => 100,
    toDataURL() {
      return this._runExportRender('data:image/png;base64,AAAA')
    },
    toSVG() {
      return this._runExportRender('<svg></svg>')
    },
    // The cut-line path renders to a canvas element first so the circles can
    // be stroked onto the finished raster.
    toCanvasElement() {
      return this._runExportRender(exportedElement as unknown as string) as unknown as HTMLCanvasElement
    },
    _runExportRender(result: string) {
      const saved = this.topContext
      this.topContext = undefined // fabric nulls the upper context during export
      try {
        ;[...listeners['before:render']].forEach((h) => h())
        ;[...listeners['after:render']].forEach((h) => h())
        return result
      } finally {
        this.topContext = saved
      }
    },
  }
  // Alignment-guides-style hook: clears the top context, crashing when it's null.
  listeners['before:render'].push(() => {
    canvas.topContext!.clearRect(0, 0, 1, 1)
  })
  return canvas
}

describe('slugify', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugify('My Design')).toBe('my-design')
  })
  it('strips punctuation and collapses separators', () => {
    expect(slugify('Hello, World!!')).toBe('hello-world')
    expect(slugify('a@@@b')).toBe('a-b')
  })
  it('trims leading/trailing separators and whitespace', () => {
    expect(slugify('  spaced  ')).toBe('spaced')
    expect(slugify('--edge--')).toBe('edge')
  })
  it('falls back to "design" when empty', () => {
    expect(slugify('')).toBe('design')
    expect(slugify('   ')).toBe('design')
    expect(slugify('!!!')).toBe('design')
  })
})

describe('export render-hook regression (alignment guides)', () => {
  beforeEach(() => downloadMock.mockClear())

  it('reproduces the crash: a render hook throws when the export nulls the top context', () => {
    const canvas = makeCanvas()
    expect(() => canvas.toDataURL()).toThrow()
  })

  it('exportPNG survives the crashing hook and downloads a .png', () => {
    const canvas = makeCanvas() as unknown as fabric.Canvas
    expect(() => exportPNG(canvas, 'My Design')).not.toThrow()
    expect(downloadMock).toHaveBeenCalledWith('data:image/png;base64,AAAA', 'my-design.png')
  })

  it('exportJPEG survives the crashing hook and downloads a .jpg', () => {
    const canvas = makeCanvas() as unknown as fabric.Canvas
    expect(() => exportJPEG(canvas, 'My Design')).not.toThrow()
    expect(downloadMock).toHaveBeenCalledWith(expect.any(String), 'my-design.jpg')
  })

  it('restores the render hooks after exporting', () => {
    const canvas = makeCanvas()
    exportPNG(canvas as unknown as fabric.Canvas, 'x')
    // The before:render listener must be back so live snapping still works.
    expect(canvas.__eventListeners['before:render']).toHaveLength(1)
    // ...and still fires during a normal (non-export) render.
    expect(() => canvas.toDataURL()).toThrow()
  })
})

describe('exports never carry the screen-only guides (PROD-001, UX-015)', () => {
  beforeEach(() => {
    downloadMock.mockClear()
    drawProductGuidesMock.mockClear()
    drawPageGuidesMock.mockClear()
    // exportSVG hands its markup to the browser as an object URL, which jsdom
    // has no implementation for.
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:svg', revokeObjectURL: () => {} })
  })

  it('paints no bleed tint or safe-zone ring into an export — those are screen aids', () => {
    const canvas = makeCanvas() as unknown as fabric.Canvas

    exportPNG(canvas, 'pins')
    exportJPEG(canvas, 'pins')
    exportSVG(canvas, 'pins')

    expect(downloadMock).toHaveBeenCalledTimes(3)
    // drawProductGuides is the screen painter (tint + cut line + safe zone).
    // Only the cut line belongs on paper, and it gets there through
    // drawProductCutLines — see the cut-line suite below. If anyone ever
    // routes an export through the screen painter, this catches it.
    expect(drawProductGuidesMock).not.toHaveBeenCalled()
    expect(drawPageGuidesMock).not.toHaveBeenCalled()
  })
})

describe('the cut line goes to paper, the rest of the guides do not (PROD-001)', () => {
  const SPEC = productGuideSpec(findProductTemplate('pin-2-25')!)

  beforeEach(() => {
    downloadMock.mockClear()
    exportCtx.arc.mockClear()
    exportCtx.stroke.mockClear()
  })

  it('composites the trim circle into a raster export', () => {
    const canvas = makeCanvas() as unknown as fabric.Canvas

    exportPNG(canvas, 'pins', 1, SPEC)

    // Rendered through the canvas-element path, then stroked and downloaded.
    expect(exportCtx.arc).toHaveBeenCalledTimes(1)
    expect(exportCtx.stroke).toHaveBeenCalledTimes(1)
    expect(downloadMock).toHaveBeenCalledWith('data:image/png;base64,WITHCUTLINE', 'pins.png')
  })

  it('leaves a design with no product template on the plain fabric path', () => {
    const canvas = makeCanvas() as unknown as fabric.Canvas

    exportPNG(canvas, 'poster', 1, null)

    expect(exportCtx.arc).not.toHaveBeenCalled()
    expect(downloadMock).toHaveBeenCalledWith('data:image/png;base64,AAAA', 'poster.png')
  })

  it('still suspends the render hooks on the cut-line path', () => {
    const canvas = makeCanvas() as unknown as fabric.Canvas
    expect(() => exportJPEG(canvas, 'pins', 1, 0.9, SPEC)).not.toThrow()
  })
})

describe('withCutLinesSVG', () => {
  const SPEC = productGuideSpec(findProductTemplate('pin-2-25')!)

  it('inserts the circles inside the svg fabric produced', () => {
    const out = withCutLinesSVG('<svg><rect /></svg>', { width: 825, height: 825 }, SPEC)

    expect(out.startsWith('<svg><rect />')).toBe(true)
    expect(out.endsWith('</svg>')).toBe(true)
    expect(out).toContain('<circle')
  })

  it('matches the closing tag from the end, so an embedded one is not mistaken for it', () => {
    const embedded = '<svg><image href="data:image/svg+xml,%3Csvg%3E%3C/svg%3E" /></svg>'
    const out = withCutLinesSVG(embedded, { width: 825, height: 825 }, SPEC)

    expect(out.indexOf('<circle')).toBeGreaterThan(out.indexOf('<image'))
  })

  it('leaves a non-product design untouched', () => {
    expect(withCutLinesSVG('<svg></svg>', { width: 10, height: 10 }, null)).toBe('<svg></svg>')
  })
})
