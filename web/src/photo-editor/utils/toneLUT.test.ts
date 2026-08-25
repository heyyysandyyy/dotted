import { describe, it, expect } from 'vitest'
import { buildToneLUT, applyToneLUT, needsToneMap } from './toneLUT'

const NEUTRAL = { exposure: 0, highlights: 0, shadows: 0 }

describe('needsToneMap', () => {
  it('is false when all three are neutral', () => {
    expect(needsToneMap(NEUTRAL)).toBe(false)
  })

  it('is true when any one control has moved', () => {
    expect(needsToneMap({ ...NEUTRAL, exposure: 10 })).toBe(true)
    expect(needsToneMap({ ...NEUTRAL, highlights: -10 })).toBe(true)
    expect(needsToneMap({ ...NEUTRAL, shadows: 10 })).toBe(true)
  })
})

describe('buildToneLUT', () => {
  it('is the identity mapping at neutral', () => {
    const lut = buildToneLUT(NEUTRAL)
    for (let v = 0; v < 256; v++) {
      expect(lut[v]).toBeGreaterThanOrEqual(v - 1)
      expect(lut[v]).toBeLessThanOrEqual(v + 1)
    }
    expect(lut[0]).toBe(0)
    expect(lut[255]).toBe(255)
  })

  it('positive exposure brightens the midtones', () => {
    const lut = buildToneLUT({ ...NEUTRAL, exposure: 50 })
    expect(lut[128]).toBeGreaterThan(128)
  })

  it('negative exposure darkens the midtones', () => {
    const lut = buildToneLUT({ ...NEUTRAL, exposure: -50 })
    expect(lut[128]).toBeLessThan(128)
  })

  it('exposure keeps pure black and pure white anchored (gamma round-trip through 0 and 1 is exact)', () => {
    const lut = buildToneLUT({ ...NEUTRAL, exposure: 80 })
    expect(lut[0]).toBe(0)
    expect(lut[255]).toBe(255)
  })

  it('positive shadows lifts dark tones but leaves bright tones alone', () => {
    const lut = buildToneLUT({ ...NEUTRAL, shadows: 100 })
    expect(lut[10]).toBeGreaterThan(10)
    expect(lut[250]).toBe(250)
  })

  it('positive highlights raises bright tones but leaves dark tones alone', () => {
    const lut = buildToneLUT({ ...NEUTRAL, highlights: 100 })
    expect(lut[245]).toBeGreaterThan(245)
    expect(lut[5]).toBe(5)
  })

  it('negative highlights pulls down bright tones without touching shadows', () => {
    const lut = buildToneLUT({ ...NEUTRAL, highlights: -100 })
    expect(lut[245]).toBeLessThan(245)
    expect(lut[5]).toBe(5)
  })

  it('clamps output to 0..255', () => {
    const lut = buildToneLUT({ exposure: 100, highlights: 100, shadows: 100 })
    for (let v = 0; v < 256; v++) {
      expect(lut[v]).toBeGreaterThanOrEqual(0)
      expect(lut[v]).toBeLessThanOrEqual(255)
    }
  })

  it('reuses the same table for repeated inputs instead of rebuilding it', () => {
    const first = buildToneLUT({ exposure: 20, highlights: -10, shadows: 30 })
    const second = buildToneLUT({ exposure: 20, highlights: -10, shadows: 30 })
    expect(second).toBe(first)
  })

  it('rebuilds when any of the three inputs changes', () => {
    const first = buildToneLUT({ exposure: 20, highlights: -10, shadows: 30 })
    const second = buildToneLUT({ exposure: 60, highlights: -10, shadows: 30 })
    expect(second).not.toBe(first)
    expect(second[200]).not.toBe(first[200])
  })
})

describe('applyToneLUT', () => {
  it('maps every RGB channel through the LUT and leaves alpha untouched', () => {
    const lut = new Uint8ClampedArray(256)
    for (let v = 0; v < 256; v++) lut[v] = 255 - v // invert, easy to assert on
    const data = new Uint8ClampedArray([10, 20, 30, 40, 200, 210, 220, 230])
    const imageData = { data, width: 2, height: 1 } as unknown as ImageData

    applyToneLUT(imageData, lut)

    expect(Array.from(data)).toEqual([245, 235, 225, 40, 55, 45, 35, 230])
  })
})
