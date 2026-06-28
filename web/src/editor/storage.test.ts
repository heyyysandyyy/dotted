import { describe, it, expect, beforeEach } from 'vitest'
import type * as fabric from 'fabric'
import {
  CURRENT_DESIGN_KEY,
  serializeDesign,
  saveCurrentDesign,
  loadCurrentDesign,
} from './storage'

// Minimal canvas stand-in — storage only ever calls toObject(props).
const fakeCanvas = (obj: object): fabric.Canvas =>
  ({ toObject: () => obj }) as unknown as fabric.Canvas

describe('storage', () => {
  beforeEach(() => localStorage.clear())

  it('serializeDesign captures width, height and the canvas json', () => {
    const data = serializeDesign(fakeCanvas({ objects: [] }), 800, 600)
    expect(data).toEqual({ width: 800, height: 600, canvas: { objects: [] } })
  })

  it('saves and loads a design round-trip', () => {
    const ok = saveCurrentDesign(fakeCanvas({ objects: [{ type: 'rect' }] }), 400, 300)
    expect(ok).toBe(true)
    expect(loadCurrentDesign()).toEqual({
      width: 400,
      height: 300,
      canvas: { objects: [{ type: 'rect' }] },
    })
  })

  it('returns null when nothing is saved', () => {
    expect(loadCurrentDesign()).toBeNull()
  })

  it('returns null on corrupt json (fail soft)', () => {
    localStorage.setItem(CURRENT_DESIGN_KEY, '{not json')
    expect(loadCurrentDesign()).toBeNull()
  })

  it('saveCurrentDesign fails soft when serialization throws', () => {
    const throwing = {
      toObject: () => {
        throw new Error('boom')
      },
    } as unknown as fabric.Canvas
    expect(saveCurrentDesign(throwing, 1, 1)).toBe(false)
  })
})
