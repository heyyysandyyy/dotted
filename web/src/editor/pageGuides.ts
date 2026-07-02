/**
 * Shared bleed/trim/cut-mark/spine drawing math for book pages (UX-015,
 * BOOK-002). One function, two callers — the full canvas overlay
 * (CanvasGuides) and page thumbnails (PageBar, PageStack) — so their guide
 * rendering can never drift out of sync.
 *
 * Everything here works in the caller's own pixel space: `box` and `bleed`
 * are already whatever scale the caller is drawing at (full canvas zoom, or a
 * thumbnail's tiny scale). This function only draws; it doesn't know about
 * zoom, viewport origin, or device pixel ratio.
 */

export interface GuideStyle {
  bleedTint: string
  trimColor: string
  spineColor: string
  /** [dash, gap] for the trim and spine lines. */
  dash: [number, number]
  markLen: number
  markGap: number
}

/** The full canvas overlay's existing look (UX-015) — kept as the default so
 *  extracting this function changes no pixels there. */
export const DEFAULT_GUIDE_STYLE: GuideStyle = {
  bleedTint: 'rgba(236, 72, 153, 0.16)',
  trimColor: 'rgba(24, 24, 27, 0.85)',
  spineColor: 'rgba(113, 113, 122, 0.85)',
  dash: [6, 4],
  markLen: 10,
  markGap: 4,
}

/** A smaller, subtler variant for thumbnails (BOOK-002) — proportioned down
 *  rather than reusing the full-canvas overlay's screen-px constants verbatim,
 *  which would be too heavy at thumbnail scale. */
export const THUMBNAIL_GUIDE_STYLE: GuideStyle = {
  ...DEFAULT_GUIDE_STYLE,
  dash: [2, 1.5],
  markLen: 3,
  markGap: 1,
}

export interface GuideBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Draw the bleed tint (punched clear over the trim area), dashed trim line,
 * and outer-corner cut marks into `box`; adds the dashed centre spine line and
 * spine cut marks when `isSpread`. No-ops if the bleed doesn't fit.
 */
export function drawPageGuides(
  ctx: CanvasRenderingContext2D,
  box: GuideBox,
  bleed: number,
  isSpread: boolean,
  style: GuideStyle = DEFAULT_GUIDE_STYLE,
): void {
  const { x, y, width, height } = box
  const trimLeft = x + bleed
  const trimTop = y + bleed
  const trimW = width - bleed * 2
  const trimH = height - bleed * 2
  if (trimW <= 0 || trimH <= 0) return

  const { bleedTint, trimColor, spineColor, dash, markLen, markGap } = style

  // Bleed tint over the whole box, then punch a clear hole for the trim area
  // so only the outer bleed margin reads as tinted.
  ctx.fillStyle = bleedTint
  ctx.fillRect(x, y, width, height)
  ctx.clearRect(trimLeft, trimTop, trimW, trimH)

  // Dashed trim line.
  ctx.strokeStyle = trimColor
  ctx.lineWidth = 1
  ctx.setLineDash(dash)
  ctx.strokeRect(trimLeft + 0.5, trimTop + 0.5, Math.max(0, trimW - 1), Math.max(0, trimH - 1))
  ctx.setLineDash([])

  // Outer-corner cut marks: a horizontal + vertical tick just outside each
  // trim corner, into the bleed margin.
  const corners: [number, number, 1 | -1, 1 | -1][] = [
    [trimLeft, trimTop, -1, -1],
    [trimLeft + trimW, trimTop, 1, -1],
    [trimLeft, trimTop + trimH, -1, 1],
    [trimLeft + trimW, trimTop + trimH, 1, 1],
  ]
  ctx.strokeStyle = trimColor
  for (const [cx, cy, dx, dy] of corners) {
    ctx.beginPath()
    ctx.moveTo(cx + dx * markGap, cy)
    ctx.lineTo(cx + dx * (markGap + markLen), cy)
    ctx.moveTo(cx, cy + dy * markGap)
    ctx.lineTo(cx, cy + dy * (markGap + markLen))
    ctx.stroke()
  }

  if (!isSpread) return

  const midX = trimLeft + trimW / 2
  // Dashed spine/gutter line down the centre.
  ctx.strokeStyle = spineColor
  ctx.setLineDash(dash)
  ctx.beginPath()
  ctx.moveTo(midX, trimTop)
  ctx.lineTo(midX, trimTop + trimH)
  ctx.stroke()
  ctx.setLineDash([])

  // Centre spine cut marks, top and bottom.
  ctx.strokeStyle = trimColor
  ctx.beginPath()
  ctx.moveTo(midX, trimTop - markGap)
  ctx.lineTo(midX, trimTop - markGap - markLen)
  ctx.moveTo(midX, trimTop + trimH + markGap)
  ctx.lineTo(midX, trimTop + trimH + markGap + markLen)
  ctx.stroke()
}
