import { buildToneLUT, needsToneMap } from './toneLUT'
import type { PhotoAdjustments } from '../store/usePhotoEditorStore'

type ChannelAdjustments = Pick<
  PhotoAdjustments,
  'exposure' | 'highlights' | 'shadows' | 'temperature' | 'tint' | 'redBalance' | 'greenBalance' | 'blueBalance'
>

/** One 256-entry input-byte -> output-byte table per colour channel. */
export interface ChannelLUTs {
  r: Uint8ClampedArray
  g: Uint8ClampedArray
  b: Uint8ClampedArray
}

// Max channel gain white balance applies at a slider's ±100 extreme. Kept
// multiplicative (not additive) so pure black stays black and the shift
// reads as a light-source colour change rather than a colour wash.
const WHITE_BALANCE_STRENGTH = 0.3
// Max px shift (of 255) each colour-balance slider applies. Additive, and
// flat across the whole tonal range — the shadows/midtones/highlights split
// a full Photoshop-style Color Balance offers is deliberately out of scope
// for this phase; it needs its own three-way UI, not one slider per channel.
const COLOR_BALANCE_STRENGTH = 64

/** True when any per-channel term would move a pixel — exposure/highlights/
 *  shadows (toneLUT.ts) or white balance / colour balance. */
export function needsChannelLUTs(a: ChannelAdjustments): boolean {
  return (
    needsToneMap(a) ||
    a.temperature !== 0 ||
    a.tint !== 0 ||
    a.redBalance !== 0 ||
    a.greenBalance !== 0 ||
    a.blueBalance !== 0
  )
}

// Same reuse-the-last-table trick as buildToneLUT: the cross-channel colour
// pass and the CSS brightness/contrast filter both re-render on every drag
// tick without touching any of these eight inputs, and rebuilding three
// 256-entry tables on each of those ticks is pure waste.
let cachedKey = ''
let cachedLUTs: ChannelLUTs | null = null

/**
 * Folds every *per-channel* adjustment into one R/G/B table trio, so the
 * pixel loop is three array lookups regardless of how many of these
 * controls are in play:
 *
 * - exposure/highlights/shadows — the shared neutral tone curve (toneLUT.ts),
 *   identical on all three channels
 * - temperature — warm (+) gains red and cuts blue, cool (-) the reverse
 * - tint — magenta (+) cuts green, green (-) gains it
 * - red/green/blue balance — a flat additive shift on that one channel
 *
 * Cross-channel work (hue, saturation, vibrance, black & white, invert)
 * can't be expressed this way and lives in colorPass.ts instead.
 */
export function buildChannelLUTs(a: ChannelAdjustments): ChannelLUTs {
  const key = [
    a.exposure,
    a.highlights,
    a.shadows,
    a.temperature,
    a.tint,
    a.redBalance,
    a.greenBalance,
    a.blueBalance,
  ].join(',')
  if (key === cachedKey && cachedLUTs) return cachedLUTs

  const tone = buildToneLUT(a)
  const rGain = 1 + (a.temperature / 100) * WHITE_BALANCE_STRENGTH
  const bGain = 1 - (a.temperature / 100) * WHITE_BALANCE_STRENGTH
  const gGain = 1 - (a.tint / 100) * WHITE_BALANCE_STRENGTH
  const rShift = (a.redBalance / 100) * COLOR_BALANCE_STRENGTH
  const gShift = (a.greenBalance / 100) * COLOR_BALANCE_STRENGTH
  const bShift = (a.blueBalance / 100) * COLOR_BALANCE_STRENGTH

  const luts: ChannelLUTs = {
    r: new Uint8ClampedArray(256),
    g: new Uint8ClampedArray(256),
    b: new Uint8ClampedArray(256),
  }
  for (let v = 0; v < 256; v++) {
    const base = tone[v]
    luts.r[v] = base * rGain + rShift
    luts.g[v] = base * gGain + gShift
    luts.b[v] = base * bGain + bShift
  }

  cachedKey = key
  cachedLUTs = luts
  return luts
}

/** Applies a buildChannelLUTs() trio to an ImageData in place — alpha untouched. */
export function applyChannelLUTs(imageData: ImageData, { r, g, b }: ChannelLUTs): void {
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r[data[i]]
    data[i + 1] = g[data[i + 1]]
    data[i + 2] = b[data[i + 2]]
  }
}
