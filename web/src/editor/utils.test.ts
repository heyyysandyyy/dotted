import { describe, it, expect } from 'vitest'
import type * as fabric from 'fabric'
import { isText, isShape, layerName, kindName, toColorString, alignDelta, readShadowEffect } from './utils'

// Minimal stand-ins — these helpers only read `type` (and `text`/`rx`).
const obj = (type: string, extra: Record<string, unknown> = {}) =>
  ({ type, ...extra }) as unknown as fabric.FabricObject

describe('isText', () => {
  it('is true for text-like objects', () => {
    expect(isText(obj('textbox'))).toBe(true)
    expect(isText(obj('i-text'))).toBe(true)
    expect(isText(obj('text'))).toBe(true)
  })
  it('is false for non-text and nullish', () => {
    expect(isText(obj('rect'))).toBe(false)
    expect(isText(null)).toBe(false)
    expect(isText(undefined)).toBe(false)
  })
})

describe('isShape', () => {
  it('is true for vector shapes', () => {
    expect(isShape(obj('rect'))).toBe(true)
    expect(isShape(obj('ellipse'))).toBe(true)
  })
  it('is false for text and images', () => {
    expect(isShape(obj('textbox'))).toBe(false)
    expect(isShape(obj('image'))).toBe(false)
  })
})

describe('layerName', () => {
  it('labels shapes and images', () => {
    expect(layerName(obj('image'))).toBe('Image')
    expect(layerName(obj('ellipse'))).toBe('Ellipse')
    expect(layerName(obj('rect'))).toBe('Rectangle')
    expect(layerName(obj('rect', { rx: 24 }))).toBe('Rounded rectangle')
    expect(layerName(obj('group'))).toBe('Group')
  })
  it('uses trimmed, truncated text for text layers', () => {
    expect(layerName(obj('textbox', { text: '  Hello  ' }))).toBe('Hello')
    expect(layerName(obj('textbox', { text: 'x'.repeat(40) }))).toBe('x'.repeat(20) + '…')
    expect(layerName(obj('textbox', { text: '   ' }))).toBe('Text')
  })
})

describe('kindName', () => {
  it('gives lower-case kinds for history labels', () => {
    expect(kindName(obj('textbox'))).toBe('text')
    expect(kindName(obj('image'))).toBe('image')
    expect(kindName(obj('rect'))).toBe('rectangle')
    expect(kindName(obj('path'))).toBe('arrow')
    expect(kindName(obj('group'))).toBe('group')
  })
  it('falls back to the type or "object"', () => {
    expect(kindName(obj('polygon'))).toBe('polygon')
    expect(kindName(null)).toBe('object')
  })
})

describe('alignDelta', () => {
  // Object 20×20 at (10,10) inside a 100×100 target.
  const r = { left: 10, top: 10, width: 20, height: 20 }
  const t = { left: 0, top: 0, width: 100, height: 100 }

  it('aligns horizontal edges/centre', () => {
    expect(alignDelta(r, t, 'left')).toEqual({ dx: -10, dy: 0 })
    expect(alignDelta(r, t, 'centerH')).toEqual({ dx: 30, dy: 0 }) // centre 50 vs 20
    expect(alignDelta(r, t, 'right')).toEqual({ dx: 70, dy: 0 }) // 100 vs 30
  })
  it('aligns vertical edges/centre', () => {
    expect(alignDelta(r, t, 'top')).toEqual({ dx: 0, dy: -10 })
    expect(alignDelta(r, t, 'middleV')).toEqual({ dx: 0, dy: 30 })
    expect(alignDelta(r, t, 'bottom')).toEqual({ dx: 0, dy: 70 })
  })
})

describe('toColorString', () => {
  it('returns a plain hex when fully opaque', () => {
    expect(toColorString('#ff0000', 100)).toBe('#ff0000')
  })
  it('returns an rgba string when translucent', () => {
    expect(toColorString('#ff0000', 50)).toBe('rgba(255, 0, 0, 0.5)')
    expect(toColorString('#000000', 0)).toBe('rgba(0, 0, 0, 0)')
  })
})

describe('readShadowEffect', () => {
  const withShadow = (shadow: unknown, shadowKind?: string, shadowSpread?: number) =>
    ({ shadow, shadowKind, shadowSpread }) as unknown as fabric.FabricObject

  it('returns null when there is no shadow', () => {
    expect(readShadowEffect(withShadow(null))).toBeNull()
    expect(readShadowEffect(withShadow(undefined))).toBeNull()
  })
  it('reads a drop shadow (kind from shadowKind), defaulting spread to 0 for a pre-UX-020 shadow', () => {
    const e = readShadowEffect(
      withShadow({ offsetX: 4, offsetY: 4, blur: 8, color: 'rgba(0,0,0,0.3)' }, 'drop'),
    )
    expect(e).toEqual({ kind: 'drop', x: 4, y: 4, blur: 8, spread: 0, color: 'rgba(0,0,0,0.3)' })
  })
  it('reads a saved spread value (UX-020)', () => {
    const e = readShadowEffect(
      withShadow({ offsetX: 4, offsetY: 4, blur: 8, color: 'rgba(0,0,0,0.3)' }, 'drop', 12),
    )
    expect(e?.spread).toBe(12)
  })
  it('infers glow from a zero-offset shadow when shadowKind is absent', () => {
    const e = readShadowEffect(withShadow({ offsetX: 0, offsetY: 0, blur: 12, color: '#fff' }))
    expect(e?.kind).toBe('glow')
  })
  it('infers drop from a non-zero offset when shadowKind is absent', () => {
    const e = readShadowEffect(withShadow({ offsetX: 2, offsetY: 0, blur: 6, color: '#000' }))
    expect(e?.kind).toBe('drop')
  })
})
