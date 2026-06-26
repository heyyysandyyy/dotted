import { useEffect, useLayoutEffect, useRef } from 'react'
import { fabric } from 'fabric'
import { useCanvasStore } from '../store/useCanvasStore'
import { DARK_SURROUND } from '../constants'

const PADDING = 56

/**
 * Owns the Fabric.js canvas instance and keeps the artboard fitted to the
 * viewport. The fabric canvas always stays at native pixel dimensions; the
 * surrounding wrapper is CSS-scaled so the artboard preserves aspect ratio.
 */
export function CanvasStage() {
  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const scaleRef = useRef<HTMLDivElement>(null)

  const setCanvas = useCanvasStore((s) => s.setCanvas)
  const setZoom = useCanvasStore((s) => s.setZoom)
  const width = useCanvasStore((s) => s.width)
  const height = useCanvasStore((s) => s.height)
  const zoom = useCanvasStore((s) => s.zoom)

  // Create the fabric canvas once.
  useEffect(() => {
    if (!canvasElRef.current) return
    const canvas = new fabric.Canvas(canvasElRef.current, {
      width,
      height,
      backgroundColor: '#ffffff',
      preserveObjectStacking: true,
    })
    setCanvas(canvas)
    return () => {
      setCanvas(null)
      canvas.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Recompute fit-to-viewport zoom whenever the container or artboard resizes.
  useLayoutEffect(() => {
    const el = measureRef.current
    if (!el) return
    const recompute = () => {
      const availW = el.clientWidth - PADDING * 2
      const availH = el.clientHeight - PADDING * 2
      if (availW <= 0 || availH <= 0) return
      const next = Math.min(availW / width, availH / height, 1)
      setZoom(Math.max(next, 0.05))
    }
    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [width, height, setZoom])

  return (
    <div
      ref={measureRef}
      className="relative flex flex-1 items-center justify-center overflow-hidden"
      style={{ backgroundColor: DARK_SURROUND }}
    >
      <div
        ref={scaleRef}
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: 'center center',
          boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
        }}
      >
        <canvas ref={canvasElRef} />
      </div>
    </div>
  )
}
