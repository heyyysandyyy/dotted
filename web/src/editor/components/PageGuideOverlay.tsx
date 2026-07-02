import { useEffect, useRef } from 'react'
import type { PageType } from '../storage'
import { setupHiDPI } from '../viewportGeometry'
import { drawPageGuides, THUMBNAIL_GUIDE_STYLE } from '../pageGuides'

interface Props {
  type: PageType | undefined
  /** The thumbnail's own rendered size, in px. */
  width: number
  height: number
  /** The page's bleed, already converted into the thumbnail's px space
   *  (page.bleed * (width / page.width)) — undefined for a non-book page. */
  bleedPx: number | undefined
}

/**
 * Bleed/trim/cut-mark/spine guides for a page thumbnail (BOOK-002) — the same
 * drawPageGuides math the full canvas overlay uses (CanvasGuides), just at
 * thumbnail scale. Renders nothing for a page with no bleed (plain projects).
 * Used by both PageBar's strip and PageStack's all-pages view so a book's
 * pages read the same way wherever they're shown as a thumbnail.
 */
export function PageGuideOverlay({ type, width, height, bleedPx }: Props) {
  const isSpread = type === 'spread'
  const active = typeof bleedPx === 'number' && (type === 'cover' || type === 'spread')
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = canvasRef.current
    if (!active || !el || width <= 0 || height <= 0 || typeof bleedPx !== 'number') return
    const ctx = setupHiDPI(el, width, height)
    ctx.clearRect(0, 0, width, height)
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
  }, [active, width, height, bleedPx, isSpread])

  if (!active) return null

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />
}
