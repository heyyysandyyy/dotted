import { useEffect, useRef } from 'react'
import type { PageType } from '../storage'
import { setupHiDPI } from '../viewportGeometry'
import { drawPageGuides, THUMBNAIL_GUIDE_STYLE } from '../pageGuides'
import { drawGrid } from '../gridDraw'
import { useCanvasStore } from '../store/useCanvasStore'

interface Props {
  type: PageType | undefined
  /** The thumbnail's own rendered size, in px. */
  width: number
  height: number
  /** The page's bleed, already converted into the thumbnail's px space
   *  (page.bleed * (width / page.width)) — undefined for a non-book page. */
  bleedPx: number | undefined
  /** Grid size already converted into the thumbnail's px space
   *  (grid.size * (width / page.width)). */
  gridSpacingPx: number
}

/**
 * Bleed/trim/cut-mark/spine guides, plus the grid overlay (UX-005), for a
 * page thumbnail (BOOK-002) — the same drawPageGuides/drawGrid math the full
 * canvas overlays use (CanvasGuides/GridOverlay), just at thumbnail scale.
 * Used by both PageBar's strip and PageStack's all-pages view so a page
 * reads the same way wherever it's shown as a thumbnail. Combined onto one
 * canvas (rather than a separate layer per concern, like the full canvas
 * has) since a thumbnail doesn't need independent z-index control between
 * them — grid drawn after bleed/trim, same stacking order CanvasStage.tsx
 * uses (GridOverlay after CanvasGuides). Renders nothing when there's
 * neither a book bleed nor an active grid.
 */
export function PageGuideOverlay({ type, width, height, bleedPx, gridSpacingPx }: Props) {
  const isSpread = type === 'spread'
  const bleedActive = typeof bleedPx === 'number' && (type === 'cover' || type === 'spread')
  const gridVisible = useCanvasStore((s) => s.grid.visible)
  const gridStyle = useCanvasStore((s) => s.grid.style)
  const active = bleedActive || gridVisible
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = canvasRef.current
    if (!active || !el || width <= 0 || height <= 0) return
    const ctx = setupHiDPI(el, width, height)
    ctx.clearRect(0, 0, width, height)

    if (bleedActive && typeof bleedPx === 'number') {
      drawPageGuides(ctx, { x: 0, y: 0, width, height }, bleedPx, isSpread, THUMBNAIL_GUIDE_STYLE)

      if (isSpread) {
        // Left/Right micro-labels, bottom corners of the spread (BOOK-002).
        ctx.fillStyle = 'rgba(161, 161, 170, 0.9)'
        ctx.font = '8px sans-serif'
        ctx.textBaseline = 'bottom'
        ctx.textAlign = 'left'
        ctx.fillText('Left', bleedPx + 2, height - bleedPx - 2)
        ctx.textAlign = 'right'
        ctx.fillText('Right', width - bleedPx - 2, height - bleedPx - 2)
      }
    }

    if (gridVisible) drawGrid(ctx, { x: 0, y: 0, width, height }, gridSpacingPx, gridStyle)
  }, [active, width, height, bleedPx, isSpread, bleedActive, gridVisible, gridStyle, gridSpacingPx])

  if (!active) return null

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />
}
