/**
 * Shared grid-drawing math (UX-005), extracted so the full canvas's own
 * overlay (GridOverlay) and page thumbnails (PageGuideOverlay, used by both
 * PageBar and PageStack) can never drift out of sync — same reasoning as
 * pageGuides.ts's drawPageGuides for bleed/trim guides.
 *
 * Works entirely in the caller's own on-screen pixel space: `box` and
 * `spacing` (grid size already multiplied by whatever scale the caller is
 * drawing at) are pre-converted by the caller, matching how pageGuides.ts's
 * `bleed` parameter works.
 */

export const GRID_LINE_COLOR = 'rgba(150, 150, 150, 0.28)'
export const GRID_DOT_COLOR = 'rgba(150, 150, 150, 0.55)'
/** Below this on-screen spacing the grid is too dense to be useful — skip it. */
export const GRID_MIN_SPACING = 4

export interface GridBox {
  x: number
  y: number
  width: number
  height: number
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  box: GridBox,
  spacing: number,
  style: 'lines' | 'dots',
): void {
  if (spacing < GRID_MIN_SPACING) return
  const { x, y, width, height } = box
  const right = x + width
  const bottom = y + height

  if (style === 'lines') {
    ctx.strokeStyle = GRID_LINE_COLOR
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let gx = x; gx <= right; gx += spacing) {
      const sx = Math.round(gx) + 0.5
      ctx.moveTo(sx, y)
      ctx.lineTo(sx, bottom)
    }
    for (let gy = y; gy <= bottom; gy += spacing) {
      const sy = Math.round(gy) + 0.5
      ctx.moveTo(x, sy)
      ctx.lineTo(right, sy)
    }
    ctx.stroke()
  } else {
    ctx.fillStyle = GRID_DOT_COLOR
    for (let gx = x; gx <= right; gx += spacing) {
      for (let gy = y; gy <= bottom; gy += spacing) {
        ctx.fillRect(Math.round(gx) - 0.5, Math.round(gy) - 0.5, 1.5, 1.5)
      }
    }
  }
}
