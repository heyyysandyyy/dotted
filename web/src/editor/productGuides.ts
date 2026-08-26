import type { ProductGuideSpec } from './products'

/**
 * Trim/bleed/safe-zone drawing math for circular print products (PROD-001).
 * The counterpart to pageGuides.ts, which does the same job for rectangular
 * book pages — one function, several callers (the canvas overlay and the
 * new-design preview), so no two of them can draw a product differently.
 *
 * Everything is drawn in the caller's own pixel space: `box` is where the
 * artboard sits on screen and `scale` converts the spec's artboard px into
 * that space (canvas zoom, or a preview's much smaller scale). This function
 * only draws — it knows nothing about zoom, pan, or device pixel ratio.
 */

export interface ProductGuideStyle {
  /** Tint over the bleed/wrap area — the part that won't be on the face. */
  bleedTint: string
  trimColor: string
  safeColor: string
  /** [dash, gap] for the trim circle. */
  dash: [number, number]
  /** [dash, gap] for the safe-zone circle, finer so the two read apart. */
  safeDash: [number, number]
}

export const DEFAULT_PRODUCT_GUIDE_STYLE: ProductGuideStyle = {
  // Same pink tint the book bleed guides use (pageGuides.ts), so "this area
  // gets lost" means one thing across the whole editor.
  bleedTint: 'rgba(236, 72, 153, 0.16)',
  trimColor: 'rgba(24, 24, 27, 0.85)',
  safeColor: 'rgba(59, 130, 246, 0.85)',
  dash: [6, 4],
  safeDash: [3, 3],
}

export interface ProductGuideBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Draw the wrap/bleed tint (punched clear inside the trim circle), the dashed
 * trim circle, and the dashed safe-zone circle, all concentric on the
 * artboard's centre.
 *
 * No-ops when the trim circle would have no radius on screen — a zoomed-out
 * thumbnail can scale a 450px pin down past the point where any of this is
 * meaningful.
 */
export function drawProductGuides(
  ctx: CanvasRenderingContext2D,
  box: ProductGuideBox,
  spec: ProductGuideSpec,
  scale: number,
  style: ProductGuideStyle = DEFAULT_PRODUCT_GUIDE_STYLE,
): void {
  const centreX = box.x + box.width / 2
  const centreY = box.y + box.height / 2
  const trimRadius = (spec.diameterPx / 2) * scale
  if (trimRadius <= 0) return
  const safeRadius = Math.max(0, spec.diameterPx / 2 - spec.safeZonePx) * scale

  // Tint the whole artboard, then clear the trim circle out of it, so only
  // the corners and the wrap margin around the circle read as tinted.
  ctx.save()
  ctx.fillStyle = style.bleedTint
  ctx.fillRect(box.x, box.y, box.width, box.height)
  ctx.beginPath()
  ctx.arc(centreX, centreY, trimRadius, 0, Math.PI * 2)
  ctx.clip()
  ctx.clearRect(box.x, box.y, box.width, box.height)
  ctx.restore()

  ctx.lineWidth = 1

  ctx.strokeStyle = style.trimColor
  ctx.setLineDash(style.dash)
  ctx.beginPath()
  ctx.arc(centreX, centreY, trimRadius, 0, Math.PI * 2)
  ctx.stroke()

  if (safeRadius > 0) {
    ctx.strokeStyle = style.safeColor
    ctx.setLineDash(style.safeDash)
    ctx.beginPath()
    ctx.arc(centreX, centreY, safeRadius, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.setLineDash([])
}
