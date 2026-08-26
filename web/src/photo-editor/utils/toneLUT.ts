import type { PhotoAdjustments } from '../store/usePhotoEditorStore'

type ToneAdjustments = Pick<PhotoAdjustments, 'exposure' | 'highlights' | 'shadows'>

// sRGB-ish gamma used to move into linear light before scaling exposure, so
// it rolls off highlights the way a real exposure control does — distinct
// from Brightness (PHOTO-004), which is a flat multiply on the encoded
// (already-gamma) byte value via the CSS brightness() filter and so clips
// highlights more abruptly at the same nominal slider position.
const GAMMA = 2.2

// Max px shift (of 255) highlights/shadows applies at a slider's full ±100
// extreme — tuned so the effect is clearly visible without immediately
// crushing/blowing out the opposite end of the tonal range.
const TONE_STRENGTH = 90

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

/** True when the tone pass would touch any pixel — lets callers skip the
 *  getImageData/putImageData round trip entirely in the common case where
 *  none of these three controls have been touched. */
export function needsToneMap({ exposure, highlights, shadows }: ToneAdjustments): boolean {
  return exposure !== 0 || highlights !== 0 || shadows !== 0
}

/**
 * A 256-entry input-byte -> output-byte lookup table folding exposure
 * (gamma-correct multiplicative stops) and highlights/shadows (a tone-
 * selective shift, weighted by each byte's own position in the 0..255 range
 * as a stand-in for luminance) into one per-channel pass. Applied
 * independently to R/G/B rather than off a true combined luminance — a
 * deliberate simplification that keeps this a plain per-channel LUT, the
 * same shape levelsCurves.ts builds from control points instead of a
 * formula. channelLUT.ts folds this table
 * together with the white-balance/colour-balance per-channel terms and does
 * the actual pixel pass, so this file stays pure curve maths.
 */
// Reuses the last table when the three inputs repeat — e.g. dragging
// Brightness/Contrast (which don't feed this LUT at all) still re-renders
// the preview on every tick, and rebuilding an unchanged 256-entry table on
// each of those ticks is pure waste.
let cachedKey = ''
let cachedLUT: Uint8ClampedArray | null = null

export function buildToneLUT({ exposure, highlights, shadows }: ToneAdjustments): Uint8ClampedArray {
  const key = `${exposure},${highlights},${shadows}`
  if (key === cachedKey && cachedLUT) return cachedLUT

  // (2^(exposure/100))^(1/GAMMA), the gamma-decode/re-encode round trip
  // exposure alone needs, collapses algebraically to a single multiplier —
  // v's own gamma decode and exposed's re-encode cancel out exactly, so
  // "exposed" is just v scaled, not a per-pixel pow.
  const exposureMultiplier = Math.pow(2, exposure / (100 * GAMMA))
  const lut = new Uint8ClampedArray(256)
  for (let v = 0; v < 256; v++) {
    const exposed = v * exposureMultiplier
    const shadowWeight = clamp01(1 - exposed / 128)
    const highlightWeight = clamp01((exposed - 128) / 127)
    const delta = (shadows / 100) * shadowWeight * TONE_STRENGTH + (highlights / 100) * highlightWeight * TONE_STRENGTH
    lut[v] = exposed + delta
  }
  cachedKey = key
  cachedLUT = lut
  return lut
}
