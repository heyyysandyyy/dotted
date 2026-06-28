import { useEffect, useLayoutEffect, useRef } from 'react'
import { fabric } from 'fabric'
import { useCanvasStore } from '../store/useCanvasStore'
import { useHistoryStore } from '../store/useHistoryStore'
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

  const setCanvas = useCanvasStore((s) => s.setCanvas)
  const setZoom = useCanvasStore((s) => s.setZoom)
  const setSelection = useCanvasStore((s) => s.setSelection)
  const bump = useCanvasStore((s) => s.bump)
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

    const syncSelection = () => setSelection(canvas.getActiveObjects())
    canvas.on('selection:created', syncSelection)
    canvas.on('selection:updated', syncSelection)
    canvas.on('selection:cleared', () => setSelection([]))
    // Keep property read-outs live during direct-manipulation.
    canvas.on('object:moving', bump)
    canvas.on('object:scaling', bump)
    canvas.on('object:rotating', bump)
    canvas.on('object:modified', bump)

    // Push a debounced history snapshot on any structural/transform change.
    const schedule = () => useHistoryStore.getState().scheduleRecord()
    canvas.on('object:added', schedule)
    canvas.on('object:removed', schedule)
    canvas.on('object:modified', schedule)
    // Keep the layers panel in sync when objects are added/removed.
    canvas.on('object:added', bump)
    canvas.on('object:removed', bump)
    // Guarantee every object (incl. those restored from history) has an id.
    canvas.on('object:added', (e) => {
      const o = e.target as (fabric.Object & { id?: string }) | undefined
      if (o && !o.id) o.id = crypto.randomUUID()
    })

    setCanvas(canvas)
    // Seed the baseline snapshot for the empty canvas.
    useHistoryStore.getState().reset()
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
