import { describe, it, expect } from 'vitest'
import type * as fabric from 'fabric'
import { isText, isShape, layerName, kindName, toColorString } from './utils'

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

describe('toColorString', () => {
  it('returns a plain hex when fully opaque', () => {
    expect(toColorString('#ff0000', 100)).toBe('#ff0000')
  })
  it('returns an rgba string when translucent', () => {
    expect(toColorString('#ff0000', 50)).toBe('rgba(255, 0, 0, 0.5)')
    expect(toColorString('#000000', 0)).toBe('rgba(0, 0, 0, 0)')
  })
})
