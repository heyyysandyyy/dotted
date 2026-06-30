/**
 * UX-010 (option 3): offline "remove solid background". No ML model, no network —
 * a flood-fill from the image edges that makes pixels similar to the corner
 * colour transparent. Works for solid / near-solid backgrounds (product shots,
 * flat colours), not busy photographic backgrounds.
 */

/** Default colour-distance tolerance (Euclidean over 0–255 RGB). */
export const DEFAULT_TOLERANCE = 60

/** Flood-fill the background from the borders, writing alpha into `data`. */
function floodFill(data: Uint8ClampedArray, w: number, h: number, tol: number): void {
  // Seed background colour = average of the four corners.
  const at = (x: number, y: number) => (y * w + x) * 4
  const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)]
  let sr = 0
  let sg = 0
  let sb = 0
  for (const c of corners) {
    sr += data[c]
    sg += data[c + 1]
    sb += data[c + 2]
  }
  sr /= 4
  sg /= 4
  sb /= 4

  const tol2 = tol * tol
  const featherTol = tol * 1.5
  const feather2 = featherTol * featherTol
  const visited = new Uint8Array(w * h)
  const stack: number[] = []

  // Seed every border pixel.
  for (let x = 0; x < w; x++) {
    stack.push(x, (h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    stack.push(y * w, y * w + (w - 1))
  }

  while (stack.length) {
    const idx = stack.pop()!
    if (visited[idx]) continue
    visited[idx] = 1
    const p = idx * 4
    const dr = data[p] - sr
    const dg = data[p + 1] - sg
    const db = data[p + 2] - sb
    const d2 = dr * dr + dg * dg + db * db
    if (d2 <= tol2) {
      data[p + 3] = 0 // fully background → transparent
      const x = idx % w
      const y = (idx - x) / w
      if (x > 0) stack.push(idx - 1)
      if (x < w - 1) stack.push(idx + 1)
      if (y > 0) stack.push(idx - w)
      if (y < h - 1) stack.push(idx + w)
    } else if (d2 <= feather2) {
      // Edge band: fade alpha so the cut isn't hard-edged. Don't spread.
      const t = (Math.sqrt(d2) - tol) / (featherTol - tol)
      data[p + 3] = Math.round(data[p + 3] * Math.min(1, Math.max(0, t)))
    }
  }
}

/**
 * Remove a solid background from an image element. Returns a transparent PNG
 * data URL at the source's native resolution.
 */
export function removeSolidBackground(
  source: CanvasImageSource,
  width: number,
  height: number,
  tolerance = DEFAULT_TOLERANCE,
): string {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D context unavailable')
  ctx.drawImage(source, 0, 0, width, height)
  const imageData = ctx.getImageData(0, 0, width, height)
  floodFill(imageData.data, width, height, tolerance)
  ctx.putImageData(imageData, 0, 0)
  return c.toDataURL('image/png')
}
