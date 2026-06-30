import { describe, it, expect, vi } from 'vitest'
import type * as fabric from 'fabric'
import { readStyle, applyStyle, distributeStarts } from './storeHelpers'

// Minimal object stub — these helpers only read props, set(), and type.
const obj = (props: Record<string, unknown>) =>
  ({ set: vi.fn(), setCoords: vi.fn(), ...props }) as unknown as fabric.FabricObject

describe('readStyle', () => {
  it('reads only the style props the object defines', () => {
    const r = obj({ type: 'rect', fill: '#f00', stroke: '#111', strokeWidth: 2, opacity: 1 })
    expect(readStyle(r)).toEqual({ fill: '#f00', stroke: '#111', strokeWidth: 2, opacity: 1 })
  })
  it('keeps rx/ry only for rects', () => {
    expect(readStyle(obj({ type: 'rect', fill: '#000', rx: 8, ry: 8 }))).toMatchObject({ rx: 8, ry: 8 })
    // An ellipse's rx is a radius, not a border radius — don't copy it.
    expect(readStyle(obj({ type: 'ellipse', fill: '#000', rx: 50 })).rx).toBeUndefined()
  })
})

describe('applyStyle', () => {
  it('applies only props compatible with (already present on) the target', () => {
    const rect = obj({ type: 'rect', fill: '#000', stroke: '#000', opacity: 1 })
    applyStyle(rect, { fill: '#0f0', fontFamily: 'Roboto', opacity: 0.5 })
    // font props skipped (rect has no fontFamily); fill/opacity applied.
    expect(rect.set).toHaveBeenCalledWith({ fill: '#0f0', opacity: 0.5 })
  })
  it('skips rx/ry on non-rects', () => {
    const ellipse = obj({ type: 'ellipse', fill: '#000', rx: 50 })
    applyStyle(ellipse, { rx: 8, fill: '#fff' })
    expect(ellipse.set).toHaveBeenCalledWith({ fill: '#fff' })
  })
})

describe('distributeStarts', () => {
  it('spaces equal-width items with equal gaps, outer edges fixed', () => {
    // three 10-wide items spanning 0..100 → gaps of (70/2)=35
    const out = distributeStarts([
      { start: 0, size: 10 },
      { start: 40, size: 10 },
      { start: 90, size: 10 },
    ])
    expect(out).toEqual([0, 45, 90])
  })
  it('accounts for differing sizes', () => {
    // sizes 10, 20, 10 across 0..100 → free space 60, gap 30
    const out = distributeStarts([
      { start: 0, size: 10 },
      { start: 30, size: 20 },
      { start: 90, size: 10 },
    ])
    expect(out).toEqual([0, 40, 90])
  })
})
