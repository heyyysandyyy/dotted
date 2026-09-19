import { apply, invert, isAffine, multiply, renderMatrix } from './geometry'
import type { GeometryPlan, Mat3 } from './geometry'

/**
 * Draws `source` through a geometry plan (PHOTO-009) onto `ctx`, filling a
 * width×height render of the plan's output. `ctx.filter` is honoured, so the
 * brightness/contrast CSS filter still applies in the same draw.
 *
 * Two paths:
 * - Affine plans (everything but keystone correction) go straight through the
 *   canvas's own transform and drawImage — GPU-composited and resampled by
 *   the browser, `imageSmoothingQuality: 'high'` for smooth, smoothing off
 *   for nearest.
 * - A keystone plan is a true projective map, which a 2d canvas can't draw,
 *   so it's warped per pixel here: every output pixel is mapped back through
 *   the plan and sampled from the source (bilinear for smooth). The source is
 *   first drawn down to roughly the render's density, so a preview of a huge
 *   original doesn't read tens of megapixels to fill 1400 of them.
 */
export function drawGeometry(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  plan: GeometryPlan,
  width: number,
  height: number,
): void {
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  // A free rotation leaves the corners uncovered; they must come out clear,
  // not keep whatever the previous frame drew there.
  ctx.clearRect(0, 0, width, height)
  const toSource = renderMatrix(plan, width, height)
  const smooth = plan.resample === 'smooth'
  if (isAffine(toSource)) {
    const f = invert(toSource)
    ctx.imageSmoothingEnabled = smooth
    if (smooth) ctx.imageSmoothingQuality = 'high'
    ctx.setTransform(f[0], f[3], f[1], f[4], f[2], f[5])
    ctx.drawImage(source, 0, 0, plan.sourceWidth, plan.sourceHeight)
    ctx.restore()
    return
  }
  ctx.restore()
  const warped = warpPixels(source, plan, toSource, width, height, smooth)
  if (!warped) return
  // drawImage (not putImageData) so the caller's ctx.filter still applies.
  ctx.drawImage(warped, 0, 0)
}

/** The source drawn at `density` of its natural size, as pixels. */
function sourcePixels(source: CanvasImageSource, plan: GeometryPlan, density: number) {
  const w = Math.max(1, Math.round(plan.sourceWidth * density))
  const h = Math.max(1, Math.round(plan.sourceHeight * density))
  const el = document.createElement('canvas')
  el.width = w
  el.height = h
  const ctx = el.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, w, h)
  return { data: ctx.getImageData(0, 0, w, h), sx: w / plan.sourceWidth, sy: h / plan.sourceHeight }
}

function warpPixels(
  source: CanvasImageSource,
  plan: GeometryPlan,
  toSource: Mat3,
  width: number,
  height: number,
  smooth: boolean,
): HTMLCanvasElement | null {
  // How many source pixels one render pixel spans, at the image's centre —
  // near enough everywhere for the modest keystone range allowed.
  const c = apply(toSource, width / 2, height / 2)
  const r = apply(toSource, width / 2 + 1, height / 2)
  const d = apply(toSource, width / 2, height / 2 + 1)
  const span = Math.max(Math.hypot(r.x - c.x, r.y - c.y), Math.hypot(d.x - c.x, d.y - c.y))
  const density = span > 1 ? 1 / span : 1
  const src = sourcePixels(source, plan, density)
  if (!src) return null

  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  const octx = out.getContext('2d')
  if (!octx) return null
  const result = octx.createImageData(width, height)
  warpImageData(src.data, result, multiply([src.sx, 0, 0, 0, src.sy, 0, 0, 0, 1], toSource), smooth)
  octx.putImageData(result, 0, 0)
  return out
}

/**
 * Fill `out` by mapping each of its pixel centres through `toSource` (output
 * pixel → `src` pixel coordinates) and sampling `src` there. A sample that
 * lands outside the source stays transparent. Exported for testing.
 */
export function warpImageData(src: ImageData, out: ImageData, toSource: Mat3, smooth: boolean): void {
  const sw = src.width
  const sh = src.height
  const s = src.data
  const o = out.data
  const [a, b, c, d, e, f, g, h, i] = toSource
  for (let y = 0; y < out.height; y++) {
    const py = y + 0.5
    for (let x = 0; x < out.width; x++) {
      const px = x + 0.5
      const w = g * px + h * py + i
      // Pixel centres are at +0.5; shift back so integer coordinates index
      // pixels directly.
      const u = (a * px + b * py + c) / w - 0.5
      const v = (d * px + e * py + f) / w - 0.5
      const oi = (y * out.width + x) * 4
      if (u < -0.5 || v < -0.5 || u > sw - 0.5 || v > sh - 0.5) continue
      if (!smooth) {
        const si = (Math.min(sh - 1, Math.max(0, Math.round(v))) * sw + Math.min(sw - 1, Math.max(0, Math.round(u)))) * 4
        o[oi] = s[si]
        o[oi + 1] = s[si + 1]
        o[oi + 2] = s[si + 2]
        o[oi + 3] = s[si + 3]
        continue
      }
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(u)))
      const y0 = Math.max(0, Math.min(sh - 1, Math.floor(v)))
      const x1 = Math.min(sw - 1, x0 + 1)
      const y1 = Math.min(sh - 1, y0 + 1)
      const fx = Math.max(0, Math.min(1, u - x0))
      const fy = Math.max(0, Math.min(1, v - y0))
      const i00 = (y0 * sw + x0) * 4
      const i10 = (y0 * sw + x1) * 4
      const i01 = (y1 * sw + x0) * 4
      const i11 = (y1 * sw + x1) * 4
      for (let k = 0; k < 4; k++) {
        const top = s[i00 + k] + (s[i10 + k] - s[i00 + k]) * fx
        const bottom = s[i01 + k] + (s[i11 + k] - s[i01 + k]) * fx
        o[oi + k] = top + (bottom - top) * fy
      }
    }
  }
}
