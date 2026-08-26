import { histogramPeak, type Histogram as HistogramData } from '../utils/histogram'
import { CHANNEL_COLORS } from './channelColors'
import type { CurveChannel } from '../utils/levelsCurves'

const PLOT_HEIGHT = 100

interface Props {
  histogram: HistogramData | null
  channel: CurveChannel
  /** Levels' input black/white points, drawn as markers when given — the
   *  whole point of a levels histogram is seeing where those two sit
   *  against the pixels they're about to clip. */
  black?: number
  white?: number
  className?: string
}

/** The area path for one channel's bins, normalized against a peak that
 *  ignores the clipping spikes at either end (see histogramPeak). */
function areaPath(bins: Uint32Array): string {
  const peak = histogramPeak(bins)
  let d = `M 0 ${PLOT_HEIGHT}`
  for (let i = 0; i < bins.length; i++) {
    const height = Math.min(1, bins[i] / peak) * PLOT_HEIGHT
    d += ` L ${i} ${PLOT_HEIGHT - height}`
  }
  return `${d} L ${bins.length - 1} ${PLOT_HEIGHT} Z`
}

/**
 * The distribution of one channel's values across the adjusted image
 * (PHOTO-007 levels/curves phase) — plotted behind the Levels sliders and
 * the curve grid, which is where it's actually useful: it's a picture of
 * exactly the range those controls are reshaping.
 *
 * Drawn in bin space (x = 0..255, y = 0..100) with a non-uniform aspect
 * ratio, so the caller sizes it in CSS and the plot stretches to fit rather
 * than each call site having to know pixel dimensions.
 */
export function Histogram({ histogram, channel, black, white, className }: Props) {
  return (
    <svg
      viewBox={`0 0 255 ${PLOT_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className={className}
    >
      {histogram && (
        <path d={areaPath(histogram[channel])} fill={CHANNEL_COLORS[channel]} fillOpacity={0.5} />
      )}
      {black !== undefined && (
        <line x1={black} y1={0} x2={black} y2={PLOT_HEIGHT} stroke={CHANNEL_COLORS.rgb} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      )}
      {white !== undefined && (
        <line x1={white} y1={0} x2={white} y2={PLOT_HEIGHT} stroke={CHANNEL_COLORS.rgb} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  )
}
