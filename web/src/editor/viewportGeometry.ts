import { useEffect, useRef, useState } from 'react'
import { useCanvasStore } from './store/useCanvasStore'

/**
 * Size a 2D canvas for the device pixel ratio and return a context already
 * scaled to CSS pixels (so callers draw in CSS units and stay crisp).
 */
export function setupHiDPI(canvas: HTMLCanvasElement, cssW: number, cssH: number) {
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.round(cssW * dpr))
  canvas.height = Math.max(1, Math.round(cssH * dpr))
  canvas.style.width = `${cssW}px`
  canvas.style.height = `${cssH}px`
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

/**
 * Geometry shared by the canvas overlays (rulers, grid). Measures the overlay
 * root and computes where the CSS-scaled, centred fabric canvas sits within it:
 * (originX, originY) is the screen position of artboard coordinate (0, 0).
 * `active` is the overlay's visibility, used to (re)measure when it appears.
 */
export function useViewportGeometry(active: boolean) {
  const rootRef = useRef<HTMLDivElement>(null)
  const width = useCanvasStore((s) => s.width)
  const height = useCanvasStore((s) => s.height)
  const zoom = useCanvasStore((s) => s.zoom)
  const pan = useCanvasStore((s) => s.pan)
  const [box, setBox] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [active])

  // Same origin the fabric viewport transform uses (UX-013): the artboard is
  // centred in the viewport, then shifted by the pan offset.
  return {
    rootRef,
    box,
    width,
    height,
    zoom,
    originX: (box.w - width * zoom) / 2 + pan.x,
    originY: (box.h - height * zoom) / 2 + pan.y,
  }
}
