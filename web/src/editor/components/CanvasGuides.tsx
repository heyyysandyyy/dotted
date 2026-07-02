import { useEffect, useRef } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import { setupHiDPI, useViewportGeometry } from '../viewportGeometry'

/** Bleed margin tint — a pink/red wash over the area outside the trim line. */
const BLEED_TINT = 'rgba(236, 72, 153, 0.16)'
const TRIM_COLOR = 'rgba(24, 24, 27, 0.85)'
const SPINE_COLOR = 'rgba(113, 113, 122, 0.85)'
/** Cut-mark tick length/gap in screen px — a schematic length, not to-scale
 *  with the real 300dpi spec (which would be sub-pixel at typical edit zoom). */
const MARK_LEN = 10
const MARK_GAP = 4

/**
 * Bleed/trim/cut-mark/spine guides for book pages (UX-015): a non-exportable
 * overlay, same pattern as GridOverlay/CanvasRulers — it lives outside the
 * fabric canvas entirely, so it never reaches exports (those render the fabric
 * canvas only). Renders only when the active page carries book bleed metadata.
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

    const bx = bleed * zoom
    const trimLeft = originX + bx
    const trimTop = originY + bx
    const trimW = width * zoom - bx * 2
    const trimH = height * zoom - bx * 2

    // Bleed tint over the whole artboard, then punch a clear hole for the trim
    // area so only the outer bleed margin reads as tinted.
    ctx.fillStyle = BLEED_TINT
    ctx.fillRect(originX, originY, width * zoom, height * zoom)
    ctx.clearRect(trimLeft, trimTop, trimW, trimH)

    // Dashed trim line.
    ctx.strokeStyle = TRIM_COLOR
    ctx.lineWidth = 1
    ctx.setLineDash([6, 4])
    ctx.strokeRect(trimLeft + 0.5, trimTop + 0.5, trimW - 1, trimH - 1)
    ctx.setLineDash([])

    // Outer-corner cut marks: a horizontal + vertical tick just outside each
    // trim corner, into the bleed margin.
    const corners: [number, number, 1 | -1, 1 | -1][] = [
      [trimLeft, trimTop, -1, -1],
      [trimLeft + trimW, trimTop, 1, -1],
      [trimLeft, trimTop + trimH, -1, 1],
      [trimLeft + trimW, trimTop + trimH, 1, 1],
    ]
    ctx.strokeStyle = TRIM_COLOR
    for (const [cx, cy, dx, dy] of corners) {
      ctx.beginPath()
      ctx.moveTo(cx + dx * MARK_GAP, cy)
      ctx.lineTo(cx + dx * (MARK_GAP + MARK_LEN), cy)
      ctx.moveTo(cx, cy + dy * MARK_GAP)
      ctx.lineTo(cx, cy + dy * (MARK_GAP + MARK_LEN))
      ctx.stroke()
    }

    if (isSpread) {
      const midX = trimLeft + trimW / 2
      // Dashed spine/gutter line down the centre.
      ctx.strokeStyle = SPINE_COLOR
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      ctx.moveTo(midX, trimTop)
      ctx.lineTo(midX, trimTop + trimH)
      ctx.stroke()
      ctx.setLineDash([])

      // Centre spine cut marks, top and bottom.
      ctx.strokeStyle = TRIM_COLOR
      ctx.beginPath()
      ctx.moveTo(midX, trimTop - MARK_GAP)
      ctx.lineTo(midX, trimTop - MARK_GAP - MARK_LEN)
      ctx.moveTo(midX, trimTop + trimH + MARK_GAP)
      ctx.lineTo(midX, trimTop + trimH + MARK_GAP + MARK_LEN)
      ctx.stroke()
    }
  }, [active, bleed, isSpread, box, width, height, zoom, originX, originY])

  if (!active) return null

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-[5]">
      <canvas ref={canvasRef} className="absolute left-0 top-0" />
    </div>
  )
}
