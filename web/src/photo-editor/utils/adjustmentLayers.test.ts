import { describe, it, expect } from 'vitest'
import { renderAdjustedImage } from './renderAdjustedImage'
import { DEFAULT_GEOMETRY, planGeometry } from './geometry'
import { EMPTY_SELECTION } from './selection'
import type { PhotoSelection } from './selection'
import { DEFAULT_ADJUSTMENTS, DEFAULT_TONE } from '../store/usePhotoEditorStore'
import type { AdjustmentLayer, PhotoAdjustments, ToneAdjustments } from '../store/usePhotoEditorStore'

/** A real 100×50 canvas (node-canvas under jsdom), solid red. */
function redSource() {
  const el = document.createElement('canvas')
  el.width = 100
  el.height = 50
  const ctx = el.getContext('2d')!
  ctx.fillStyle = '#ff0000'
  ctx.fillRect(0, 0, 100, 50)
  return el
}

const leftHalf: PhotoSelection = {
  ...EMPTY_SELECTION,
  ops: [
    {
      kind: 'polygon',
      mode: 'add',
      points: [
        { x: 0, y: 0 },
        { x: 0.5, y: 0 },
        { x: 0.5, y: 1 },
        { x: 0, y: 1 },
      ],
    },
  ],
}

let n = 0
function layer(adjustments: Partial<ToneAdjustments>, patch: Partial<AdjustmentLayer> = {}): AdjustmentLayer {
  return {
    id: `l${n++}`,
    name: 'Layer',
    visible: true,
    opacity: 100,
    selection: EMPTY_SELECTION,
    adjustments: { ...DEFAULT_TONE, ...adjustments },
    ...patch,
  }
}

function render(adjustments: Partial<PhotoAdjustments>) {
  const source = redSource()
  const plan = planGeometry(DEFAULT_GEOMETRY, 100, 50)
  const out = document.createElement('canvas')
  renderAdjustedImage(out, source, 100, 50, { ...DEFAULT_ADJUSTMENTS, ...adjustments }, plan)
  const data = out.getContext('2d')!.getImageData(0, 0, 100, 50).data
  return (x: number, y: number) => Array.from(data.slice((y * 100 + x) * 4, (y * 100 + x) * 4 + 4))
}

const RED = [255, 0, 0, 255]
const CYAN = [0, 255, 255, 255]

describe('adjustment layers (PHOTO-011 phase 2)', () => {
  it('applies a layer only inside its own mask', () => {
    const at = render({ layers: [layer({ invert: true }, { selection: leftHalf })] })
    expect(at(10, 25)).toEqual(CYAN)
    expect(at(90, 25)).toEqual(RED)
  })

  it('covers the whole photo when the layer has no mask', () => {
    const at = render({ layers: [layer({ invert: true })] })
    expect(at(10, 25)).toEqual(CYAN)
    expect(at(90, 25)).toEqual(CYAN)
  })

  it('fades a layer by its opacity', () => {
    const at = render({ layers: [layer({ invert: true }, { opacity: 50 })] })
    const [r, g, b] = at(50, 25)
    expect(r).toBeGreaterThan(120)
    expect(r).toBeLessThan(135)
    expect(g).toBeGreaterThan(120)
    expect(g).toBeLessThan(135)
    expect(b).toBeGreaterThan(120)
  })

  it('skips a hidden layer', () => {
    const at = render({ layers: [layer({ invert: true }, { visible: false })] })
    expect(at(10, 25)).toEqual(RED)
  })

  it('applies layers in stack order, each on the result so far', () => {
    // Warming a pure red changes nothing (it's already all red), so warm-then-
    // invert is plain cyan; invert-then-warm warms the cyan. Invert and black
    // & white would be a useless pair here: they commute.
    const warmThenInvert = render({ layers: [layer({ temperature: 100 }), layer({ invert: true })] })(50, 25)
    const invertThenWarm = render({ layers: [layer({ invert: true }), layer({ temperature: 100 })] })(50, 25)
    expect(warmThenInvert).toEqual(CYAN)
    expect(invertThenWarm).not.toEqual(CYAN)
    expect(invertThenWarm[0] > 0 || invertThenWarm[2] < 255).toBe(true)
  })

  it('keeps the base adjustments and a layer independent', () => {
    // Base: invert inside the left half. Layer: black & white everywhere, on top.
    const at = render({ invert: true, selection: leftHalf, layers: [layer({ blackAndWhite: true })] })
    const left = at(10, 25)
    const right = at(90, 25)
    expect(left[0]).toBe(left[1])
    expect(right[0]).toBe(right[1])
    // Grey of cyan is lighter than grey of red.
    expect(left[0]).toBeGreaterThan(right[0])
  })
})
