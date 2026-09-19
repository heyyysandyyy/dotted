import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { apply, cappedSize } from '../utils/geometry'
import type { GeometryPlan } from '../utils/geometry'
import { gestureOutline, renderSelectionMask, selectionEdges, simplifyPath } from '../utils/selection'
import type { PhotoSelection, Point, SelectionOp } from '../utils/selection'

/** Lasso points closer together than this are dropped as noise. */
const LASSO_STEP_PX = 2
import { PREVIEW_MAX_EDGE } from '../hooks/useAdjustedPreviewCanvas'
import type { SelectionCombine, SelectionTool } from '../store/usePhotoEditorStore'

interface Props {
  /** The decoded photo — the wand samples it, and the outline is traced
   *  from the same mask the renderer uses. */
  source: HTMLImageElement
  plan: GeometryPlan
  /** On-screen size of the preview. */
  width: number
  height: number
  selection: PhotoSelection
  tool: SelectionTool | null
  combine: SelectionCombine
  wandTolerance: number
  wandContiguous: boolean
  onOp: (op: SelectionOp, combine: SelectionCombine) => void
  onDeselect: () => void
}

/** Shift adds and Alt subtracts, whatever the panel's combine mode says —
 *  read when the gesture starts, as in every photo editor. */
function combineFor(e: ReactPointerEvent, fallback: SelectionCombine): SelectionCombine {
  if (e.shiftKey) return 'add'
  if (e.altKey) return 'subtract'
  return fallback
}

/**
 * The selection over the preview (PHOTO-011): its outline, and — with a
 * selection tool active — the surface the marquee, lasso and wand are drawn
 * on.
 *
 * Everything drawn here is converted straight to normalized *source*
 * coordinates through the geometry plan, so what's stored is independent of
 * the preview's size, the zoom it's shown at, and any crop or rotation.
 */
export function SelectionLayer({
  source,
  plan,
  width,
  height,
  selection,
  tool,
  combine,
  wandTolerance,
  wandContiguous,
  onOp,
  onDeselect,
}: Props) {
  const [gesture, setGesture] = useState<{ points: Point[]; combine: SelectionCombine } | null>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)

  /** Screen point (relative to the preview) → normalized source point. */
  const toSource = (p: Point): Point => {
    const s = apply(plan.toSource, (p.x / width) * plan.width, (p.y / height) * plan.height)
    return { x: s.x / plan.sourceWidth, y: s.y / plan.sourceHeight }
  }
  const local = (e: ReactPointerEvent): Point => {
    const r = surfaceRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const down = (e: ReactPointerEvent) => {
    if (!tool || e.button !== 0) return
    e.preventDefault()
    const p = local(e)
    const how = combineFor(e, combine)
    if (tool === 'wand') {
      const seed = toSource(p)
      // Off the photo — the clear corners a free rotation leaves — there's
      // no colour to match; the wand would otherwise clamp to an edge pixel
      // and pick something that was never clicked.
      if (seed.x < 0 || seed.y < 0 || seed.x > 1 || seed.y > 1) return
      onOp({ kind: 'wand', mode: 'add', seed, tolerance: wandTolerance, contiguous: wandContiguous }, how)
      return
    }
    surfaceRef.current?.setPointerCapture?.(e.pointerId)
    setGesture({ points: [p, p], combine: how })
  }

  const move = (e: ReactPointerEvent) => {
    if (!gesture) return
    const p = local(e)
    if (tool === 'lasso') {
      const last = gesture.points[gesture.points.length - 1]
      if (Math.hypot(p.x - last.x, p.y - last.y) < LASSO_STEP_PX) return
      setGesture({ ...gesture, points: [...gesture.points, p] })
    } else {
      setGesture({ ...gesture, points: [gesture.points[0], p] })
    }
  }

  const up = (e: ReactPointerEvent) => {
    if (!gesture) return
    surfaceRef.current?.releasePointerCapture?.(e.pointerId)
    const g = gesture
    setGesture(null)
    const outline = gestureOutline(tool, g.points)
    if (!outline) {
      // A plain click with a fresh selection mode clears the selection, the
      // way clicking off a marquee does everywhere else.
      if (g.combine === 'new') onDeselect()
      return
    }
    onOp({ kind: 'polygon', mode: 'add', points: simplifyPath(outline).map(toSource) }, g.combine)
  }

  const inProgress = gesture ? gestureOutline(tool, gesture.points, true) : null

  return (
    <>
      <SelectionOutline source={source} plan={plan} width={width} height={height} selection={selection} />
      {tool && (
        <div
          ref={surfaceRef}
          data-testid="selection-surface"
          className="absolute inset-0 cursor-crosshair touch-none select-none"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => setGesture(null)}
        >
          {inProgress && (
            <svg className="pointer-events-none absolute inset-0" width={width} height={height}>
              <polygon
                points={inProgress.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="rgba(99,102,241,0.12)"
                stroke="#ffffff"
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            </svg>
          )}
        </div>
      )}
    </>
  )
}

/**
 * The selection's edge as a black-and-white dashed outline ("marching
 * ants", held still) traced from the real mask at the preview's render size,
 * so it matches the pixels the adjustments are confined to — feather, wand
 * picks and all.
 */
function SelectionOutline({
  source,
  plan,
  width,
  height,
  selection,
}: {
  source: HTMLImageElement
  plan: GeometryPlan
  width: number
  height: number
  selection: PhotoSelection
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const { width: w, height: h } = cappedSize(plan, PREVIEW_MAX_EDGE)
    if (canvas.width !== w) canvas.width = w
    if (canvas.height !== h) canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, w, h)
    const mask = renderSelectionMask(source, plan, w, h, selection)
    if (!mask) return
    const img = ctx.createImageData(w, h)
    // Dashes a few render pixels long, scaled so they read the same on screen.
    const dash = Math.max(2, Math.round((4 * w) / Math.max(1, width)))
    for (const i of selectionEdges(mask, w, h)) {
      const x = i % w
      const y = (i - x) / w
      const v = Math.floor((x + y) / dash) % 2 === 0 ? 0 : 255
      const p = i * 4
      img.data[p] = img.data[p + 1] = img.data[p + 2] = v
      img.data[p + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    // Rebuilt only on a new selection, framing or on-screen size — the plan
    // is memoized upstream, so dragging an adjustment slider doesn't retrace.
  }, [source, plan, selection, width])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ width, height }}
    />
  )
}
