import type { PhotoAdjustments } from '../store/usePhotoEditorStore'

type SpatialAdjustments = Pick<
  PhotoAdjustments,
  'sharpen' | 'sharpenRadius' | 'blur' | 'motionBlur' | 'motionBlurAngle' | 'noiseReduction' | 'grain'
>

/**
 * Every spatial radius is a fraction of the image's shorter edge, not a pixel
 * count — these are the fractions each control reaches at its maximum.
 *
 * That indirection is what keeps the pass resolution-independent, which the
 * per-pixel passes (toneLUT, channelLUT, colorPass) got for free and this one
 * does not. renderAdjustedImage is called at two different sizes for the same
 * image: full resolution for the preview and the PHOTO-006 bake, and a 256px
 * proxy for useHistogram. A radius fixed in pixels would blur the proxy far
 * harder than the real image, so the histogram would plot a picture the
 * preview never showed. Scaling off the render size instead means the same
 * slider describes the same *look* at any size.
 */
const MAX_BLUR_FRACTION = 0.03
const MAX_SHARPEN_RADIUS_FRACTION = 0.01
const MAX_MOTION_FRACTION = 0.06
const MAX_DENOISE_FRACTION = 0.004

/** Sharpen radius at the low end of its slider. A radius that reached 0 would
 *  make the unsharp mask a no-op at amount > 0, which reads as a broken
 *  control rather than a subtle one. */
const MIN_SHARPEN_RADIUS_FRACTION = 0.0008

/** Amount of brightening/darkening at the sharpen slider's top, as a
 *  multiplier on the difference between the image and its blurred self. 1.5
 *  is punchy without tipping straight into halos on a normal photo. */
const MAX_SHARPEN_AMOUNT = 1.5

/** Degrees of motion-blur direction at each end of its slider. A motion
 *  streak is a line, and a line at 100° is the same line as one at -80°, so
 *  ±90° already covers every distinct direction — a ±180° range like `hue`'s
 *  would just spend half the slider repeating itself. */
const MAX_MOTION_DEGREES = 90

/** Most taps a motion streak is sampled with, however long it is. Cost is
 *  linear in tap count (unlike the box blur below, which is free of its
 *  radius), so a long streak strides along the line instead of visiting every
 *  pixel on it — past this many samples the extra taps stop being visible and
 *  only cost frames. */
const MAX_MOTION_SAMPLES = 32

/** Peak grain excursion in 8-bit levels, at the grain slider's top. */
const MAX_GRAIN_LEVELS = 48

/** Shorter edge, in pixels, at which one grain particle is one pixel. Above
 *  this the particle grows to match, so grain stays the same size *relative
 *  to the picture* at every render size — the same resolution-independence
 *  the radii above get from being fractions. Without it grain would be the
 *  one control whose look changed between the capped preview, the 256px
 *  histogram proxy and the full-resolution bake: a particle fixed at one
 *  pixel is three times finer on a 3000px image than on the 1000px preview
 *  it was judged from. */
const GRAIN_REFERENCE_EDGE = 900

/** Grain particle size in pixels for an image of this shorter edge. Exported
 *  so the scaling rule can be checked on its own — verifying it through a
 *  real render would mean allocating a 1350px image, since that's the
 *  smallest size at which a particle grows past one pixel. */
export function grainParticleSize(shortEdge: number): number {
  return Math.max(1, Math.round(shortEdge / GRAIN_REFERENCE_EDGE))
}

/** How far a pixel may sit from its local average before noise reduction
 *  stops treating it as noise, in 8-bit levels. Past this it reads as an
 *  edge — real detail — and is left alone, which is what keeps the control
 *  from being an ordinary blur. */
const DENOISE_EDGE_THRESHOLD = 28

/** True when the spatial pass would change any pixel, so callers can skip it
 *  — and, with needsChannelLUTs and needsColorPass also false, skip the whole
 *  getImageData/putImageData round trip. Worth more here than for the other
 *  passes: this is the only one whose cost scales with the blur radius rather
 *  than being one table lookup per pixel. */
export function needsSpatialPass(a: SpatialAdjustments): boolean {
  return (
    a.sharpen !== 0 ||
    a.blur !== 0 ||
    a.motionBlur !== 0 ||
    a.noiseReduction !== 0 ||
    a.grain !== 0
  )
}

/** Clamp to a valid index along one axis, so a window overhanging an edge
 *  reads the edge pixel rather than wrapping to the far side (which would
 *  smear the right of the image into the left). */
const clampIndex = (v: number, max: number) => (v < 0 ? 0 : v > max ? max : v)

/**
 * One box-blur pass over a single axis, written with a running sum: the
 * window's total is carried from pixel to pixel, adding the pixel entering it
 * and subtracting the one leaving, so each output costs one add and one
 * subtract *regardless of radius*.
 *
 * That property is the reason the blur is built out of box passes at all. The
 * textbook gaussian convolution costs O(radius) per pixel per axis, which at
 * the radii a 3% slider reaches on a large photo is far too slow to redo on
 * every animation frame while a slider is being dragged.
 *
 * `src` and `dst` are interleaved RGBA planes; alpha is not read or written.
 */
function boxBlurAxis(
  src: Float32Array,
  dst: Float32Array,
  width: number,
  height: number,
  radius: number,
  horizontal: boolean,
): void {
  // Along the axis being blurred: how many pixels the window spans, and the
  // stride between them. Across it: how many lines to walk.
  const lineLength = horizontal ? width : height
  const lineCount = horizontal ? height : width
  const step = (horizontal ? 1 : width) * 4
  const lineStep = (horizontal ? width : 1) * 4
  const span = radius * 2 + 1
  const last = lineLength - 1

  // Reciprocal once rather than a divide per output pixel, and the two edge
  // values hoisted per line: everything in the loop below is a typed-array
  // read and an add. This is the innermost code in the whole pass — it runs
  // three channels wide, twice per box pass, three box passes deep — so a
  // closure or a clamp call per pixel here is worth several hundred
  // milliseconds on a full-size photo.
  const inverse = 1 / span

  for (let line = 0; line < lineCount; line++) {
    const base = line * lineStep
    for (let channel = 0; channel < 3; channel++) {
      const origin = base + channel
      const firstValue = src[origin]
      const lastValue = src[origin + last * step]

      // Prime the window over [-radius, radius]. Everything left of the line
      // clamps onto its first pixel, which is radius + 1 copies of it.
      let sum = firstValue * (radius + 1)
      for (let i = 1; i <= radius; i++) sum += src[origin + (i > last ? last : i) * step]

      let out = origin
      for (let i = 0; i < lineLength; i++) {
        dst[out] = sum * inverse
        out += step
        // Slide the window: take in the pixel ahead, drop the one behind,
        // clamping each onto the line's end value rather than wrapping.
        const entering = i + radius + 1
        const leaving = i - radius
        sum +=
          (entering > last ? lastValue : src[origin + entering * step]) -
          (leaving < 0 ? firstValue : src[origin + leaving * step])
      }
    }
  }
}

/**
 * A gaussian blur approximated by three successive box passes per axis.
 *
 * Three boxes is the standard approximation: repeatedly convolving a box with
 * itself converges on a gaussian, and by the third pass the difference is
 * invisible on a photograph — while staying O(1) per pixel in the radius,
 * which a true gaussian kernel is not.
 *
 * Blurs `data` in place, using `scratch` as the ping-pong buffer (passed in
 * rather than allocated, since the unsharp mask and the noise reduction each
 * need their own blurred copy on the same frame).
 */
export function gaussianBlur(
  data: Float32Array,
  scratch: Float32Array,
  width: number,
  height: number,
  radius: number,
): void {
  if (radius < 1) return
  for (let pass = 0; pass < 3; pass++) {
    boxBlurAxis(data, scratch, width, height, radius, true)
    boxBlurAxis(scratch, data, width, height, radius, false)
  }
}

/**
 * A directional streak: each output pixel is the average of the pixels along
 * a line of `length` through it at `degrees`, which is what a camera records
 * when the subject (or the photographer) moved during the exposure.
 *
 * Unlike the box blur this is a genuine gather — there's no running sum to
 * carry along an arbitrary diagonal — so the tap count is capped
 * (MAX_MOTION_SAMPLES) and long streaks stride along the line.
 */
export function motionBlur(
  src: Float32Array,
  dst: Float32Array,
  width: number,
  height: number,
  length: number,
  degrees: number,
): void {
  const radians = (degrees * Math.PI) / 180
  const dx = Math.cos(radians)
  const dy = Math.sin(radians)
  // Taps spread over the streak's full length, centred on the pixel.
  const taps = Math.min(MAX_MOTION_SAMPLES, Math.max(2, Math.round(length)))
  const half = (taps - 1) / 2
  const spacing = taps > 1 ? length / (taps - 1) : 0
  const maxX = width - 1
  const maxY = height - 1
  const inverse = 1 / taps

  // Where each tap sits relative to the pixel being written. The streak is
  // the same line everywhere in the image, so these offsets don't depend on
  // x or y — computing them once here takes two multiplies and two roundings
  // per tap out of the innermost loop, which at a megapixel and 32 taps is
  // over a hundred million operations saved.
  const offsetX = new Int32Array(taps)
  const offsetY = new Int32Array(taps)
  for (let t = 0; t < taps; t++) {
    const along = (t - half) * spacing
    // Nearest-neighbour along the line: at these tap counts the streak is
    // already an average of many pixels, so bilinear sampling would cost four
    // reads per tap to smooth something nothing can see.
    offsetX[t] = Math.round(dx * along)
    offsetY[t] = Math.round(dy * along)
  }

  let o = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let t = 0; t < taps; t++) {
        const sx = clampIndex(x + offsetX[t], maxX)
        const sy = clampIndex(y + offsetY[t], maxY)
        const i = (sy * width + sx) * 4
        r += src[i]
        g += src[i + 1]
        b += src[i + 2]
      }
      dst[o] = r * inverse
      dst[o + 1] = g * inverse
      dst[o + 2] = b * inverse
      o += 4
    }
  }
}

/**
 * Deterministic per-pixel noise in -1..1, from an integer hash of the pixel's
 * index rather than Math.random.
 *
 * Determinism is not a nicety here: the preview redraws on every animation
 * frame, and PHOTO-005's undo and PHOTO-006's bake re-render from the same
 * stored adjustments. Random grain would crawl and shimmer while an unrelated
 * slider moved, and the baked image would never match the preview it was
 * approved from.
 */
function hashNoise(index: number): number {
  let h = Math.imul(index ^ 0x9e3779b9, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= h >>> 16
  // >>> 0 first: the result of the mixing above is a *signed* 32-bit int, so
  // dividing it directly would only ever reach half the intended range.
  return ((h >>> 0) / 0xffffffff) * 2 - 1
}

/**
 * The neighbourhood pass (PHOTO-008), applied to an ImageData in place after
 * the per-pixel passes. Runs in a fixed order, chosen to match how the same
 * tools are sequenced in a darkroom or a raw converter, so the preview and
 * the PHOTO-006 bake agree:
 *
 * 1. noise reduction — clean up before anything amplifies the speckle
 * 2. blur (gaussian, then motion) — the softening the image is meant to have
 * 3. sharpen — an unsharp mask, after blurring, so the two are opposites the
 *    user can balance rather than the sharpen being silently undone
 * 4. grain — last, so it lands *on* the finished image; grain that got blurred
 *    or sharpened would read as texture in the photo instead of on top of it
 *
 * Alpha is never touched, matching every other pass in the pipeline.
 */
export function applySpatialPass(imageData: ImageData, a: SpatialAdjustments): void {
  const { width, height, data } = imageData
  const shortEdge = Math.min(width, height)

  // Float working copy: the box blur's running sum accumulates fractional
  // values, and rounding to 8 bits between the three passes would quantise
  // the result into visible banding.
  const work = new Float32Array(data.length)
  work.set(data)
  const scratch = new Float32Array(data.length)

  if (a.noiseReduction !== 0) {
    // Floored at one pixel: the denoise fraction is small by design, so on a
    // modest image it rounds to zero and the control would do nothing at all
    // rather than doing a little — the same reason sharpen has a minimum
    // radius.
    const radius = Math.max(1, Math.round((a.noiseReduction / 100) * MAX_DENOISE_FRACTION * shortEdge))
    const smoothed = work.slice()
    gaussianBlur(smoothed, scratch, width, height, radius)
    // Edge-preserving blend: a pixel close to its local average is noise and
    // moves most of the way to it; one far from it is an edge and barely
    // moves. A flat blend here would be the blur control over again.
    const strength = a.noiseReduction / 100
    for (let i = 0; i < work.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const original = work[i + c]
        const local = smoothed[i + c]
        const distance = Math.abs(original - local)
        const edgeness = Math.min(1, distance / DENOISE_EDGE_THRESHOLD)
        work[i + c] = original + (local - original) * strength * (1 - edgeness)
      }
    }
  }

  if (a.blur !== 0) {
    const radius = Math.round((a.blur / 100) * MAX_BLUR_FRACTION * shortEdge)
    gaussianBlur(work, scratch, width, height, radius)
  }

  if (a.motionBlur !== 0) {
    const length = (a.motionBlur / 100) * MAX_MOTION_FRACTION * shortEdge
    if (length >= 1) {
      motionBlur(work, scratch, width, height, length, (a.motionBlurAngle / 100) * MAX_MOTION_DEGREES)
      // Whole-buffer copy back, alpha included. motionBlur leaves scratch's
      // alpha lane untouched, so what lands in `work` there is stale — which
      // is harmless only because nothing downstream reads work's alpha and the
      // write-back below is RGB-only. Anything added here that does read alpha
      // has to copy the three colour lanes instead.
      work.set(scratch)
    }
  }

  if (a.sharpen !== 0) {
    const radiusFraction =
      MIN_SHARPEN_RADIUS_FRACTION +
      (a.sharpenRadius / 100) * (MAX_SHARPEN_RADIUS_FRACTION - MIN_SHARPEN_RADIUS_FRACTION)
    const radius = Math.max(1, Math.round(radiusFraction * shortEdge))
    const blurred = work.slice()
    gaussianBlur(blurred, scratch, width, height, radius)
    // Unsharp mask: add back a multiple of what the blur removed, which is
    // exactly the fine detail. Negative amounts subtract it instead, softening
    // without the halo a plain blur of the same strength would give.
    const amount = (a.sharpen / 100) * MAX_SHARPEN_AMOUNT
    for (let i = 0; i < work.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        work[i + c] += (work[i + c] - blurred[i + c]) * amount
      }
    }
  }

  if (a.grain !== 0) {
    const scale = (a.grain / 100) * MAX_GRAIN_LEVELS
    const particle = grainParticleSize(shortEdge)
    const cellsAcross = Math.ceil(width / particle)
    let i = 0
    for (let y = 0; y < height; y++) {
      const cellY = (y / particle) | 0
      for (let x = 0; x < width; x++) {
        // One offset for all three channels: film grain is a monochrome
        // disturbance in the emulsion, and per-channel noise would read as
        // colour speckle (a sensor artefact) rather than grain.
        const offset = hashNoise(cellY * cellsAcross + ((x / particle) | 0)) * scale
        work[i] += offset
        work[i + 1] += offset
        work[i + 2] += offset
        i += 4
      }
    }
  }

  // Uint8ClampedArray rounds and clamps on assignment, so the float maths
  // above never had to guard its own range.
  for (let i = 0; i < data.length; i += 4) {
    data[i] = work[i]
    data[i + 1] = work[i + 1]
    data[i + 2] = work[i + 2]
  }
}
