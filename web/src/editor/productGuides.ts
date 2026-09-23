import { cellSizePx, trimSizePx } from './products'
import type { ProductGuideSpec, ProductShape } from './products'

/**
 * Corner crop marks (PROD-003), as fractions of an inch: how far off the trim
 * they start, and how long they run. A pad is guillotined, so the marks have
 * to sit clear of the artwork — the gap — while staying long enough to line a
 * blade up against.
 */
const MARK_GAP_IN = 0.0625
const MARK_LEN_IN = 0.125

/**
 * Where one cell's corner marks go, in the caller's pixel space: eight
 * segments, two at each corner, running outward along the trim's own edges.
 *
 * Both are held inside the space between this product and the next one on a
 * ganged sheet (two bleeds' worth), so a mark can never reach across into a
 * neighbour's artwork — which on a full sheet of pads would print a line
 * through someone's design.
 */
export function cornerMarkSegments(
  centre: { x: number; y: number },
  trimW: number,
  trimH: number,
  bleedPx: number,
): { x1: number; y1: number; x2: number; y2: number }[] {
  const gap = Math.min(bleedPx / 2, MARK_GAP_IN * DPI_REFERENCE)
  const len = Math.min(MARK_LEN_IN * DPI_REFERENCE, Math.max(0, 2 * bleedPx - gap))
  if (len <= 0) return []
  const left = centre.x - trimW / 2
  const right = centre.x + trimW / 2
  const top = centre.y - trimH / 2
  const bottom = centre.y + trimH / 2
  const segments: { x1: number; y1: number; x2: number; y2: number }[] = []
  for (const [x, sx] of [
    [left, -1],
    [right, 1],
  ] as const) {
    for (const [y, sy] of [
      [top, -1],
      [bottom, 1],
    ] as const) {
      // Along the horizontal trim edge, running away from the product...
      segments.push({ x1: x + sx * gap, y1: y, x2: x + sx * (gap + len), y2: y })
      // ...and along the vertical one.
      segments.push({ x1: x, y1: y + sy * gap, x2: x, y2: y + sy * (gap + len) })
    }
  }
  return segments
}

/** Marks are sized in inches; everything here is already in artboard px at
 *  the product's own print resolution, which PROD-001 fixes at 300. */
const DPI_REFERENCE = 300

/**
 * Trim/bleed/safe-zone drawing math for print products (PROD-001). The
 * counterpart to pageGuides.ts, which does the same job for rectangular book
 * pages — one function, several callers (the canvas overlay and the
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
  /** [dash, gap] for the trim outline. */
  dash: [number, number]
  /** [dash, gap] for the safe-zone outline, finer so the two read apart. */
  safeDash: [number, number]
}

/**
 * The trim outline as it goes to paper (PROD-001).
 *
 * Sized in artboard px and scaled with the artwork, unlike the on-screen
 * style above whose px are screen px so guides stay hair-thin at any zoom: a
 * cut line printed at 300dpi, or exported at 2×, has to keep its proportions
 * or it lands as an invisible thread on a 2550px sheet.
 *
 * Only the trim outline is in here. The bleed tint would print over the
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
  const cell = cellSizePx(spec)
  const cellW = cell.width * scale
  const cellH = cell.height * scale
  const columns = spec.sheet?.columns ?? 1
  const rows = spec.sheet?.rows ?? 1
  const count = spec.sheet?.count ?? 1
  const originX = box.x + (box.width - columns * cellW) / 2
  const originY = box.y + (box.height - rows * cellH) / 2
  return Array.from({ length: count }, (_, i) => ({
    x: originX + ((i % columns) + 0.5) * cellW,
    y: originY + (Math.floor(i / columns) + 0.5) * cellH,
  }))
}

/**
 * Add one product outline, centred on (x, y), as its own subpath.
 *
 * The moveTo before arc() matters: without it, arc() joins the previous
 * subpath's end to this circle's start with a straight line, which strokes as
 * a web of chords across the sheet. rect() opens its own subpath already.
 */
function outlineSubpath(
  ctx: CanvasRenderingContext2D,
  shape: ProductShape,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  if (shape === 'rect') {
    ctx.rect(x - width / 2, y - height / 2, width, height)
    return
  }
  const radius = width / 2
  ctx.moveTo(x + radius, y)
  ctx.arc(x, y, radius, 0, Math.PI * 2)
}

/**
 * Draw only the cut line: one dashed trim outline per product, and nothing
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
  const trim = trimSizePx(spec)
  // A rotated sheet lays every cell on its side, marks and outline with it.
  const turned = spec.sheet?.rotated === true
  const trimW = (turned ? trim.height : trim.width) * scale
  const trimH = (turned ? trim.width : trim.height) * scale
  if (trimW <= 0 || trimH <= 0) return

  const corners = spec.marks === 'corner'
  ctx.save()
  ctx.strokeStyle = style.color
  ctx.lineWidth = Math.max(1, style.widthPx * scale)
  // Corner marks are solid: they're a target for a blade, not an outline to
  // follow by eye, and a dashed one reads as part of the artwork.
  ctx.setLineDash(corners ? [] : style.dash.map((d) => Math.max(1, d * scale)))
  ctx.beginPath()
  for (const centre of productCellCentres(box, spec, scale)) {
    if (!corners) {
      outlineSubpath(ctx, spec.shape, centre.x, centre.y, trimW, trimH)
      continue
    }
    for (const s of cornerMarkSegments(centre, trimW, trimH, spec.bleedPx * scale)) {
      ctx.moveTo(s.x1, s.y1)
      ctx.lineTo(s.x2, s.y2)
    }
  }
  ctx.stroke()
  ctx.restore()
}

/**
 * The same cut line as SVG markup, for the one export that isn't a raster.
 * Drawn at artboard scale, to be appended inside the `<svg>` fabric produced
 * so the outlines land in the artboard's own coordinate system.
 */
export function productCutLinesSVG(
  spec: ProductGuideSpec,
  size: { width: number; height: number },
  style = PRINT_CUT_LINE_STYLE,
): string {
  const trim = trimSizePx(spec)
  if (trim.width <= 0 || trim.height <= 0) return ''
  const centres = productCellCentres({ x: 0, y: 0, ...size }, spec, 1)
  const turned = spec.sheet?.rotated === true
  const trimW = turned ? trim.height : trim.width
  const trimH = turned ? trim.width : trim.height
  if (spec.marks === 'corner') {
    const lines = centres
      .flatMap((c) => cornerMarkSegments(c, trimW, trimH, spec.bleedPx))
      .map((s) => `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" />`)
      .join('')
    if (!lines) return ''
    return `<g fill="none" stroke="${style.color}" stroke-width="${style.widthPx}">${lines}</g>`
  }
  const shapes = centres
    .map((c) =>
      spec.shape === 'rect'
        ? `<rect x="${c.x - trimW / 2}" y="${c.y - trimH / 2}" ` +
          `width="${trimW}" height="${trimH}" />`
        : `<circle cx="${c.x}" cy="${c.y}" r="${trimW / 2}" />`,
    )
    .join('')
  return (
    `<g fill="none" stroke="${style.color}" stroke-width="${style.widthPx}" ` +
    `stroke-dasharray="${style.dash.join(' ')}">${shapes}</g>`
  )
}

/**
 * Draw the wrap/bleed tint (punched clear inside every trim outline), the
 * dashed trim outlines, and the dashed safe-zone outlines — one set per
 * product on the page, whether that's a single pin on its own artboard or a
 * full sheet of them.
 *
 * No-ops when the trim outlines would have no size on screen — a zoomed-out
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
  const trim = trimSizePx(spec)
  // A sheet ganged with the product turned a quarter (PROD-003) draws every
  // cell that way round: trim, safe zone and the tint punched out of them.
  const turned = spec.sheet?.rotated === true
  const trimW = (turned ? trim.height : trim.width) * scale
  const trimH = (turned ? trim.width : trim.height) * scale
  if (trimW <= 0 || trimH <= 0) return
  // The safe zone is inset by the same amount on every edge, so a rectangle
  // loses two insets off each axis and a circle loses one off its radius —
  // which is the same sum, since its width is its diameter.
  const safeW = Math.max(0, (turned ? trim.height : trim.width) - spec.safeZonePx * 2) * scale
  const safeH = Math.max(0, (turned ? trim.width : trim.height) - spec.safeZonePx * 2) * scale
  const centres = productCellCentres(box, spec, scale)

  // Tint the whole artboard, then clear every trim outline out of it, so only
  // the waste around and between the products reads as tinted. The outlines go
  // into one path: a clip takes the union of its subpaths.
  ctx.save()
  ctx.fillStyle = style.bleedTint
  ctx.fillRect(box.x, box.y, box.width, box.height)
  ctx.beginPath()
  for (const centre of centres) outlineSubpath(ctx, spec.shape, centre.x, centre.y, trimW, trimH)
  ctx.clip()
  ctx.clearRect(box.x, box.y, box.width, box.height)
  ctx.restore()

  ctx.lineWidth = 1

  ctx.strokeStyle = style.trimColor
  ctx.setLineDash(style.dash)
  ctx.beginPath()
  for (const centre of centres) outlineSubpath(ctx, spec.shape, centre.x, centre.y, trimW, trimH)
  ctx.stroke()

  if (safeW > 0 && safeH > 0) {
    ctx.strokeStyle = style.safeColor
    ctx.setLineDash(style.safeDash)
    ctx.beginPath()
    for (const centre of centres) outlineSubpath(ctx, spec.shape, centre.x, centre.y, safeW, safeH)
    ctx.stroke()
  }

  ctx.setLineDash([])
}
