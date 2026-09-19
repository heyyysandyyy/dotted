import { describe, it, expect, vi } from 'vitest'
import {
  EMPTY_SELECTION,
  blendByMask,
  combineSelection,
  featherMask,
  gestureOutline,
  hasSelection,
  normalizeSelection,
  renderSelectionMask,
  selectionEdges,
  wandSelect,
} from './selection'
import type { PhotoSelection, PolygonOp, WandOp } from './selection'
import { DEFAULT_GEOMETRY, planGeometry } from './geometry'
import { renderAdjustedImage } from './renderAdjustedImage'
import { DEFAULT_ADJUSTMENTS } from '../store/usePhotoEditorStore'

const rect = (x0: number, y0: number, x1: number, y1: number, mode: 'add' | 'subtract' = 'add'): PolygonOp => ({
  kind: 'polygon',
  mode,
  points: [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ],
})
const sel = (patch: Partial<PhotoSelection>): PhotoSelection => ({ ...EMPTY_SELECTION, ...patch })

function imageData(w: number, h: number, fill: (x: number, y: number) => number[]): ImageData {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(fill(x, y), (y * w + x) * 4)
  return { width: w, height: h, data, colorSpace: 'srgb' } as ImageData
}

/** A real canvas (node-canvas under jsdom) 100×50: left half red, right half blue. */
function splitSource() {
  const el = document.createElement('canvas')
  el.width = 100
  el.height = 50
  const ctx = el.getContext('2d')!
  ctx.fillStyle = '#ff0000'
  ctx.fillRect(0, 0, 50, 50)
  ctx.fillStyle = '#0000ff'
  ctx.fillRect(50, 0, 50, 50)
  return el
}

describe('selection model (PHOTO-011)', () => {
  it('counts only additions as a selection', () => {
    expect(hasSelection(EMPTY_SELECTION)).toBe(false)
    expect(hasSelection(sel({ ops: [rect(0, 0, 1, 1, 'subtract')] }))).toBe(false)
    expect(hasSelection(sel({ ops: [rect(0, 0, 1, 1)] }))).toBe(true)
  })

  it('combines: new replaces and un-inverts, add and subtract append', () => {
    const base = sel({ ops: [rect(0, 0, 0.5, 0.5)], inverted: true, feather: 20 })
    const fresh = combineSelection(base, rect(0.5, 0.5, 1, 1, 'subtract'), 'new')
    expect(fresh.ops).toHaveLength(1)
    expect(fresh.ops[0].mode).toBe('add')
    expect(fresh.inverted).toBe(false)
    expect(fresh.feather).toBe(20)

    const plain = sel({ ops: [rect(0, 0, 0.5, 0.5)] })
    expect(combineSelection(plain, rect(0, 0, 1, 1), 'add').ops.map((o) => o.mode)).toEqual(['add', 'add'])
    expect(combineSelection(plain, rect(0, 0, 1, 1), 'subtract').ops.map((o) => o.mode)).toEqual(['add', 'subtract'])
  })

  it('flips the op under an inverted selection, so add still adds to what you see', () => {
    const inverted = sel({ ops: [rect(0, 0, 0.5, 0.5)], inverted: true })
    expect(combineSelection(inverted, rect(0, 0, 1, 1), 'add').ops[1].mode).toBe('subtract')
    expect(combineSelection(inverted, rect(0, 0, 1, 1), 'subtract').ops[1].mode).toBe('add')
  })

  it('drops malformed ops and clamps feather', () => {
    const n = normalizeSelection(
      sel({
        ops: [
          { kind: 'polygon', mode: 'add', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
          { kind: 'wand', mode: 'add', seed: { x: Number.NaN, y: 0 }, tolerance: 10, contiguous: true },
          rect(0, 0, 1, 1),
        ],
        feather: 400,
      }),
    )
    expect(n.ops).toHaveLength(1)
    expect(n.feather).toBe(100)
  })
})

describe('wandSelect', () => {
  // Two black squares separated by a white column, plus a near-black pixel.
  const img = imageData(5, 3, (x) => (x === 2 ? [255, 255, 255, 255] : x === 4 ? [20, 20, 20, 255] : [0, 0, 0, 255]))

  it('floods only the connected region when contiguous', () => {
    const picked = wandSelect(img, 0, 0, 5, true)
    expect(Array.from(picked.slice(0, 5))).toEqual([1, 1, 0, 0, 0])
  })

  it('picks every similar pixel anywhere when not contiguous', () => {
    expect(Array.from(wandSelect(img, 0, 0, 5, false).slice(0, 5))).toEqual([1, 1, 0, 1, 0])
  })

  it('widens with tolerance', () => {
    expect(Array.from(wandSelect(img, 0, 0, 10, false).slice(0, 5))).toEqual([1, 1, 0, 1, 1])
  })
})

describe('gestureOutline', () => {
  it('turns a drag into a rectangle, whichever way it was dragged', () => {
    expect(gestureOutline('rect', [{ x: 30, y: 40 }, { x: 10, y: 20 }])).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 20 },
      { x: 30, y: 40 },
      { x: 10, y: 40 },
    ])
  })

  it('traces an ellipse inside the drag', () => {
    const pts = gestureOutline('ellipse', [{ x: 0, y: 0 }, { x: 40, y: 20 }])!
    expect(pts.length).toBeGreaterThan(16)
    for (const p of pts) expect(((p.x - 20) / 20) ** 2 + ((p.y - 10) / 10) ** 2).toBeCloseTo(1)
  })

  it('treats a tiny drag as a click', () => {
    expect(gestureOutline('rect', [{ x: 5, y: 5 }, { x: 6, y: 6 }])).toBeNull()
    expect(gestureOutline('lasso', [{ x: 5, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }])).toBeNull()
    expect(gestureOutline('wand', [{ x: 0, y: 0 }, { x: 50, y: 50 }])).toBeNull()
  })
})

describe('renderSelectionMask', () => {
  const source = splitSource()
  const identity = planGeometry(DEFAULT_GEOMETRY, 100, 50)

  it('is null when nothing is selected', () => {
    expect(renderSelectionMask(source, identity, 100, 50, EMPTY_SELECTION)).toBeNull()
  })

  it('covers a rectangle, minus a hole cut from it', () => {
    const mask = renderSelectionMask(source, identity, 100, 50, sel({ ops: [rect(0, 0, 0.5, 1), rect(0.1, 0.2, 0.2, 0.4, 'subtract')] }))!
    expect(mask[25 * 100 + 25]).toBe(255)
    expect(mask[25 * 100 + 75]).toBe(0)
    expect(mask[15 * 100 + 15]).toBe(0)
  })

  it('inverts', () => {
    const mask = renderSelectionMask(source, identity, 100, 50, sel({ ops: [rect(0, 0, 0.5, 1)], inverted: true }))!
    expect(mask[25 * 100 + 25]).toBe(0)
    expect(mask[25 * 100 + 75]).toBe(255)
  })

  it('stays on the same part of the photo through a rotation', () => {
    // The left half of the source; turned a quarter clockwise, that's the top half.
    const turned = planGeometry({ ...DEFAULT_GEOMETRY, quarterTurns: 1 }, 100, 50)
    const mask = renderSelectionMask(source, turned, turned.width, turned.height, sel({ ops: [rect(0, 0, 0.5, 1)] }))!
    expect(mask[25 * 50 + 25]).toBe(255)
    expect(mask[75 * 50 + 25]).toBe(0)
  })

  it('scales with the render: the same selection at half size covers the same part', () => {
    const mask = renderSelectionMask(source, identity, 50, 25, sel({ ops: [rect(0, 0, 0.5, 1)] }))!
    expect(mask[12 * 50 + 12]).toBe(255)
    expect(mask[12 * 50 + 37]).toBe(0)
  })

  it('picks with the wand from the source’s own colours', () => {
    const wand: WandOp = { kind: 'wand', mode: 'add', seed: { x: 0.9, y: 0.5 }, tolerance: 10, contiguous: true }
    const mask = renderSelectionMask(source, identity, 100, 50, sel({ ops: [wand] }))!
    expect(mask[25 * 100 + 90]).toBeGreaterThan(200)
    expect(mask[25 * 100 + 10]).toBeLessThan(55)
  })

  it('feathers the edge into a gradient', () => {
    const hard = renderSelectionMask(source, identity, 100, 50, sel({ ops: [rect(0, 0, 0.5, 1)] }))!
    const soft = renderSelectionMask(source, identity, 100, 50, sel({ ops: [rect(0, 0, 0.5, 1)], feather: 100 }))!
    const at = (m: Uint8ClampedArray, x: number) => m[25 * 100 + x]
    expect(at(hard, 48)).toBe(255)
    expect(at(soft, 48)).toBeGreaterThan(0)
    expect(at(soft, 48)).toBeLessThan(255)
    expect(at(soft, 52)).toBeGreaterThan(0)
    expect(at(soft, 10)).toBe(255)
  })
})

describe('mask helpers', () => {
  it('featherMask leaves a flat mask flat', () => {
    const m = new Uint8ClampedArray(64).fill(255)
    featherMask(m, 8, 8, 2)
    expect(Array.from(m).every((v) => v === 255)).toBe(true)
  })

  it('blendByMask keeps adjusted pixels inside, originals outside, and mixes at the edge', () => {
    const original = imageData(3, 1, () => [0, 0, 0, 255])
    const adjusted = imageData(3, 1, () => [200, 100, 50, 255])
    blendByMask(adjusted, original, Uint8ClampedArray.from([255, 0, 128]))
    expect(Array.from(adjusted.data)).toEqual([200, 100, 50, 255, 0, 0, 0, 255, 100, 50, 25, 255])
  })

  it('selectionEdges finds the boundary pixels only', () => {
    const m = new Uint8ClampedArray(25)
    for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) m[y * 5 + x] = 255
    const edges = Array.from(selectionEdges(m, 5, 5))
    expect(edges).not.toContain(12)
    expect(edges).toHaveLength(8)
  })
})

describe('renderAdjustedImage inside a selection (PHOTO-011)', () => {
  it('applies the adjustment only where selected', () => {
    const source = splitSource()
    const plan = planGeometry(DEFAULT_GEOMETRY, 100, 50)
    const out = document.createElement('canvas')
    const adjustments = { ...DEFAULT_ADJUSTMENTS, invert: true, selection: sel({ ops: [rect(0, 0, 0.25, 1)] }) }
    renderAdjustedImage(out, source, 100, 50, adjustments, plan)
    const data = out.getContext('2d')!.getImageData(0, 0, 100, 50).data
    const px = (x: number, y: number) => Array.from(data.slice((y * 100 + x) * 4, (y * 100 + x) * 4 + 4))
    // Inside: red inverted to cyan. Outside, still red — and blue untouched.
    expect(px(10, 25)).toEqual([0, 255, 255, 255])
    expect(px(40, 25)).toEqual([255, 0, 0, 255])
    expect(px(80, 25)).toEqual([0, 0, 255, 255])
  })
})

describe('mask caching (PHOTO-011)', () => {
  it('reuses a mask across renders of the same selection, at each size', async () => {
    const mod = await import('./selection')
    const spy = vi.spyOn(mod, 'renderSelectionMask')
    const source = splitSource()
    const plan = planGeometry(DEFAULT_GEOMETRY, 100, 50)
    const adjustments = { ...DEFAULT_ADJUSTMENTS, invert: true, selection: sel({ ops: [rect(0, 0, 0.5, 1)] }) }
    const out = document.createElement('canvas')
    for (let i = 0; i < 3; i++) {
      renderAdjustedImage(out, source, 100, 50, adjustments, plan)
      renderAdjustedImage(out, source, 50, 25, adjustments, plan)
    }
    expect(spy).toHaveBeenCalledTimes(2)
    spy.mockRestore()
  })
})
