import type { PhotoAdjustments } from '../store/usePhotoEditorStore'

type ColorAdjustments = Pick<
  PhotoAdjustments,
  'saturation' | 'vibrance' | 'hue' | 'blackAndWhite' | 'invert'
>

// Rec. 709 luma weights — the grey a pixel collapses to when fully
// desaturated, and the fixed point saturation/vibrance pivot around.
const LUMA_R = 0.2126
const LUMA_G = 0.7152
const LUMA_B = 0.0722

/** Degrees of hue rotation at the slider's ±100 extreme — a full half-turn
 *  each way, so the slider covers the whole colour wheel end to end. */
const MAX_HUE_DEGREES = 180

/** A row-major 3x3 colour matrix: [r,g,b] out = M * [r,g,b] in. */
export type ColorMatrix = readonly [number, number, number, number, number, number, number, number, number]

const IDENTITY: ColorMatrix = [1, 0, 0, 0, 1, 0, 0, 0, 1]

/** True when the cross-channel pass would touch any pixel — lets callers
 *  skip it (and, with needsChannelLUTs also false, the whole
 *  getImageData/putImageData round trip). */
export function needsColorPass(a: ColorAdjustments): boolean {
  return a.saturation !== 0 || a.vibrance !== 0 || a.hue !== 0 || a.blackAndWhite || a.invert
}

/** The SVG filter spec's `feColorMatrix type="hueRotate"` matrix — a rotation
 *  about the luma axis, which is why it shifts hues without dragging the
 *  image's overall brightness around with them. */
function hueMatrix(degrees: number): ColorMatrix {
  const radians = (degrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return [
    0.213 + cos * 0.787 - sin * 0.213,
    0.715 - cos * 0.715 - sin * 0.715,
    0.072 - cos * 0.072 + sin * 0.928,
    0.213 - cos * 0.213 + sin * 0.143,
    0.715 + cos * 0.285 + sin * 0.14,
    0.072 - cos * 0.072 - sin * 0.283,
    0.213 - cos * 0.213 - sin * 0.787,
    0.715 - cos * 0.715 + sin * 0.715,
    0.072 + cos * 0.928 + sin * 0.072,
  ]
}

/** Lerps each channel away from (s > 1) or toward (s < 1) the pixel's own
 *  luma, so luma is preserved exactly and s = 0 lands on pure greyscale. */
function saturationMatrix(s: number): ColorMatrix {
  const inv = 1 - s
  return [
    LUMA_R * inv + s,
    LUMA_G * inv,
    LUMA_B * inv,
    LUMA_R * inv,
    LUMA_G * inv + s,
    LUMA_B * inv,
    LUMA_R * inv,
    LUMA_G * inv,
    LUMA_B * inv + s,
  ]
}

function multiply(a: ColorMatrix, b: ColorMatrix): ColorMatrix {
  // Written out cell by cell rather than looped into an array: the return
  // type is a fixed 9-tuple, and a loop-built number[] would only satisfy
  // it via a cast (REFACTOR-003).
  const cell = (row: number, col: number) =>
    a[row * 3] * b[col] + a[row * 3 + 1] * b[3 + col] + a[row * 3 + 2] * b[6 + col]
  return [
    cell(0, 0),
    cell(0, 1),
    cell(0, 2),
    cell(1, 0),
    cell(1, 1),
    cell(1, 2),
    cell(2, 0),
    cell(2, 1),
    cell(2, 2),
  ]
}

/**
 * Hue rotation and saturation collapsed into one matrix, applied hue-first
 * — both are linear, so folding them means one multiply-add per channel per
 * pixel instead of two full passes. Returns the identity when neither
 * control has moved, which applyColorPass uses to skip the multiply
 * entirely.
 */
export function buildColorMatrix({ hue, saturation }: Pick<ColorAdjustments, 'hue' | 'saturation'>): ColorMatrix {
  if (hue === 0 && saturation === 0) return IDENTITY
  const hueOnly = hueMatrix((hue / 100) * MAX_HUE_DEGREES)
  if (saturation === 0) return hueOnly
  // -100 -> 0 (fully grey), 0 -> 1 (unchanged), +100 -> 2 (double).
  const sat = saturationMatrix(1 + saturation / 100)
  return multiply(sat, hueOnly)
}

/**
 * The cross-channel colour pass (PHOTO-007 colour-controls phase), applied
 * to an ImageData in place after channelLUT.ts's per-channel tables. Runs in
 * a fixed order so the preview and the PHOTO-006 bake agree:
 *
 * 1. hue + saturation, as one folded matrix
 * 2. vibrance — the same lerp-from-luma as saturation, but weighted by how
 *    saturated each pixel already is, so muted colours move much further
 *    than vivid ones (which is the whole point of a vibrance control)
 * 3. black & white — collapses to luma, and so deliberately overrides
 *    saturation and vibrance; hue still matters, since rotating channels
 *    before the collapse changes which colours read as light or dark (the
 *    classic B&W channel-mixer trick)
 * 4. invert — last, so it inverts the finished colour rather than feeding
 *    inverted values into everything above
 *
 * Alpha is never touched.
 */
export function applyColorPass(imageData: ImageData, a: ColorAdjustments): void {
  const data = imageData.data
  const m = buildColorMatrix(a)
  const hasMatrix = m !== IDENTITY
  const vibrance = a.vibrance / 100

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i]
    let g = data[i + 1]
    let b = data[i + 2]

    if (hasMatrix) {
      const nr = m[0] * r + m[1] * g + m[2] * b
      const ng = m[3] * r + m[4] * g + m[5] * b
      const nb = m[6] * r + m[7] * g + m[8] * b
      r = nr
      g = ng
      b = nb
    }

    if (vibrance !== 0) {
      const existing = (Math.max(r, g, b) - Math.min(r, g, b)) / 255
      const factor = 1 + vibrance * (1 - Math.min(1, Math.max(0, existing)))
      const luma = LUMA_R * r + LUMA_G * g + LUMA_B * b
      r = luma + (r - luma) * factor
      g = luma + (g - luma) * factor
      b = luma + (b - luma) * factor
    }

    if (a.blackAndWhite) {
      const luma = LUMA_R * r + LUMA_G * g + LUMA_B * b
      r = luma
      g = luma
      b = luma
    }

    if (a.invert) {
      r = 255 - r
      g = 255 - g
      b = 255 - b
    }

    // Uint8ClampedArray rounds and clamps to 0..255 on assignment, so the
    // float maths above never has to guard its own range.
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
  }
}
