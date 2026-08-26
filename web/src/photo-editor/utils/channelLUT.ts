import { buildToneLUT, needsToneMap } from './toneLUT'
import { buildLevelsCurveLUTs, needsLevelsCurves } from './levelsCurves'
import type { PhotoAdjustments } from '../store/usePhotoEditorStore'

type ChannelAdjustments = Pick<
  PhotoAdjustments,
  | 'exposure'
  | 'highlights'
  | 'shadows'
  | 'temperature'
  | 'tint'
  | 'redBalance'
  | 'greenBalance'
  | 'blueBalance'
  | 'levels'
  | 'curves'
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
 *  shadows (toneLUT.ts), white balance / colour balance, or levels/curves
 *  (levelsCurves.ts). */
export function needsChannelLUTs(a: ChannelAdjustments): boolean {
  return (
    needsToneMap(a) ||
    a.temperature !== 0 ||
    a.tint !== 0 ||
    a.redBalance !== 0 ||
    a.greenBalance !== 0 ||
    a.blueBalance !== 0 ||
    needsLevelsCurves(a)
  )
}

// Same reuse-the-last-table trick as buildToneLUT: the cross-channel colour
// pass and the CSS brightness/contrast filter both re-render on every drag
// tick without touching any of these eight inputs, and rebuilding three
// 256-entry tables on each of those ticks is pure waste.
let cachedKey = ''
let cachedLUTs: ChannelLUTs | null = null

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}

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
 * - levels and curves (levelsCurves.ts) — folded in last, so the curve a
 *   user draws maps the tone/white-balance result they can actually see,
 *   the same way a Levels/Curves layer sits above the adjustments below it
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
    // Serialized rather than listed: levels is a triple and each curve is a
    // variable-length point list, so there's no fixed set of numbers to
    // join. Both are small enough (a handful of points) that stringifying
    // them per call is far cheaper than the rebuild it avoids.
    JSON.stringify(a.levels),
    JSON.stringify(a.curves),
  ].join('|')
  if (key === cachedKey && cachedLUTs) return cachedLUTs

  const tone = buildToneLUT(a)
  const rGain = 1 + (a.temperature / 100) * WHITE_BALANCE_STRENGTH
  const bGain = 1 - (a.temperature / 100) * WHITE_BALANCE_STRENGTH
  const gGain = 1 - (a.tint / 100) * WHITE_BALANCE_STRENGTH
  const rShift = (a.redBalance / 100) * COLOR_BALANCE_STRENGTH
  const gShift = (a.greenBalance / 100) * COLOR_BALANCE_STRENGTH
  const bShift = (a.blueBalance / 100) * COLOR_BALANCE_STRENGTH

  // Null when levels and all four curves are neutral, which keeps the
  // common case one multiply-add per entry instead of a second lookup.
  const levelsCurves = needsLevelsCurves(a) ? buildLevelsCurveLUTs(a) : null

  const luts: ChannelLUTs = {
    r: new Uint8ClampedArray(256),
    g: new Uint8ClampedArray(256),
    b: new Uint8ClampedArray(256),
  }
  for (let v = 0; v < 256; v++) {
    const base = tone[v]
    const r = base * rGain + rShift
    const g = base * gGain + gShift
    const b = base * bGain + bShift
    // Rounded and clamped before the lookup: the gains and shifts above can
    // land outside 0..255 (and between two entries), and only the final
    // write to a Uint8ClampedArray does that for free.
    luts.r[v] = levelsCurves ? levelsCurves.r[clampByte(r)] : r
    luts.g[v] = levelsCurves ? levelsCurves.g[clampByte(g)] : g
    luts.b[v] = levelsCurves ? levelsCurves.b[clampByte(b)] : b
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
