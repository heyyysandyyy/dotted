import { describe, it, expect } from 'vitest'
import {
  buildCurveLUT,
  buildLevelsCurveLUTs,
  buildLevelsLUT,
  isIdentityCurve,
  needsLevels,
  needsLevelsCurves,
  normalizeCurvePoints,
  MAX_CURVE_POINTS,
  DEFAULT_CURVES,
  DEFAULT_LEVELS,
  IDENTITY_CURVE,
} from './levelsCurves'

describe('normalizeCurvePoints', () => {
  it('sorts by input value, clamps to 0..255 and rounds to whole bytes', () => {
    expect(
      normalizeCurvePoints([
        { x: 200, y: 300 },
        { x: 12.6, y: -5 },
        { x: 100, y: 100.4 },
      ]),
    ).toEqual([
      { x: 13, y: 0 },
      { x: 100, y: 100 },
      { x: 200, y: 255 },
    ])
  })

  it('keeps only the last point at any one input value, so no segment has zero width', () => {
    expect(
      normalizeCurvePoints([
        { x: 0, y: 0 },
        { x: 128, y: 40 },
        { x: 128, y: 200 },
        { x: 255, y: 255 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 128, y: 200 },
      { x: 255, y: 255 },
    ])
  })

  it('falls back to the identity curve for an empty list', () => {
    expect(normalizeCurvePoints([])).toEqual(IDENTITY_CURVE)
  })

  it('caps the list at MAX_CURVE_POINTS', () => {
    const many = Array.from({ length: MAX_CURVE_POINTS + 6 }, (_, i) => ({ x: i * 10, y: i * 10 }))
    expect(normalizeCurvePoints(many)).toHaveLength(MAX_CURVE_POINTS)
  })
})

describe('isIdentityCurve / needsLevels / needsLevelsCurves', () => {
  it('recognises the straight-through curve', () => {
    expect(isIdentityCurve(IDENTITY_CURVE)).toBe(true)
    expect(
      isIdentityCurve([
        { x: 0, y: 0 },
        { x: 128, y: 128 },
        { x: 255, y: 255 },
      ]),
    ).toBe(false)
    expect(
      isIdentityCurve([
        { x: 0, y: 20 },
        { x: 255, y: 255 },
      ]),
    ).toBe(false)
  })

  it('is false for untouched levels and true once any field moves', () => {
    expect(needsLevels(DEFAULT_LEVELS)).toBe(false)
    expect(needsLevels({ ...DEFAULT_LEVELS, black: 10 })).toBe(true)
    expect(needsLevels({ ...DEFAULT_LEVELS, white: 200 })).toBe(true)
    expect(needsLevels({ ...DEFAULT_LEVELS, gamma: 1.2 })).toBe(true)
  })

  it('spots a bent curve on any single channel', () => {
    const neutral = { levels: DEFAULT_LEVELS, curves: DEFAULT_CURVES }
    expect(needsLevelsCurves(neutral)).toBe(false)
    expect(
      needsLevelsCurves({
        ...neutral,
        curves: { ...DEFAULT_CURVES, b: [{ x: 0, y: 30 }, { x: 255, y: 255 }] },
      }),
    ).toBe(true)
  })
})

describe('buildLevelsLUT', () => {
  it('maps every value to itself at its neutral settings', () => {
    const lut = buildLevelsLUT(DEFAULT_LEVELS)
    for (let v = 0; v < 256; v++) expect(lut[v]).toBe(v)
  })

  it('clips below the black point and stretches what is left across the range', () => {
    const lut = buildLevelsLUT({ black: 64, white: 255, gamma: 1 })
    expect(lut[0]).toBe(0)
    expect(lut[64]).toBe(0)
    expect(lut[255]).toBe(255)
    // Halfway between the new black point and white now reads as mid-grey.
    expect(lut[160]).toBeGreaterThan(120)
    expect(lut[160]).toBeLessThan(136)
  })

  it('clips above the white point', () => {
    const lut = buildLevelsLUT({ black: 0, white: 200, gamma: 1 })
    expect(lut[200]).toBe(255)
    expect(lut[255]).toBe(255)
  })

  it('brightens midtones above 1 and darkens them below, leaving the endpoints pinned', () => {
    const brighter = buildLevelsLUT({ ...DEFAULT_LEVELS, gamma: 2 })
    const darker = buildLevelsLUT({ ...DEFAULT_LEVELS, gamma: 0.5 })
    expect(brighter[128]).toBeGreaterThan(128)
    expect(darker[128]).toBeLessThan(128)
    for (const lut of [brighter, darker]) {
      expect(lut[0]).toBe(0)
      expect(lut[255]).toBe(255)
    }
  })
})

describe('buildCurveLUT', () => {
  it('maps every value to itself for the identity curve', () => {
    const lut = buildCurveLUT(IDENTITY_CURVE)
    for (let v = 0; v < 256; v++) expect(lut[v]).toBe(v)
  })

  it('passes exactly through its control points', () => {
    const lut = buildCurveLUT([
      { x: 0, y: 0 },
      { x: 128, y: 200 },
      { x: 255, y: 255 },
    ])
    expect(lut[128]).toBe(200)
  })

  it('holds flat outside the first and last point rather than extrapolating', () => {
    const lut = buildCurveLUT([
      { x: 64, y: 30 },
      { x: 192, y: 220 },
    ])
    expect(lut[0]).toBe(30)
    expect(lut[64]).toBe(30)
    expect(lut[200]).toBe(220)
    expect(lut[255]).toBe(220)
  })

  it('stays monotone and never overshoots its control points on a steep S-curve', () => {
    // The case a plain cubic spline gets wrong: it dips below y=0 just after
    // the first point and above 255 before the last, which reads as inverted
    // bands in the shadows and highlights.
    const lut = buildCurveLUT([
      { x: 0, y: 0 },
      { x: 96, y: 20 },
      { x: 160, y: 235 },
      { x: 255, y: 255 },
    ])
    for (let v = 1; v < 256; v++) {
      expect(lut[v]).toBeGreaterThanOrEqual(lut[v - 1])
      expect(lut[v]).toBeLessThanOrEqual(255)
    }
  })

  it('flattens to a constant for a single point', () => {
    const lut = buildCurveLUT([{ x: 128, y: 77 }])
    expect(lut[0]).toBe(77)
    expect(lut[255]).toBe(77)
  })

  it('normalizes unsorted points instead of dividing by a negative segment width', () => {
    const lut = buildCurveLUT([
      { x: 255, y: 255 },
      { x: 0, y: 0 },
    ])
    expect(lut[128]).toBe(128)
  })
})

describe('buildLevelsCurveLUTs', () => {
  const NEUTRAL = { levels: DEFAULT_LEVELS, curves: DEFAULT_CURVES }

  it('is the identity on all three channels when nothing has been touched', () => {
    const { r, g, b } = buildLevelsCurveLUTs(NEUTRAL)
    for (let v = 0; v < 256; v++) {
      expect(r[v]).toBe(v)
      expect(g[v]).toBe(v)
      expect(b[v]).toBe(v)
    }
  })

  it('applies the composite curve to every channel', () => {
    const curve = [
      { x: 0, y: 0 },
      { x: 128, y: 190 },
      { x: 255, y: 255 },
    ]
    const { r, g, b } = buildLevelsCurveLUTs({ ...NEUTRAL, curves: { ...DEFAULT_CURVES, rgb: curve } })
    expect(r[128]).toBe(190)
    expect(g[128]).toBe(190)
    expect(b[128]).toBe(190)
  })

  it('applies a single-channel curve to that channel only', () => {
    const curve = [
      { x: 0, y: 0 },
      { x: 128, y: 60 },
      { x: 255, y: 255 },
    ]
    const { r, g, b } = buildLevelsCurveLUTs({ ...NEUTRAL, curves: { ...DEFAULT_CURVES, r: curve } })
    expect(r[128]).toBe(60)
    expect(g[128]).toBe(128)
    expect(b[128]).toBe(128)
  })

  it('stacks the channel curve on top of the composite one', () => {
    const curves = {
      ...DEFAULT_CURVES,
      rgb: [
        { x: 0, y: 0 },
        { x: 128, y: 200 },
        { x: 255, y: 255 },
      ],
      g: [
        { x: 0, y: 0 },
        { x: 200, y: 100 },
        { x: 255, y: 255 },
      ],
    }
    const { g } = buildLevelsCurveLUTs({ ...NEUTRAL, curves })
    // 128 -> 200 through the composite curve, then 200 -> 100 through green's.
    expect(g[128]).toBe(100)
  })

  it('runs levels before the curves, not after', () => {
    // A curve that inverts, so the two possible orders land nowhere near
    // each other: levels clips 64 to 0 and the curve then flips it to 255,
    // where curve-first would have given 191 for the curve and roughly 126
    // once levels stretched what was left.
    const inverting = [
      { x: 0, y: 255 },
      { x: 255, y: 0 },
    ]
    const { r } = buildLevelsCurveLUTs({
      levels: { black: 128, white: 255, gamma: 1 },
      curves: { ...DEFAULT_CURVES, rgb: inverting },
    })
    expect(r[64]).toBe(255)
  })
})
