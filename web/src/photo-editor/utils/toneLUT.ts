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
 * same shape Levels/Curves (PHOTO-007's follow-up phase) will build from
 * control points instead of a formula, so applyToneLUT below is already the
 * mechanism that phase needs too.
 */
export function buildToneLUT({ exposure, highlights, shadows }: ToneAdjustments): Uint8ClampedArray {
  const exposureFactor = Math.pow(2, exposure / 100)
  const lut = new Uint8ClampedArray(256)
  for (let v = 0; v < 256; v++) {
    const linear = Math.pow(v / 255, GAMMA) * exposureFactor
    const exposed = Math.pow(Math.max(linear, 0), 1 / GAMMA) * 255
    const shadowWeight = clamp01(1 - exposed / 128)
    const highlightWeight = clamp01((exposed - 128) / 127)
    const delta = (shadows / 100) * shadowWeight * TONE_STRENGTH + (highlights / 100) * highlightWeight * TONE_STRENGTH
    lut[v] = exposed + delta
  }
  return lut
}

/** Applies a buildToneLUT() table to an ImageData's RGB channels in place — alpha untouched. */
export function applyToneLUT(imageData: ImageData, lut: Uint8ClampedArray): void {
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]]
    data[i + 1] = lut[data[i + 1]]
    data[i + 2] = lut[data[i + 2]]
  }
}
