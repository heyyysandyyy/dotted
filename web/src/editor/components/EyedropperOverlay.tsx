import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import tinycolor from 'tinycolor2'
import { useCanvasStore } from '../store/useCanvasStore'
import { isFallbackActive, resolveFallback, subscribeFallback } from '../eyedropper'

/** Loupe magnification box size (CSS px) and source region (backing px). */
const LOUPE = 120
const SRC = 11

/**
 * UX-008 fallback: a magnified loupe + hex shown while sampling a colour from
 * the canvas, for browsers without the native EyeDropper API. Click samples and
 * applies; Escape or right-click cancels.
 */
export function EyedropperOverlay() {
  const active = useSyncExternalStore(subscribeFallback, isFallbackActive, () => false)
  const canvas = useCanvasStore((s) => s.canvas)
  const loupeRef = useRef<HTMLCanvasElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number; hex: string } | null>(null)

  // Escape / right-click cancel.
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') resolveFallback(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  if (!active || !canvas) return null

  const lower = (canvas as unknown as { lowerCanvasEl: HTMLCanvasElement }).lowerCanvasEl

  /** Sample the colour under the cursor; returns hex or null if off-canvas. */
  const sampleAt = (clientX: number, clientY: number): string | null => {
    const rect = lower.getBoundingClientRect()
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      return null
    }
    const ctx = lower.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    const bx = Math.floor(((clientX - rect.left) / rect.width) * lower.width)
    const by = Math.floor(((clientY - rect.top) / rect.height) * lower.height)
    try {
      const [r, g, b] = ctx.getImageData(bx, by, 1, 1).data
      // Update the loupe with a magnified region around the cursor.
      const lctx = loupeRef.current?.getContext('2d')
      if (lctx) {
        lctx.imageSmoothingEnabled = false
        lctx.clearRect(0, 0, LOUPE, LOUPE)
        lctx.drawImage(lower, bx - (SRC - 1) / 2, by - (SRC - 1) / 2, SRC, SRC, 0, 0, LOUPE, LOUPE)
        const px = LOUPE / SRC
        lctx.strokeStyle = '#000'
        lctx.lineWidth = 1
        lctx.strokeRect(Math.floor(LOUPE / 2 - px / 2) + 0.5, Math.floor(LOUPE / 2 - px / 2) + 0.5, px, px)
      }
      return tinycolor({ r, g, b }).toHexString()
    } catch {
      return null // tainted canvas — shouldn't happen with same-origin data URLs
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 cursor-crosshair"
      onMouseMove={(e) => {
        const hex = sampleAt(e.clientX, e.clientY)
        setPos(hex ? { x: e.clientX, y: e.clientY, hex } : null)
      }}
      onClick={(e) => {
        const hex = sampleAt(e.clientX, e.clientY)
        resolveFallback(hex)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        resolveFallback(null)
      }}
    >
      {pos && (
        <div
          className="pointer-events-none fixed flex flex-col items-center"
          style={{ left: pos.x + 16, top: pos.y + 16 }}
        >
          <canvas
            ref={loupeRef}
            width={LOUPE}
            height={LOUPE}
            className="rounded-full border-2 border-white shadow-lg"
          />
          <span className="mt-1 rounded bg-editor-bg/90 px-1.5 py-0.5 font-mono text-[11px] text-editor-text-strong">
            {pos.hex}
          </span>
        </div>
      )}
    </div>
  )
}
