import { describe, it, expect } from 'vitest'
import { computeHistogram, histogramPeak, HISTOGRAM_BINS } from './histogram'

/** An ImageData stand-in — computeHistogram only ever reads `data`, and
 *  jsdom has no canvas to produce a real one from. */
function imageData(pixels: number[][]): ImageData {
  return { data: new Uint8ClampedArray(pixels.flat()) } as unknown as ImageData
}

describe('computeHistogram', () => {
  it('counts each channel into its own bins', () => {
    const histogram = computeHistogram(
      imageData([
        [10, 20, 30, 255],
        [10, 20, 30, 255],
        [200, 20, 30, 255],
      ]),
    )

    expect(histogram.r[10]).toBe(2)
    expect(histogram.r[200]).toBe(1)
    expect(histogram.g[20]).toBe(3)
    expect(histogram.b[30]).toBe(3)
  })

  it('bins the composite channel by Rec. 709 luma, not by any single channel', () => {
    const histogram = computeHistogram(imageData([[255, 0, 0, 255]]))
    expect(histogram.rgb[Math.round(0.2126 * 255)]).toBe(1)
  })

  it('skips fully transparent pixels, which would otherwise fake a black spike', () => {
    const histogram = computeHistogram(
      imageData([
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [128, 128, 128, 255],
      ]),
    )

    expect(histogram.r[0]).toBe(0)
    expect(histogram.rgb[0]).toBe(0)
    expect(histogram.r[128]).toBe(1)
  })

  it('produces one bin per possible byte value on every channel', () => {
    const histogram = computeHistogram(imageData([[1, 2, 3, 255]]))
    for (const bins of [histogram.rgb, histogram.r, histogram.g, histogram.b]) {
      expect(bins).toHaveLength(HISTOGRAM_BINS)
    }
  })
})

describe('histogramPeak', () => {
  it('ignores the clipping spikes at either end', () => {
    const bins = new Uint32Array(HISTOGRAM_BINS)
    bins[0] = 5000
    bins[255] = 4000
    bins[128] = 12

    expect(histogramPeak(bins)).toBe(12)
  })

  it('falls back to the clipped ends when nothing sits between them', () => {
    const bins = new Uint32Array(HISTOGRAM_BINS)
    bins[255] = 900

    expect(histogramPeak(bins)).toBe(900)
  })

  it('never returns zero, so a plot can divide by it', () => {
    expect(histogramPeak(new Uint32Array(HISTOGRAM_BINS))).toBe(1)
  })
})
