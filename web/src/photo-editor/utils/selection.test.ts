import { describe, it, expect, vi } from 'vitest'
import {
  EMPTY_SELECTION,
  brushRadius,
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
import type { GradientOp, PhotoSelection, PolygonOp, StrokeOp, WandOp } from './selection'
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

describe('brush strokes (PHOTO-011 phase 3)', () => {
  const source = splitSource()
  const identity = planGeometry(DEFAULT_GEOMETRY, 100, 50)
  const stroke = (patch: Partial<StrokeOp> = {}): StrokeOp => ({
    kind: 'stroke',
    mode: 'add',
    points: [
      { x: 0.2, y: 0.5 },
      { x: 0.4, y: 0.5 },
    ],
    radius: brushRadius(25),
    hardness: 100,
    ...patch,
  })

  it('paints along the path, at the stored radius, and nowhere else', () => {
    const mask = renderSelectionMask(source, identity, 100, 50, sel({ ops: [stroke()] }))!
    const at = (x: number, y: number) => mask[y * 100 + x]
    // radius = 25% of 0.2 × the shorter edge (50px) = 2.5px around the path.
    expect(at(30, 25)).toBe(255)
    expect(at(20, 25)).toBe(255)
    expect(at(30, 32)).toBe(0)
    expect(at(80, 25)).toBe(0)
  })

  it('dabs a single point for a click', () => {
    const mask = renderSelectionMask(source, identity, 100, 50, sel({ ops: [stroke({ points: [{ x: 0.5, y: 0.5 }] })] }))!
    expect(mask[25 * 100 + 50]).toBe(255)
    expect(mask[25 * 100 + 70]).toBe(0)
  })

  it('softens the edge as hardness drops', () => {
    const partial = (m: Uint8ClampedArray) => {
      let n = 0
      for (let y = 0; y < 50; y++) {
        const v = m[y * 100 + 30]
        if (v > 8 && v < 247) n++
      }
      return n
    }
    const hard = renderSelectionMask(source, identity, 100, 50, sel({ ops: [stroke({ hardness: 100 })] }))!
    const soft = renderSelectionMask(source, identity, 100, 50, sel({ ops: [stroke({ hardness: 0 })] }))!
    // A hard stroke only has antialiasing at its rim; a soft one ramps.
    expect(hard[25 * 100 + 30]).toBe(255)
    expect(partial(soft)).toBeGreaterThan(partial(hard) + 2)
  })

  it('erases when subtracting', () => {
    const ops = [rect(0, 0, 1, 1), stroke({ mode: 'subtract' })]
    const mask = renderSelectionMask(source, identity, 100, 50, sel({ ops }))!
    expect(mask[25 * 100 + 30]).toBe(0)
    expect(mask[25 * 100 + 80]).toBe(255)
  })

  it('keeps its thickness relative to the photo at any render size', () => {
    const full = renderSelectionMask(source, identity, 100, 50, sel({ ops: [stroke()] }))!
    const half = renderSelectionMask(source, identity, 50, 25, sel({ ops: [stroke()] }))!
    const rowCoverage = (m: Uint8ClampedArray, w: number, y: number) => {
      let n = 0
      for (let x = 0; x < w; x++) if (m[y * w + x] > 128) n++
      return n / w
    }
    expect(rowCoverage(half, 50, 12)).toBeCloseTo(rowCoverage(full, 100, 25), 1)
  })
})

describe('gradient masks (PHOTO-011 phase 3)', () => {
  const source = splitSource()
  const identity = planGeometry(DEFAULT_GEOMETRY, 100, 50)

  it('fades a graduated mask from full at the start to nothing at the end', () => {
    const op: GradientOp = { kind: 'gradient', mode: 'add', shape: 'linear', from: { x: 0, y: 0.5 }, to: { x: 1, y: 0.5 } }
    const mask = renderSelectionMask(source, identity, 100, 50, sel({ ops: [op] }))!
    const at = (x: number) => mask[25 * 100 + x]
    expect(at(0)).toBeGreaterThan(250)
    expect(at(99)).toBeLessThan(5)
    expect(at(50)).toBeGreaterThan(100)
    expect(at(50)).toBeLessThan(160)
    // Monotonic across the frame.
    expect(at(20)).toBeGreaterThan(at(70))
  })

  it('fades a radial mask outward from its centre', () => {
    const op: GradientOp = { kind: 'gradient', mode: 'add', shape: 'radial', from: { x: 0.5, y: 0.5 }, to: { x: 0.8, y: 0.5 } }
    const mask = renderSelectionMask(source, identity, 100, 50, sel({ ops: [op] }))!
    expect(mask[25 * 100 + 50]).toBeGreaterThan(240)
    expect(mask[25 * 100 + 65]).toBeGreaterThan(50)
    expect(mask[25 * 100 + 95]).toBeLessThan(5)
  })

  it('follows the photo through a rotation', () => {
    // Full at the source's left edge; turned a quarter clockwise that's the top.
    const turned = planGeometry({ ...DEFAULT_GEOMETRY, quarterTurns: 1 }, 100, 50)
    const op: GradientOp = { kind: 'gradient', mode: 'add', shape: 'linear', from: { x: 0, y: 0.5 }, to: { x: 1, y: 0.5 } }
    const mask = renderSelectionMask(source, turned, turned.width, turned.height, sel({ ops: [op] }))!
    expect(mask[2 * 50 + 25]).toBeGreaterThan(240)
    expect(mask[97 * 50 + 25]).toBeLessThan(15)
  })
})
