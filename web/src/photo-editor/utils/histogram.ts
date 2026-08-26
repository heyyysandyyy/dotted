import type { CurveChannel } from './levelsCurves'

/** Bin count — one per possible byte value, so a bin index *is* the input
 *  value a curve or levels control would be reading at that point. */
export const HISTOGRAM_BINS = 256

/** Pixel counts per input value: one array per colour channel plus the
 *  Rec. 709 luma the composite (RGB) curve is judged against. Keyed by
 *  CurveChannel so the curve editor can index it with the channel it's
 *  already editing — 'rgb' meaning the luma distribution. */
export type Histogram = Record<CurveChannel, Uint32Array>

/**
 * Counts an ImageData into per-channel histograms. Fully transparent pixels
 * are skipped: after drawImage they read as (0,0,0,0) and would otherwise
 * pile a transparent PNG's whole background into bin 0, making the shadow
 * end of the histogram pure fiction.
 */
export function computeHistogram(imageData: ImageData): Histogram {
  const histogram: Histogram = {
    rgb: new Uint32Array(HISTOGRAM_BINS),
    r: new Uint32Array(HISTOGRAM_BINS),
    g: new Uint32Array(HISTOGRAM_BINS),
    b: new Uint32Array(HISTOGRAM_BINS),
  }
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    histogram.r[r]++
    histogram.g[g]++
    histogram.b[b]++
    histogram.rgb[Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)]++
  }
  return histogram
}

/**
 * The count one histogram plot should treat as full height. The two extreme
 * bins are left out of it because clipping piles up there: a photo with a
 * blown sky or a hard black background can hold more pixels in bin 255 (or
 * 0) than in the whole rest of the range, which flattens everything else
 * into an unreadable line. They still draw — clipped to the top of the plot
 * — so the clipping itself stays visible.
 */
export function histogramPeak(bins: Uint32Array): number {
  let peak = 0
  for (let i = 1; i < bins.length - 1; i++) if (bins[i] > peak) peak = bins[i]
  if (peak > 0) return peak
  // An entirely clipped (or single-value) image: fall back to the extremes
  // so the plot shows something rather than dividing by zero.
  return Math.max(bins[0], bins[bins.length - 1], 1)
}
