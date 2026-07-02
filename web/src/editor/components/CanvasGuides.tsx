import { useEffect, useRef } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import { setupHiDPI, useViewportGeometry } from '../viewportGeometry'
import { drawPageGuides, DEFAULT_GUIDE_STYLE } from '../pageGuides'

/**
 * Bleed/trim/cut-mark/spine guides for book pages (UX-015): a non-exportable
 * overlay, same pattern as GridOverlay/CanvasRulers — it lives outside the
 * fabric canvas entirely, so it never reaches exports (those render the fabric
 * canvas only). Renders only when the active page carries book bleed metadata.
 * The actual guide math lives in pageGuides.ts, shared with the page
 * thumbnails (BOOK-002) so the two never draw them differently.
 */
export function CanvasGuides() {
  const pages = useCanvasStore((s) => s.pages)
  const activePageId = useCanvasStore((s) => s.activePageId)
  const activePage = pages.find((p) => p.id === activePageId)
  const bleed = activePage?.bleed
  const isSpread = activePage?.type === 'spread'
  const active = typeof bleed === 'number'
  const { rootRef, box, width, height, zoom, originX, originY } = useViewportGeometry(active)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = canvasRef.current
    if (!active || !el || box.w === 0 || box.h === 0 || typeof bleed !== 'number') return
    const ctx = setupHiDPI(el, box.w, box.h)
    ctx.clearRect(0, 0, box.w, box.h)
    drawPageGuides(
      ctx,
      { x: originX, y: originY, width: width * zoom, height: height * zoom },
      bleed * zoom,
      isSpread,
      DEFAULT_GUIDE_STYLE,
    )
  }, [active, bleed, isSpread, box, width, height, zoom, originX, originY])

  if (!active) return null

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-[5]">
      <canvas ref={canvasRef} className="absolute left-0 top-0" />
    </div>
  )
}
