import { describe, it, expect } from 'vitest'
import type * as fabric from 'fabric'
import {
  isText,
  isShape,
  isImage,
  layerName,
  kindName,
  toColorString,
  alignDelta,
  readShadowEffects,
  readShadowEffectByKind,
  shadowOptions,
} from './utils'

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

describe('isImage', () => {
  it('is true only for images', () => {
    expect(isImage(obj('image'))).toBe(true)
    expect(isImage(obj('rect'))).toBe(false)
    expect(isImage(obj('textbox'))).toBe(false)
    expect(isImage(null)).toBe(false)
    expect(isImage(undefined)).toBe(false)
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

describe('readShadowEffects (legacy single-effect fallback, pre-UX-020-phase-2)', () => {
  const withShadow = (shadow: unknown, shadowKind?: string, shadowSpread?: number) =>
    ({ shadow, shadowKind, shadowSpread }) as unknown as fabric.FabricObject

  it('returns an empty array when there is no shadow', () => {
    expect(readShadowEffects(withShadow(null))).toEqual([])
    expect(readShadowEffects(withShadow(undefined))).toEqual([])
  })
  it('reads a drop shadow (kind from shadowKind), defaulting spread to 0 for a pre-UX-020 shadow', () => {
    const [e] = readShadowEffects(withShadow({ offsetX: 4, offsetY: 4, blur: 8, color: 'rgba(0,0,0,0.3)' }, 'drop'))
    expect(e).toEqual({ kind: 'drop', x: 4, y: 4, blur: 8, spread: 0, color: 'rgba(0,0,0,0.3)' })
  })
  it('reads a saved spread value (UX-020 phase 1)', () => {
    const [e] = readShadowEffects(
      withShadow({ offsetX: 4, offsetY: 4, blur: 8, color: 'rgba(0,0,0,0.3)' }, 'drop', 12),
    )
    expect(e.spread).toBe(12)
  })
  it('infers glow from a zero-offset shadow when shadowKind is absent', () => {
    const [e] = readShadowEffects(withShadow({ offsetX: 0, offsetY: 0, blur: 12, color: '#fff' }))
    expect(e.kind).toBe('glow')
  })
  it('infers drop from a non-zero offset when shadowKind is absent', () => {
    const [e] = readShadowEffects(withShadow({ offsetX: 2, offsetY: 0, blur: 6, color: '#000' }))
    expect(e.kind).toBe('drop')
  })
})

describe('readShadowEffects / readShadowEffectByKind (UX-020 phase 2)', () => {
  const withEffects = (effects: unknown) => ({ effects }) as unknown as fabric.FabricObject

  it('prefers the new effects array over any legacy shadow prop', () => {
    const drop = { kind: 'drop' as const, x: 4, y: 4, blur: 8, spread: 0, color: '#000' }
    const obj = { effects: [drop], shadow: 'ignored-legacy-value' } as unknown as fabric.FabricObject
    expect(readShadowEffects(obj)).toEqual([drop])
  })
  it('returns both effects when two are active at once', () => {
    const drop = { kind: 'drop' as const, x: 4, y: 4, blur: 8, spread: 0, color: '#000' }
    const glow = { kind: 'glow' as const, x: 0, y: 0, blur: 12, spread: 0, color: '#fff' }
    expect(readShadowEffects(withEffects([drop, glow]))).toEqual([drop, glow])
    expect(readShadowEffectByKind(withEffects([drop, glow]), 'drop')).toEqual(drop)
    expect(readShadowEffectByKind(withEffects([drop, glow]), 'glow')).toEqual(glow)
  })
  it('readShadowEffectByKind returns null for a kind that is not active', () => {
    const drop = { kind: 'drop' as const, x: 4, y: 4, blur: 8, spread: 0, color: '#000' }
    expect(readShadowEffectByKind(withEffects([drop]), 'glow')).toBeNull()
  })
})

describe('shadowOptions (UX-020 — spread folds into blur, not geometry)', () => {
  it('adds spread directly onto blur, not a separate field', () => {
    const opts = shadowOptions({ kind: 'glow', x: 0, y: 0, blur: 12, spread: 20, color: '#fff' })
    expect(opts).toEqual({ color: '#fff', blur: 32, offsetX: 0, offsetY: 0 })
  })
  it('with zero spread, blur is unchanged', () => {
    const opts = shadowOptions({ kind: 'drop', x: 4, y: 4, blur: 8, spread: 0, color: '#000' })
    expect(opts.blur).toBe(8)
  })
})
