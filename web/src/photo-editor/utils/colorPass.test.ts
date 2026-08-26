import { describe, it, expect } from 'vitest'
import { applyColorPass, buildColorMatrix, needsColorPass } from './colorPass'

const NEUTRAL = { saturation: 0, vibrance: 0, hue: 0, blackAndWhite: false, invert: false }

/** One RGBA pixel as an ImageData-shaped stand-in — jsdom has no real 2d
 *  context, and applyColorPass only ever touches `data`. */
function pixel(r: number, g: number, b: number, a = 255) {
  const data = new Uint8ClampedArray([r, g, b, a])
  return { imageData: { data, width: 1, height: 1 } as unknown as ImageData, data }
}

describe('needsColorPass', () => {
  it('is false when nothing colour-related has moved', () => {
    expect(needsColorPass(NEUTRAL)).toBe(false)
  })

  it('is true for any one of the five controls', () => {
    expect(needsColorPass({ ...NEUTRAL, saturation: 10 })).toBe(true)
    expect(needsColorPass({ ...NEUTRAL, vibrance: -10 })).toBe(true)
    expect(needsColorPass({ ...NEUTRAL, hue: 5 })).toBe(true)
    expect(needsColorPass({ ...NEUTRAL, blackAndWhite: true })).toBe(true)
    expect(needsColorPass({ ...NEUTRAL, invert: true })).toBe(true)
  })
})

describe('buildColorMatrix', () => {
  it('returns the identity when hue and saturation are both neutral', () => {
    expect(buildColorMatrix({ hue: 0, saturation: 0 })).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1])
  })

  it('returns the same identity reference twice, so applyColorPass can skip the multiply', () => {
    expect(buildColorMatrix({ hue: 0, saturation: 0 })).toBe(buildColorMatrix({ hue: 0, saturation: 0 }))
  })

  it('every row of a pure saturation matrix sums to 1, so neutral greys stay put', () => {
    const m = buildColorMatrix({ hue: 0, saturation: 70 })
    for (let row = 0; row < 3; row++) {
      expect(m[row * 3] + m[row * 3 + 1] + m[row * 3 + 2]).toBeCloseTo(1, 6)
    }
  })

  it('every row of a pure hue matrix sums to 1 too', () => {
    const m = buildColorMatrix({ hue: 45, saturation: 0 })
    for (let row = 0; row < 3; row++) {
      expect(m[row * 3] + m[row * 3 + 1] + m[row * 3 + 2]).toBeCloseTo(1, 6)
    }
  })
})

describe('applyColorPass — saturation', () => {
  it('-100 fully desaturates to a single grey level', () => {
    const { imageData, data } = pixel(200, 100, 50)
    applyColorPass(imageData, { ...NEUTRAL, saturation: -100 })
    expect(data[0]).toBe(data[1])
    expect(data[1]).toBe(data[2])
  })

  it('positive saturation pushes channels further apart', () => {
    const { imageData, data } = pixel(200, 100, 50)
    applyColorPass(imageData, { ...NEUTRAL, saturation: 100 })
    expect(data[0] - data[2]).toBeGreaterThan(200 - 50)
  })

  it('leaves a neutral grey alone at any saturation', () => {
    const { imageData, data } = pixel(128, 128, 128)
    applyColorPass(imageData, { ...NEUTRAL, saturation: 100 })
    expect(Array.from(data)).toEqual([128, 128, 128, 255])
  })
})

describe('applyColorPass — vibrance', () => {
  it('moves a muted colour further than an already-vivid one', () => {
    const muted = pixel(140, 128, 120)
    const vivid = pixel(255, 128, 0)
    applyColorPass(muted.imageData, { ...NEUTRAL, vibrance: 100 })
    applyColorPass(vivid.imageData, { ...NEUTRAL, vibrance: 100 })

    const mutedSpread = muted.data[0] - muted.data[2]
    const vividSpread = vivid.data[0] - vivid.data[2]
    expect(mutedSpread / (140 - 120)).toBeGreaterThan(vividSpread / (255 - 0))
  })

  it('leaves a neutral grey alone', () => {
    const { imageData, data } = pixel(90, 90, 90)
    applyColorPass(imageData, { ...NEUTRAL, vibrance: 100 })
    expect(Array.from(data)).toEqual([90, 90, 90, 255])
  })
})

describe('applyColorPass — hue shift', () => {
  it('rotates a colour without collapsing it to grey', () => {
    const { imageData, data } = pixel(255, 0, 0)
    applyColorPass(imageData, { ...NEUTRAL, hue: 60 })
    expect(data[1]).toBeGreaterThan(0)
    expect(Math.max(data[0], data[1], data[2]) - Math.min(data[0], data[1], data[2])).toBeGreaterThan(20)
  })

  it('leaves a neutral grey alone', () => {
    const { imageData, data } = pixel(128, 128, 128)
    applyColorPass(imageData, { ...NEUTRAL, hue: 55 })
    expect(data[0]).toBeCloseTo(128, -1)
    expect(data[1]).toBeCloseTo(128, -1)
    expect(data[2]).toBeCloseTo(128, -1)
  })
})

describe('applyColorPass — black & white and invert', () => {
  it('black & white collapses every pixel to its luma', () => {
    const { imageData, data } = pixel(255, 0, 0)
    applyColorPass(imageData, { ...NEUTRAL, blackAndWhite: true })
    expect(Array.from(data)).toEqual([54, 54, 54, 255]) // 0.2126 * 255
  })

  it('black & white overrides saturation, since both pivot around the same luma', () => {
    const withSat = pixel(200, 100, 50)
    const without = pixel(200, 100, 50)
    applyColorPass(withSat.imageData, { ...NEUTRAL, blackAndWhite: true, saturation: 100 })
    applyColorPass(without.imageData, { ...NEUTRAL, blackAndWhite: true })
    expect(Array.from(withSat.data)).toEqual(Array.from(without.data))
  })

  it('invert flips each channel and leaves alpha alone', () => {
    const { imageData, data } = pixel(10, 200, 90, 128)
    applyColorPass(imageData, { ...NEUTRAL, invert: true })
    expect(Array.from(data)).toEqual([245, 55, 165, 128])
  })

  it('invert runs last, so black & white plus invert is an inverted grey', () => {
    const { imageData, data } = pixel(255, 0, 0)
    applyColorPass(imageData, { ...NEUTRAL, blackAndWhite: true, invert: true })
    expect(Array.from(data)).toEqual([201, 201, 201, 255])
  })
})

describe('applyColorPass — clamping', () => {
  it('keeps every channel in 0..255 with all controls at an extreme', () => {
    const { imageData, data } = pixel(250, 10, 190)
    applyColorPass(imageData, { saturation: 100, vibrance: 100, hue: 100, blackAndWhite: false, invert: true })
    for (const v of data) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(255)
    }
  })
})
