import { describe, it, expect } from 'vitest'
import { buildChannelLUTs, applyChannelLUTs, needsChannelLUTs } from './channelLUT'
import { DEFAULT_CURVES, DEFAULT_LEVELS } from './levelsCurves'

const NEUTRAL = {
  exposure: 0,
  highlights: 0,
  shadows: 0,
  temperature: 0,
  tint: 0,
  redBalance: 0,
  greenBalance: 0,
  blueBalance: 0,
  levels: DEFAULT_LEVELS,
  curves: DEFAULT_CURVES,
}

describe('needsChannelLUTs', () => {
  it('is false when every per-channel control is neutral', () => {
    expect(needsChannelLUTs(NEUTRAL)).toBe(false)
  })

  it('is true for a tone control, a white-balance control or a colour-balance control', () => {
    expect(needsChannelLUTs({ ...NEUTRAL, shadows: 20 })).toBe(true)
    expect(needsChannelLUTs({ ...NEUTRAL, temperature: -30 })).toBe(true)
    expect(needsChannelLUTs({ ...NEUTRAL, tint: 15 })).toBe(true)
    expect(needsChannelLUTs({ ...NEUTRAL, greenBalance: -5 })).toBe(true)
  })
})

describe('buildChannelLUTs', () => {
  it('is the identity mapping on all three channels at neutral', () => {
    const { r, g, b } = buildChannelLUTs(NEUTRAL)
    for (let v = 0; v < 256; v++) {
      expect(r[v]).toBe(v)
      expect(g[v]).toBe(v)
      expect(b[v]).toBe(v)
    }
  })

  it('warm temperature gains red and cuts blue, leaving green alone', () => {
    const { r, g, b } = buildChannelLUTs({ ...NEUTRAL, temperature: 100 })
    expect(r[128]).toBeGreaterThan(128)
    expect(b[128]).toBeLessThan(128)
    expect(g[128]).toBe(128)
  })

  it('cool temperature does the reverse', () => {
    const { r, g, b } = buildChannelLUTs({ ...NEUTRAL, temperature: -100 })
    expect(r[128]).toBeLessThan(128)
    expect(b[128]).toBeGreaterThan(128)
    expect(g[128]).toBe(128)
  })

  it('white balance is multiplicative, so pure black stays black', () => {
    const { r, g, b } = buildChannelLUTs({ ...NEUTRAL, temperature: 100, tint: -100 })
    expect(r[0]).toBe(0)
    expect(g[0]).toBe(0)
    expect(b[0]).toBe(0)
  })

  it('positive tint cuts green (toward magenta) and negative tint gains it', () => {
    expect(buildChannelLUTs({ ...NEUTRAL, tint: 100 }).g[128]).toBeLessThan(128)
    expect(buildChannelLUTs({ ...NEUTRAL, tint: -100 }).g[128]).toBeGreaterThan(128)
  })

  it('colour balance shifts only its own channel, additively across the range', () => {
    const { r, g, b } = buildChannelLUTs({ ...NEUTRAL, redBalance: 50 })
    expect(r[0]).toBeGreaterThan(0) // additive, so it lifts black too
    expect(r[100]).toBeGreaterThan(100)
    expect(g[100]).toBe(100)
    expect(b[100]).toBe(100)
  })

  it('folds the tone curve in — exposure still moves every channel together', () => {
    const { r, g, b } = buildChannelLUTs({ ...NEUTRAL, exposure: 50 })
    expect(r[128]).toBeGreaterThan(128)
    expect(r[128]).toBe(g[128])
    expect(g[128]).toBe(b[128])
  })

  it('clamps to 0..255 with every control pushed to an extreme', () => {
    const { r, g, b } = buildChannelLUTs({
      ...NEUTRAL,
      exposure: 100,
      highlights: 100,
      shadows: 100,
      temperature: 100,
      tint: -100,
      redBalance: 100,
      greenBalance: 100,
      blueBalance: -100,
      levels: { black: 40, white: 200, gamma: 2 },
    })
    for (let v = 0; v < 256; v++) {
      for (const channel of [r, g, b]) {
        expect(channel[v]).toBeGreaterThanOrEqual(0)
        expect(channel[v]).toBeLessThanOrEqual(255)
      }
    }
  })

  it('reuses the same tables for repeated inputs instead of rebuilding them', () => {
    const first = buildChannelLUTs({ ...NEUTRAL, temperature: 20, redBalance: -10 })
    const second = buildChannelLUTs({ ...NEUTRAL, temperature: 20, redBalance: -10 })
    expect(second).toBe(first)
  })

  it('rebuilds when any input changes', () => {
    const first = buildChannelLUTs({ ...NEUTRAL, temperature: 20 })
    const second = buildChannelLUTs({ ...NEUTRAL, temperature: 60 })
    expect(second).not.toBe(first)
    expect(second.r[128]).not.toBe(first.r[128])
  })
})

describe('applyChannelLUTs', () => {
  it('maps each channel through its own table and leaves alpha untouched', () => {
    const luts = {
      r: new Uint8ClampedArray(256).fill(1),
      g: new Uint8ClampedArray(256).fill(2),
      b: new Uint8ClampedArray(256).fill(3),
    }
    const data = new Uint8ClampedArray([10, 20, 30, 40, 200, 210, 220, 230])
    const imageData = { data, width: 2, height: 1 } as unknown as ImageData

    applyChannelLUTs(imageData, luts)

    expect(Array.from(data)).toEqual([1, 2, 3, 40, 1, 2, 3, 230])
  })
})
