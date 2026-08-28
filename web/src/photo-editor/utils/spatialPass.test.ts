import { describe, it, expect } from 'vitest'
import { applySpatialPass, gaussianBlur, grainParticleSize, motionBlur, needsSpatialPass } from './spatialPass'
import { DEFAULT_ADJUSTMENTS, type PhotoAdjustments } from '../store/usePhotoEditorStore'

const adjust = (overrides: Partial<PhotoAdjustments>): PhotoAdjustments => ({
  ...DEFAULT_ADJUSTMENTS,
  ...overrides,
})

/** An ImageData-shaped stand-in, the same way colorPass.test.ts builds one:
 *  jsdom has no ImageData constructor, and applySpatialPass only ever reads
 *  `data`, `width` and `height`. */
function imageOf(data: Uint8ClampedArray, size: number): ImageData {
  return { data, width: size, height: size } as unknown as ImageData
}

/** A flat grey field with one bright pixel at its centre — an impulse, which
 *  is the standard way to read what a filter actually does: blurring spreads
 *  it, sharpening deepens the dip around it. */
function impulse(size: number, background = 100, peak = 240): ImageData {
  const data = new Uint8ClampedArray(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = background
    data[i * 4 + 1] = background
    data[i * 4 + 2] = background
    data[i * 4 + 3] = 255
  }
  const centre = (Math.floor(size / 2) * size + Math.floor(size / 2)) * 4
  data[centre] = peak
  data[centre + 1] = peak
  data[centre + 2] = peak
  return imageOf(data, size)
}

/** A vertical hard edge: left half dark, right half light. */
function edge(size: number, dark = 40, light = 210): ImageData {
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = x < size / 2 ? dark : light
      const i = (y * size + x) * 4
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
      data[i + 3] = 255
    }
  }
  return imageOf(data, size)
}

const px = (image: ImageData, x: number, y: number) => image.data[(y * image.width + x) * 4]
const centreOf = (image: ImageData) => px(image, Math.floor(image.width / 2), Math.floor(image.height / 2))

describe('needsSpatialPass (PHOTO-008)', () => {
  it('is false for untouched adjustments, so the pass is skipped entirely', () => {
    expect(needsSpatialPass(DEFAULT_ADJUSTMENTS)).toBe(false)
  })

  it('stays false when only the sharpen radius moved — radius alone sharpens nothing', () => {
    expect(needsSpatialPass(adjust({ sharpenRadius: 100 }))).toBe(false)
  })

  it('stays false when only the motion angle moved — an angle with no length is no streak', () => {
    expect(needsSpatialPass(adjust({ motionBlurAngle: 100 }))).toBe(false)
  })

  it.each(['sharpen', 'blur', 'motionBlur', 'noiseReduction', 'grain'] as const)(
    'is true once %s has moved',
    (key) => {
      expect(needsSpatialPass(adjust({ [key]: 50 }))).toBe(true)
    },
  )
})

describe('grainParticleSize', () => {
  it('is one pixel up to the reference edge, so small images grain per pixel', () => {
    expect(grainParticleSize(256)).toBe(1)
    expect(grainParticleSize(900)).toBe(1)
    expect(grainParticleSize(1050)).toBe(1)
  })

  it('grows with the image, so grain stays the same size relative to the picture', () => {
    // Without this, grain would be the one control whose look changed between
    // the capped preview, the histogram proxy and the full-resolution bake: a
    // particle fixed at one pixel is three times finer on a 3000px image than
    // on the ~1000px preview it was judged from.
    expect(grainParticleSize(1800)).toBe(2)
    expect(grainParticleSize(2700)).toBe(3)
    expect(grainParticleSize(3000)).toBe(3)
  })

  it('never returns a zero or negative particle, whatever it is handed', () => {
    for (const edge of [0, 1, 8]) expect(grainParticleSize(edge)).toBeGreaterThanOrEqual(1)
  })
})

describe('gaussianBlur', () => {
  it('spreads an impulse into its neighbours while conserving overall brightness', () => {
    const size = 33
    const image = impulse(size)
    const work = Float32Array.from(image.data)
    const before = work.reduce((sum, _v, i) => (i % 4 === 3 ? sum : sum + work[i]), 0)

    gaussianBlur(work, new Float32Array(work.length), size, size, 3)

    const mid = Math.floor(size / 2)
    const at = (x: number, y: number) => work[(y * size + x) * 4]
    // The peak has come down and its neighbour has come up.
    expect(at(mid, mid)).toBeLessThan(240)
    expect(at(mid + 1, mid)).toBeGreaterThan(100)

    // A blur redistributes light, it doesn't create or destroy it. Edge
    // clamping means this isn't exact, so allow a little slack.
    const after = work.reduce((sum, _v, i) => (i % 4 === 3 ? sum : sum + work[i]), 0)
    expect(after).toBeCloseTo(before, -1)
  })

  it('leaves a flat field flat — no edge artefact from the clamped window', () => {
    const size = 16
    const work = new Float32Array(size * size * 4).fill(80)
    gaussianBlur(work, new Float32Array(work.length), size, size, 4)
    for (let i = 0; i < work.length; i += 4) expect(work[i]).toBeCloseTo(80, 4)
  })

  it('is a no-op below a one-pixel radius, so a barely-moved slider costs nothing', () => {
    const size = 8
    const image = impulse(size)
    const work = Float32Array.from(image.data)
    const untouched = Float32Array.from(work)
    gaussianBlur(work, new Float32Array(work.length), size, size, 0)
    expect(Array.from(work)).toEqual(Array.from(untouched))
  })

  it('never touches alpha', () => {
    const size = 8
    const work = Float32Array.from(impulse(size).data)
    gaussianBlur(work, new Float32Array(work.length), size, size, 2)
    for (let i = 3; i < work.length; i += 4) expect(work[i]).toBe(255)
  })
})

describe('motionBlur', () => {
  it('streaks along its angle and not across it', () => {
    const size = 21
    const src = Float32Array.from(impulse(size).data)
    const dst = new Float32Array(src.length)
    // 0deg is a horizontal streak.
    motionBlur(src, dst, size, size, 9, 0)

    const mid = Math.floor(size / 2)
    const at = (x: number, y: number) => dst[(y * size + x) * 4]
    expect(at(mid + 2, mid)).toBeGreaterThan(100) // along the streak: brightened
    expect(at(mid, mid + 2)).toBeCloseTo(100, 5) // across it: untouched
  })

  it('streaks vertically at 90 degrees', () => {
    const size = 21
    const src = Float32Array.from(impulse(size).data)
    const dst = new Float32Array(src.length)
    motionBlur(src, dst, size, size, 9, 90)

    const mid = Math.floor(size / 2)
    const at = (x: number, y: number) => dst[(y * size + x) * 4]
    expect(at(mid, mid + 2)).toBeGreaterThan(100)
    expect(at(mid + 2, mid)).toBeCloseTo(100, 5)
  })
})

describe('applySpatialPass', () => {
  it('blur softens a hard edge', () => {
    const image = edge(64)
    const boundary = 32
    const beforeStep = px(image, boundary, 32) - px(image, boundary - 1, 32)

    applySpatialPass(image, adjust({ blur: 100 }))

    const afterStep = px(image, boundary, 32) - px(image, boundary - 1, 32)
    expect(afterStep).toBeLessThan(beforeStep)
  })

  it('sharpen increases local contrast across an edge', () => {
    const plain = edge(64)
    const sharpened = edge(64)
    applySpatialPass(sharpened, adjust({ sharpen: 100, sharpenRadius: 100 }))

    // The unsharp mask overshoots on both sides of the edge: the dark side
    // gets darker and the light side lighter, which is what "sharper" means.
    expect(px(sharpened, 30, 32)).toBeLessThan(px(plain, 30, 32))
    expect(px(sharpened, 33, 32)).toBeGreaterThan(px(plain, 33, 32))
  })

  it('sharpen and blur pull in opposite directions on the same image', () => {
    const blurred = impulse(48)
    const sharpened = impulse(48)
    applySpatialPass(blurred, adjust({ blur: 60 }))
    applySpatialPass(sharpened, adjust({ sharpen: 60 }))
    expect(centreOf(blurred)).toBeLessThan(centreOf(sharpened))
  })

  it('grain is deterministic — the same adjustments produce the same pixels', () => {
    const first = impulse(32)
    const second = impulse(32)
    applySpatialPass(first, adjust({ grain: 70 }))
    applySpatialPass(second, adjust({ grain: 70 }))
    expect(Array.from(first.data)).toEqual(Array.from(second.data))
  })

  it('grain actually perturbs a flat field, and more of it perturbs further', () => {
    const flat = () => {
      const data = new Uint8ClampedArray(32 * 32 * 4).fill(128)
      for (let i = 3; i < data.length; i += 4) data[i] = 255
      return imageOf(data, 32)
    }
    const spread = (image: ImageData) => {
      let total = 0
      for (let i = 0; i < image.data.length; i += 4) total += Math.abs(image.data[i] - 128)
      return total
    }

    const light = flat()
    const heavy = flat()
    applySpatialPass(light, adjust({ grain: 20 }))
    applySpatialPass(heavy, adjust({ grain: 100 }))

    expect(spread(light)).toBeGreaterThan(0)
    expect(spread(heavy)).toBeGreaterThan(spread(light))
  })

  it('noise reduction smooths speckle but keeps a real edge standing', () => {
    // A hard edge with one slightly-off pixel on the dark side. The speckle is
    // deliberately small (40 -> 62): that's what sensor noise looks like, and
    // it's the whole distinction the control turns on. A wildly bright stray
    // would sit past DENOISE_EDGE_THRESHOLD and be preserved as detail — which
    // is correct behaviour, not a miss.
    const speckled = edge(64)
    const strayX = 12
    const strayIndex = (32 * 64 + strayX) * 4
    speckled.data[strayIndex] = 62
    speckled.data[strayIndex + 1] = 62
    speckled.data[strayIndex + 2] = 62

    const edgeStepBefore = px(speckled, 32, 32) - px(speckled, 31, 32)
    applySpatialPass(speckled, adjust({ noiseReduction: 100 }))

    // The speckle has been pulled back toward its dark surroundings...
    expect(px(speckled, strayX, 32)).toBeLessThan(62)
    // ...while the edge, far past the threshold, is left as steep as it was —
    // which is what separates this from the plain blur control.
    const edgeStepAfter = px(speckled, 32, 32) - px(speckled, 31, 32)
    expect(edgeStepAfter).toBeGreaterThan(edgeStepBefore * 0.9)
  })

  it('is resolution-independent — the same slider gives the same look at two sizes', () => {
    // The radius is a fraction of the shorter edge, so a half-size copy must
    // land in the same relative place. Without that, useHistogram's 256px
    // proxy would plot a far heavier blur than the preview ever showed.
    const big = edge(128)
    const small = edge(64)
    applySpatialPass(big, adjust({ blur: 50 }))
    applySpatialPass(small, adjust({ blur: 50 }))

    // Sample at the same *proportional* offset from the edge in each.
    const bigRamp = px(big, 64 + 8, 64) - px(big, 64 - 8, 64)
    const smallRamp = px(small, 32 + 4, 32) - px(small, 32 - 4, 32)
    expect(bigRamp).toBeCloseTo(smallRamp, -1)
  })

  it('never touches alpha', () => {
    const image = impulse(24)
    applySpatialPass(image, adjust({ blur: 40, sharpen: 40, grain: 40, noiseReduction: 40 }))
    for (let i = 3; i < image.data.length; i += 4) expect(image.data[i]).toBe(255)
  })
})
