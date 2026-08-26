import type { CurveChannel } from '../utils/levelsCurves'

/** Plot colours per channel, shared by the histogram and the curve editor so
 *  a channel reads the same in both. Literal colours rather than theme
 *  tokens: red/green/blue mean the channel here, not a UI state, and the
 *  composite grey is picked to sit between the two theme backgrounds. */
export const CHANNEL_COLORS: Record<CurveChannel, string> = {
  rgb: '#94a3b8',
  r: '#f87171',
  g: '#4ade80',
  b: '#60a5fa',
}
