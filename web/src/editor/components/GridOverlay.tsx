import { useEffect, useRef } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import { setupHiDPI, useViewportGeometry } from '../viewportGeometry'
import { drawGrid } from '../gridDraw'

/**
 * UX-005: a non-exportable grid drawn over the artboard. It lives in the canvas
 * viewport overlay (pointer-events: none) so it tracks the CSS-scaled, centred
 * fabric canvas and never reaches exports (those render the fabric canvas only).
 */
export function GridOverlay() {
  const grid = useCanvasStore((s) => s.grid)
  const { rootRef, box, width, height, zoom, originX, originY } = useViewportGeometry(grid.visible)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = canvasRef.current
    if (!grid.visible || !el || box.w === 0 || box.h === 0) return
    const ctx = setupHiDPI(el, box.w, box.h)
    ctx.clearRect(0, 0, box.w, box.h)

    // Artboard rect on screen (the grid is clipped to the artboard).
    const left = originX
    const top = originY

    ctx.save()
    ctx.beginPath()
    ctx.rect(left, top, width * zoom, height * zoom)
    ctx.clip()
    drawGrid(ctx, { x: left, y: top, width: width * zoom, height: height * zoom }, grid.size * zoom, grid.style)
    ctx.restore()
  }, [grid, width, height, zoom, box, originX, originY])

  if (!grid.visible) return null

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-[5]">
      <canvas ref={canvasRef} className="absolute left-0 top-0" />
    </div>
  )
}
