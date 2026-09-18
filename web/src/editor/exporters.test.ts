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

import {
  sanitizeFileName,
  exportBounds,
  exportPNG,
  exportJPEG,
  exportSVG,
  withCutLinesSVG,
} from './exporters'
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
    // Empty: these cases assert on the guide painters, not on font embedding.
    getObjects: () => [] as unknown[],
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

describe('sanitizeFileName (UX-028)', () => {
  it('keeps the user’s own case and spaces', () => {
    expect(sanitizeFileName('My Design')).toBe('My Design')
  })
  it('drops characters filesystems reject, and control characters', () => {
    expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij')
    expect(sanitizeFileName('tab\there\u0000')).toBe('tab here')
  })
  it('collapses whitespace and trims leading dots and trailing dots/spaces', () => {
    expect(sanitizeFileName('  lots   of   space  ')).toBe('lots of space')
    expect(sanitizeFileName('..hidden')).toBe('hidden')
    expect(sanitizeFileName('trailing. . ')).toBe('trailing')
  })
  it('drops an export extension the user typed, so it is not doubled', () => {
    expect(sanitizeFileName('poster.png')).toBe('poster')
    expect(sanitizeFileName('poster.JPEG')).toBe('poster')
    expect(sanitizeFileName('v1.2 final')).toBe('v1.2 final')
  })
  it('suffixes Windows device names', () => {
    expect(sanitizeFileName('con')).toBe('con_')
    expect(sanitizeFileName('LPT1')).toBe('LPT1_')
  })
  it('caps the length', () => {
    expect(sanitizeFileName('x'.repeat(500))).toHaveLength(120)
  })
  it('falls back to "design" when nothing usable is left', () => {
    expect(sanitizeFileName('')).toBe('design')
    expect(sanitizeFileName('   ')).toBe('design')
    expect(sanitizeFileName('???')).toBe('design')
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
    expect(downloadMock).toHaveBeenCalledWith('data:image/png;base64,AAAA', 'My Design.png')
  })

  it('exportJPEG survives the crashing hook and downloads a .jpg', () => {
    const canvas = makeCanvas() as unknown as fabric.Canvas
    expect(() => exportJPEG(canvas, 'My Design')).not.toThrow()
    expect(downloadMock).toHaveBeenCalledWith(expect.any(String), 'My Design.jpg')
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

  it('paints no bleed tint or safe-zone ring into an export — those are screen aids', async () => {
    const canvas = makeCanvas() as unknown as fabric.Canvas

    exportPNG(canvas, 'pins')
    exportJPEG(canvas, 'pins')
    await exportSVG(canvas, 'pins')

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

    exportPNG(canvas, 'pins', { cutLines: SPEC })

    // Rendered through the canvas-element path, then stroked and downloaded.
    expect(exportCtx.arc).toHaveBeenCalledTimes(1)
    expect(exportCtx.stroke).toHaveBeenCalledTimes(1)
    expect(downloadMock).toHaveBeenCalledWith('data:image/png;base64,WITHCUTLINE', 'pins.png')
  })

  it('leaves a design with no product template on the plain fabric path', () => {
    const canvas = makeCanvas() as unknown as fabric.Canvas

    exportPNG(canvas, 'poster', { cutLines: null })

    expect(exportCtx.arc).not.toHaveBeenCalled()
    expect(downloadMock).toHaveBeenCalledWith('data:image/png;base64,AAAA', 'poster.png')
  })

  it('still suspends the render hooks on the cut-line path', () => {
    const canvas = makeCanvas() as unknown as fabric.Canvas
    expect(() => exportJPEG(canvas, 'pins', { quality: 0.9, cutLines: SPEC })).not.toThrow()
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

/** A scene object with the bits the scope pass reads: a scene-plane bounding
 *  box, visibility, an id, and (for groups) children with a `parent` link. */
interface FakeObj {
  id?: string
  effectHostId?: string
  visible: boolean
  dirty?: boolean
  toSVG: () => string
  parent?: FakeObj
  children?: FakeObj[]
  getBoundingRect: () => { left: number; top: number; width: number; height: number }
  getObjects: () => FakeObj[]
}

function obj(box: [number, number, number, number], extra: Partial<FakeObj> = {}): FakeObj {
  const [left, top, width, height] = box
  const o: FakeObj = {
    visible: true,
    toSVG: () => '<rect />',
    getBoundingRect: () => ({ left, top, width, height }),
    getObjects: () => o.children ?? [],
    ...extra,
  }
  o.children?.forEach((c) => (c.parent = o))
  return o
}

/** A canvas whose renders record what they saw: the options passed, which
 *  objects were visible/serializable, and the background at render time. */
function sceneCanvas(objects: FakeObj[], artboard = { width: 400, height: 300 }) {
  const all = (list: FakeObj[]): FakeObj[] => list.flatMap((o) => [o, ...all(o.children ?? [])])
  const seen = {
    opts: undefined as Record<string, unknown> | undefined,
    visible: [] as FakeObj[],
    serialized: [] as FakeObj[],
    background: undefined as unknown,
    backgroundImage: undefined as unknown,
  }
  const canvas = {
    __artboardSize: artboard,
    viewportTransform: [2, 0, 0, 2, 50, 50],
    backgroundColor: '#ff0000' as string,
    backgroundImage: { kind: 'photo' } as unknown,
    getWidth: () => 1000,
    getHeight: () => 800,
    getObjects: () => objects,
    renderAll: vi.fn(),
    requestRenderAll: vi.fn(),
    toDataURL(opts: Record<string, unknown>) {
      seen.opts = opts
      seen.visible = all(objects).filter((o) => o.visible)
      seen.background = this.backgroundColor
      seen.backgroundImage = this.backgroundImage
      return 'data:image/png;base64,SCENE'
    },
    toSVG(opts: Record<string, unknown>) {
      seen.opts = opts
      seen.serialized = all(objects).filter((o) => o.toSVG() !== '')
      return '<svg></svg>'
    },
  }
  return { canvas, seen, asFabric: canvas as unknown as fabric.Canvas }
}

const asFabricObjs = (list: FakeObj[]) => list as unknown as fabric.FabricObject[]

describe('exportBounds (UX-028)', () => {
  it('is the whole artboard, in untransformed coordinates, for a full export', () => {
    const { asFabric } = sceneCanvas([])
    expect(exportBounds(asFabric)).toEqual({ left: 0, top: 0, width: 400, height: 300 })
    expect(exportBounds(asFabric, [])).toEqual({ left: 0, top: 0, width: 400, height: 300 })
  })

  it('wraps the selection, rounded out to whole pixels', () => {
    const a = obj([10.4, 20.6, 50, 30])
    const b = obj([100, 40, 20.2, 60])
    const { asFabric } = sceneCanvas([a, b])
    expect(exportBounds(asFabric, asFabricObjs([a, b]))).toEqual({ left: 10, top: 20, width: 111, height: 80 })
  })

  it('clips the selection to the artboard, so no pasteboard content gets in', () => {
    const hanging = obj([-40, 250, 100, 100])
    const { asFabric } = sceneCanvas([hanging])
    expect(exportBounds(asFabric, asFabricObjs([hanging]))).toEqual({ left: 0, top: 250, width: 60, height: 50 })
  })

  it('is null for a selection entirely off the artboard', () => {
    const off = obj([500, 10, 40, 40])
    const { asFabric } = sceneCanvas([off])
    expect(exportBounds(asFabric, asFabricObjs([off]))).toBeNull()
  })

  it('grows to take in the selection’s effect visuals', () => {
    const host = obj([100, 100, 50, 50], { id: 'h1' })
    const shadow = obj([110, 110, 60, 60], { effectHostId: 'h1' })
    const other = obj([0, 0, 10, 10], { effectHostId: 'someone-else' })
    const { asFabric } = sceneCanvas([shadow, host, other])
    expect(exportBounds(asFabric, asFabricObjs([host]))).toEqual({ left: 100, top: 100, width: 70, height: 70 })
  })
})

describe('every format crops to the export bounds (UX-028)', () => {
  beforeEach(() => {
    downloadMock.mockClear()
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:svg', revokeObjectURL: () => {} })
  })

  it('crops a raster to the artboard at identity zoom, then restores the viewport', () => {
    const { canvas, seen, asFabric } = sceneCanvas([])
    exportPNG(asFabric, 'x', { scale: 2 })
    expect(seen.opts).toMatchObject({ left: 0, top: 0, width: 400, height: 300, multiplier: 2 })
    expect(canvas.viewportTransform).toEqual([2, 0, 0, 2, 50, 50])
  })

  it('crops a raster to the selection box', () => {
    const a = obj([30, 40, 100, 50])
    const { seen, asFabric } = sceneCanvas([a])
    exportJPEG(asFabric, 'x', { selection: asFabricObjs([a]) })
    expect(seen.opts).toMatchObject({ left: 30, top: 40, width: 100, height: 50 })
  })

  it('crops an SVG with its viewBox', async () => {
    const a = obj([30, 40, 100, 50])
    const { seen, asFabric } = sceneCanvas([a])
    await exportSVG(asFabric, 'x', { selection: asFabricObjs([a]) })
    expect(seen.opts).toEqual({ width: '100', height: '50', viewBox: { x: 30, y: 40, width: 100, height: 50 } })
  })

  it('refuses a selection entirely off the artboard rather than exporting nothing', () => {
    const off = obj([900, 900, 10, 10])
    const { asFabric } = sceneCanvas([off])
    expect(() => exportPNG(asFabric, 'x', { selection: asFabricObjs([off]) })).toThrow(/outside the artboard/)
    expect(downloadMock).not.toHaveBeenCalled()
  })
})

describe('selection-only exports leave everything else out (UX-028)', () => {
  beforeEach(() => {
    downloadMock.mockClear()
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:svg', revokeObjectURL: () => {} })
  })

  it('renders only the selection and its effect visuals, then restores every object', () => {
    const host = obj([10, 10, 50, 50], { id: 'h1' })
    const glow = obj([5, 5, 60, 60], { effectHostId: 'h1' })
    const other = obj([100, 100, 50, 50])
    const hiddenByUser = obj([200, 100, 50, 50], { visible: false })
    const { seen, asFabric } = sceneCanvas([glow, host, other, hiddenByUser])

    exportPNG(asFabric, 'x', { selection: asFabricObjs([host]) })

    expect(seen.visible).toEqual([glow, host])
    expect(other.visible).toBe(true)
    expect(other.toSVG()).toBe('<rect />')
    // A layer the user hid stays hidden — the export only ever restores.
    expect(hiddenByUser.visible).toBe(false)
  })

  it('keeps a selected group whole', () => {
    const child = obj([10, 10, 20, 20])
    const group = obj([10, 10, 20, 20], { children: [child] })
    const other = obj([100, 100, 50, 50])
    const { seen, asFabric } = sceneCanvas([group, other])

    exportPNG(asFabric, 'x', { selection: asFabricObjs([group]) })

    expect(seen.visible).toEqual([group, child])
  })

  it('keeps a group being edited in place but hides its other children', () => {
    const picked = obj([10, 10, 20, 20])
    const sibling = obj([40, 10, 20, 20])
    const group = obj([10, 10, 50, 20], { children: [picked, sibling] })
    const { seen, asFabric } = sceneCanvas([group])

    exportPNG(asFabric, 'x', { selection: asFabricObjs([picked]) })

    expect(seen.visible).toEqual([group, picked])
    expect(sibling.visible).toBe(true)
    expect(group.dirty).toBe(true) // its cache is rebuilt with the sibling back
  })

  it('leaves the rest out of an SVG too', async () => {
    const a = obj([10, 10, 20, 20])
    const b = obj([40, 10, 20, 20])
    const { seen, asFabric } = sceneCanvas([a, b])

    await exportSVG(asFabric, 'x', { selection: asFabricObjs([a]) })

    expect(seen.serialized).toEqual([a])
    expect(b.toSVG()).toBe('<rect />')
  })
})

describe('PNG transparent-background toggle (UX-028)', () => {
  beforeEach(() => downloadMock.mockClear())

  it('is on by default: the background colour is emptied and the image dropped, then both restored', () => {
    const { canvas, seen, asFabric } = sceneCanvas([])
    const image = canvas.backgroundImage

    exportPNG(asFabric, 'x')

    expect(seen.background).toBe('')
    expect(seen.backgroundImage).toBeUndefined()
    expect(canvas.backgroundColor).toBe('#ff0000')
    expect(canvas.backgroundImage).toBe(image)
  })

  it('off, keeps the background as designed', () => {
    const { seen, asFabric } = sceneCanvas([])
    exportPNG(asFabric, 'x', { transparent: false })
    expect(seen.background).toBe('#ff0000')
    expect(seen.backgroundImage).toEqual({ kind: 'photo' })
  })

  it('off, flattens a transparent artboard onto white rather than leaving alpha', () => {
    const { canvas, seen, asFabric } = sceneCanvas([])
    canvas.backgroundColor = ''
    exportPNG(asFabric, 'x', { transparent: false })
    expect(seen.background).toBe('#ffffff')
    expect(canvas.backgroundColor).toBe('')
  })

  it('never applies to JPEG, which always flattens', () => {
    const { canvas, seen, asFabric } = sceneCanvas([])
    canvas.backgroundColor = ''
    exportJPEG(asFabric, 'x')
    expect(seen.background).toBe('#ffffff')
  })
})
