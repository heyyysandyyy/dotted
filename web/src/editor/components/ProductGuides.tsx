import { useEffect, useRef } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import { setupHiDPI, useViewportGeometry } from '../viewportGeometry'
import { drawProductCutLines, drawProductGuides } from '../productGuides'

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
  const printCanvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = canvasRef.current
    const printEl = printCanvasRef.current
    if (!active || !el || !printEl || box.w === 0 || box.h === 0 || !spec) return
    const artboard = { x: originX, y: originY, width: width * zoom, height: height * zoom }

    const ctx = setupHiDPI(el, box.w, box.h)
    ctx.clearRect(0, 0, box.w, box.h)
    drawProductGuides(ctx, artboard, spec, zoom)

    // Painted even though it's display:none — a hidden canvas still keeps its
    // bitmap, so the print stylesheet has something to reveal rather than a
    // blank element it would have to trigger a repaint for.
    const printCtx = setupHiDPI(printEl, box.w, box.h)
    printCtx.clearRect(0, 0, box.w, box.h)
    drawProductCutLines(printCtx, artboard, spec, zoom)
  }, [active, spec, box, width, height, zoom, originX, originY])

  if (!active) return null

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-[5]">
      {/* On screen: bleed tint, cut line and safe zone. On paper: the cut line
          alone — the bleed tint would print over the artwork and the safe zone
          frames what has to stay visible, so a ring around it is the last
          thing wanted on a finished pin. */}
      <canvas ref={canvasRef} className="absolute left-0 top-0 print:hidden" />
      <canvas ref={printCanvasRef} className="absolute left-0 top-0 hidden print:block" />
    </div>
  )
}
