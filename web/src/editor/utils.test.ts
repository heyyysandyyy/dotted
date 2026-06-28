import { describe, it, expect } from 'vitest'
import type * as fabric from 'fabric'
import { isText, isShape, layerName } from './utils'

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
