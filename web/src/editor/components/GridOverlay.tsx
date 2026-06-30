import { useEffect, useRef } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import { setupHiDPI, useViewportGeometry } from '../viewportGeometry'

const LINE_COLOR = 'rgba(150, 150, 150, 0.28)'
const DOT_COLOR = 'rgba(150, 150, 150, 0.55)'
/** Below this on-screen spacing the grid is too dense to be useful — skip it. */
const MIN_SPACING = 4

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

    const spacing = grid.size * zoom
    if (spacing < MIN_SPACING) return

    // Artboard rect on screen (the grid is clipped to the artboard).
    const left = originX
    const top = originY
    const right = left + width * zoom
    const bottom = top + height * zoom

    ctx.save()
    ctx.beginPath()
    ctx.rect(left, top, width * zoom, height * zoom)
    ctx.clip()

    if (grid.style === 'lines') {
      ctx.strokeStyle = LINE_COLOR
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = 0; x <= width; x += grid.size) {
        const sx = Math.round(left + x * zoom) + 0.5
        ctx.moveTo(sx, top)
        ctx.lineTo(sx, bottom)
      }
      for (let y = 0; y <= height; y += grid.size) {
        const sy = Math.round(top + y * zoom) + 0.5
        ctx.moveTo(left, sy)
        ctx.lineTo(right, sy)
      }
      ctx.stroke()
    } else {
      ctx.fillStyle = DOT_COLOR
      for (let x = 0; x <= width; x += grid.size) {
        for (let y = 0; y <= height; y += grid.size) {
          ctx.fillRect(Math.round(left + x * zoom) - 0.5, Math.round(top + y * zoom) - 0.5, 1.5, 1.5)
        }
      }
    }
    ctx.restore()
  }, [grid, width, height, zoom, box, originX, originY])

  if (!grid.visible) return null

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-[5]">
      <canvas ref={canvasRef} className="absolute left-0 top-0" />
    </div>
  )
}
