import { useEffect, useRef } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import { setupHiDPI, useViewportGeometry } from '../viewportGeometry'
import { drawProductGuides } from '../productGuides'

/**
 * Trim/bleed/safe-zone guides for a print-product page (PROD-001): the
 * circular counterpart to CanvasGuides' book guides, and the same
 * non-exportable overlay pattern — it lives outside the fabric canvas
 * entirely, so it can never reach a PNG/JPEG/PDF/SVG export (those render the
 * fabric canvas only). Renders only when the active page carries product
 * metadata and the guide layer is switched on in the layers panel.
 */
export function ProductGuides() {
  const pages = useCanvasStore((s) => s.pages)
  const activePageId = useCanvasStore((s) => s.activePageId)
  const showProductGuides = useCanvasStore((s) => s.showProductGuides)
  const spec = pages.find((p) => p.id === activePageId)?.product
  const active = !!spec && showProductGuides
  const { rootRef, box, width, height, zoom, originX, originY } = useViewportGeometry(active)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = canvasRef.current
    if (!active || !el || box.w === 0 || box.h === 0 || !spec) return
    const ctx = setupHiDPI(el, box.w, box.h)
    ctx.clearRect(0, 0, box.w, box.h)
    drawProductGuides(
      ctx,
      { x: originX, y: originY, width: width * zoom, height: height * zoom },
      spec,
      zoom,
    )
  }, [active, spec, box, width, height, zoom, originX, originY])

  if (!active) return null

  return (
    // print:hidden matters as much as living outside the fabric canvas: no
    // export can reach these circles, but the overlay is still a DOM element,
    // and printing the editor page itself (⌘P) would otherwise put the trim
    // and safe-zone rings on paper.
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-[5] print:hidden">
      <canvas ref={canvasRef} className="absolute left-0 top-0" />
    </div>
  )
}
