import { cellSizePx } from './products'
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

/**
 * The trim circle as it goes to paper (PROD-001).
 *
 * Sized in artboard px and scaled with the artwork, unlike the on-screen
 * style above whose px are screen px so guides stay hair-thin at any zoom: a
 * cut line printed at 300dpi, or exported at 2×, has to keep its proportions
 * or it lands as an invisible thread on a 2550px sheet.
 *
 * Only the trim circle is in here. The bleed tint would print over the
 * artwork, and the safe zone is a design aid — it frames what stays visible,
 * so a line around it on the finished product is exactly what nobody wants.
 */
export const PRINT_CUT_LINE_STYLE = {
  color: '#000000',
  /** Stroke width in artboard px (~0.007in at 300dpi). */
  widthPx: 2,
  /** [dash, gap] in artboard px (~0.08in / 0.05in at 300dpi). */
  dash: [24, 16] as [number, number],
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
 * Where each product sits inside `box`, in the caller's pixel space.
 *
 * A single product is centred on the artboard; a multi-up sheet lays its grid
 * out cell by cell and centres the whole block, which is why only the grid's
 * shape needs storing (products.ts) — the positions follow from it and the
 * page size, identically for every caller.
 */
export function productCellCentres(
  box: ProductGuideBox,
  spec: ProductGuideSpec,
  scale: number,
): { x: number; y: number }[] {
  const cell = cellSizePx(spec) * scale
  const columns = spec.sheet?.columns ?? 1
  const rows = spec.sheet?.rows ?? 1
  const count = spec.sheet?.count ?? 1
  const originX = box.x + (box.width - columns * cell) / 2
  const originY = box.y + (box.height - rows * cell) / 2
  return Array.from({ length: count }, (_, i) => ({
    x: originX + ((i % columns) + 0.5) * cell,
    y: originY + (Math.floor(i / columns) + 0.5) * cell,
  }))
}

/** Add one full circle as its own subpath. The moveTo matters: without it,
 *  arc() joins the previous subpath's end to this circle's start with a
 *  straight line, which strokes as a web of chords across the sheet. */
function circleSubpath(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.moveTo(x + radius, y)
  ctx.arc(x, y, radius, 0, Math.PI * 2)
}

/**
 * Draw only the cut line: one dashed trim circle per product, and nothing
 * else. This is the guide that's *meant* to reach paper — it's where the
 * product gets cut out — so it's what the exporters composite into a PNG/
 * JPEG/PDF and what a browser print of the editor page shows.
 *
 * Leaves the context as it found it (save/restore), since callers here are
 * compositing onto a finished export raster rather than a scratch overlay.
 */
export function drawProductCutLines(
  ctx: CanvasRenderingContext2D,
  box: ProductGuideBox,
  spec: ProductGuideSpec,
  scale: number,
  style = PRINT_CUT_LINE_STYLE,
): void {
  const trimRadius = (spec.diameterPx / 2) * scale
  if (trimRadius <= 0) return

  ctx.save()
  ctx.strokeStyle = style.color
  ctx.lineWidth = Math.max(1, style.widthPx * scale)
  ctx.setLineDash(style.dash.map((d) => Math.max(1, d * scale)))
  ctx.beginPath()
  for (const centre of productCellCentres(box, spec, scale)) {
    circleSubpath(ctx, centre.x, centre.y, trimRadius)
  }
  ctx.stroke()
  ctx.restore()
}

/**
 * The same cut line as SVG markup, for the one export that isn't a raster.
 * Drawn at artboard scale, to be appended inside the `<svg>` fabric produced
 * so the circles land in the artboard's own coordinate system.
 */
export function productCutLinesSVG(
  spec: ProductGuideSpec,
  size: { width: number; height: number },
  style = PRINT_CUT_LINE_STYLE,
): string {
  const trimRadius = spec.diameterPx / 2
  if (trimRadius <= 0) return ''
  const circles = productCellCentres({ x: 0, y: 0, ...size }, spec, 1)
    .map((c) => `<circle cx="${c.x}" cy="${c.y}" r="${trimRadius}" />`)
    .join('')
  return (
    `<g fill="none" stroke="${style.color}" stroke-width="${style.widthPx}" ` +
    `stroke-dasharray="${style.dash.join(' ')}">${circles}</g>`
  )
}

/**
 * Draw the wrap/bleed tint (punched clear inside every trim circle), the
 * dashed trim circles, and the dashed safe-zone circles — one set per product
 * on the page, whether that's a single pin on its own artboard or a full
 * sheet of them.
 *
 * No-ops when the trim circles would have no radius on screen — a zoomed-out
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
  const trimRadius = (spec.diameterPx / 2) * scale
  if (trimRadius <= 0) return
  const safeRadius = Math.max(0, spec.diameterPx / 2 - spec.safeZonePx) * scale
  const centres = productCellCentres(box, spec, scale)

  // Tint the whole artboard, then clear every trim circle out of it, so only
  // the waste around and between the products reads as tinted. The circles go
  // into one path: a clip takes the union of its subpaths.
  ctx.save()
  ctx.fillStyle = style.bleedTint
  ctx.fillRect(box.x, box.y, box.width, box.height)
  ctx.beginPath()
  for (const centre of centres) circleSubpath(ctx, centre.x, centre.y, trimRadius)
  ctx.clip()
  ctx.clearRect(box.x, box.y, box.width, box.height)
  ctx.restore()

  ctx.lineWidth = 1

  ctx.strokeStyle = style.trimColor
  ctx.setLineDash(style.dash)
  ctx.beginPath()
  for (const centre of centres) circleSubpath(ctx, centre.x, centre.y, trimRadius)
  ctx.stroke()

  if (safeRadius > 0) {
    ctx.strokeStyle = style.safeColor
    ctx.setLineDash(style.safeDash)
    ctx.beginPath()
    for (const centre of centres) circleSubpath(ctx, centre.x, centre.y, safeRadius)
    ctx.stroke()
  }

  ctx.setLineDash([])
}
