import { useEffect, useLayoutEffect, useRef } from 'react'
import * as fabric from 'fabric'
import { AligningGuidelines } from 'fabric/extensions'
import { useCanvasStore } from '../store/useCanvasStore'
import { useHistoryStore } from '../store/useHistoryStore'
import {
  getCurrentProjectId,
  loadProject,
  listProjects,
  migrateLegacyDesign,
} from '../storage'
import { DARK_SURROUND, GRID_SIZE, SNAP_MARGIN } from '../constants'
import { kindName } from '../utils'
import { CanvasRulers } from './CanvasRulers'

const PADDING = 56

/**
 * History label for an `object:modified` event: a label set by the firing store
 * action (`historyLabel`) wins; otherwise it's inferred from the drag/scale/
 * rotate transform that produced it.
 */
function modifiedLabel(e: {
  target?: fabric.FabricObject
  transform?: { action?: string }
  historyLabel?: string
}): string {
  if (e.historyLabel) return e.historyLabel
  const k = kindName(e.target)
  const action = e.transform?.action ?? ''
  if (action === 'drag') return `Moved ${k}`
  if (action.startsWith('scale') || action === 'resizing') return `Resized ${k}`
  if (action === 'rotate') return `Rotated ${k}`
  return `Edited ${k}`
}

/** Checkerboard shown behind a transparent artboard, like most design tools. */
const CHECKERBOARD: React.CSSProperties = {
  backgroundColor: '#ffffff',
  backgroundImage:
    'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
  backgroundSize: '20px 20px',
  backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0',
}

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
  const backgroundColor = useCanvasStore((s) => s.backgroundColor)
  const canvas = useCanvasStore((s) => s.canvas)
  const snapMode = useCanvasStore((s) => s.snapMode)

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

    // Push a debounced history snapshot on any structural/transform change,
    // tagged with a human-readable label for the history panel (UX-003).
    const rec = (label: string) => useHistoryStore.getState().scheduleRecord(label)
    canvas.on('object:added', (e) => rec(`Added ${kindName(e.target)}`))
    canvas.on('object:removed', (e) => rec(`Deleted ${kindName(e.target)}`))
    canvas.on('object:modified', (e) => rec(modifiedLabel(e)))
    // Keep the layers panel in sync when objects are added/removed.
    canvas.on('object:added', bump)
    canvas.on('object:removed', bump)
    // Guarantee every object (incl. those restored from history) has an id.
    canvas.on('object:added', (e) => {
      const o = e.target as (fabric.FabricObject & { id?: string }) | undefined
      if (o && !o.id) o.id = crypto.randomUUID()
    })

    setCanvas(canvas)

    // SAV-002: open the current project (migrating any SAV-001 single design
    // first), fall back to the most recent project, else start a fresh one.
    // openProject / newProject handle loadFromJSON and the history baseline.
    const store = useCanvasStore.getState()
    let id = getCurrentProjectId() ?? migrateLegacyDesign(() => crypto.randomUUID())
    if (!id || !loadProject(id)) id = listProjects()[0]?.id ?? null
    if (id) store.openProject(id)
    else store.newProject(width, height)
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

  // CLR-004: smart alignment guides while dragging (snap mode 'guides').
  useEffect(() => {
    if (!canvas || snapMode !== 'guides') return
    const guidelines = new AligningGuidelines(canvas, { margin: SNAP_MARGIN, color: '#ec4899' })
    return () => guidelines.dispose()
  }, [canvas, snapMode])

  // CLR-004: snap object positions to a fixed grid while dragging (mode 'grid').
  useEffect(() => {
    if (!canvas || snapMode !== 'grid') return
    const onMoving = (e: { target?: fabric.FabricObject }) => {
      const obj = e.target
      if (!obj) return
      obj.set({
        left: Math.round((obj.left ?? 0) / GRID_SIZE) * GRID_SIZE,
        top: Math.round((obj.top ?? 0) / GRID_SIZE) * GRID_SIZE,
      })
    }
    canvas.on('object:moving', onMoving)
    return () => canvas.off('object:moving', onMoving)
  }, [canvas, snapMode])

  // UX-004: snap an object's edges/centre to manual ruler guides while dragging,
  // and highlight whichever guides it's snapped to.
  useEffect(() => {
    if (!canvas) return
    const T = 5
    const clear = () => useCanvasStore.getState().setActiveGuides({ horizontal: [], vertical: [] })
    const onMoving = (e: { target?: fabric.FabricObject }) => {
      const { guides, snapGuides, showGuides, setActiveGuides } = useCanvasStore.getState()
      if (!snapGuides || !showGuides) return
      const obj = e.target
      if (!obj) return
      const bb = obj.getBoundingRect()
      // Nearest guide line to any of the object's edges/centre, with its value.
      const nearest = (targets: number[], lines: number[]): { d: number; line: number } | null => {
        let best: { d: number; line: number } | null = null
        for (const line of lines) {
          for (const t of targets) {
            const d = line - t
            if (Math.abs(d) <= T && (best === null || Math.abs(d) < Math.abs(best.d))) best = { d, line }
          }
        }
        return best
      }
      const vx = nearest([bb.left, bb.left + bb.width / 2, bb.left + bb.width], guides.vertical)
      const hy = nearest([bb.top, bb.top + bb.height / 2, bb.top + bb.height], guides.horizontal)
      if (vx) obj.set('left', (obj.left ?? 0) + vx.d)
      if (hy) obj.set('top', (obj.top ?? 0) + hy.d)
      if (vx || hy) obj.setCoords()
      setActiveGuides({ horizontal: hy ? [hy.line] : [], vertical: vx ? [vx.line] : [] })
    }
    canvas.on('object:moving', onMoving)
    canvas.on('object:modified', clear)
    canvas.on('mouse:up', clear)
    return () => {
      canvas.off('object:moving', onMoving)
      canvas.off('object:modified', clear)
      canvas.off('mouse:up', clear)
    }
  }, [canvas])

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
          // Transparent artboard → show a checkerboard behind it.
          ...(backgroundColor === '' ? CHECKERBOARD : null),
        }}
      >
        <canvas ref={canvasElRef} />
      </div>
      <CanvasRulers />
    </div>
  )
}
