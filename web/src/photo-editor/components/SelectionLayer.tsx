import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { apply, cappedSize, invert } from '../utils/geometry'
import type { GeometryPlan } from '../utils/geometry'
import { brushRadius, gestureOutline, renderSelectionMask, selectionEdges, simplifyPath } from '../utils/selection'
import type { PhotoSelection, Point, SelectionOp } from '../utils/selection'

/** Lasso and brush points closer together than this are dropped as noise. */
const LASSO_STEP_PX = 2
/** A drag shorter than this is a click, not a shape. */
const CLICK_PX = 3

/**
 * The brush's on-screen width, so the preview line matches what it paints.
 * The stored radius is a fraction of the source's shorter edge, so the
 * screen width has to come from the plan's own source→output scale (the
 * matrix, not the output size: a crop changes the size without scaling
 * anything) times the preview's on-screen scale.
 */
function brushStrokeWidth(size: number, width: number, plan: GeometryPlan): number {
  const m = invert(plan.toSource)
  const outputPerSource = Math.sqrt(Math.abs(m[0] * m[4] - m[1] * m[3])) || 1
  const screenPerOutput = width / plan.width
  const shortSource = Math.min(plan.sourceWidth, plan.sourceHeight)
  return Math.max(2, brushRadius(size) * shortSource * outputPerSource * screenPerOutput * 2)
}
import { PREVIEW_MAX_EDGE } from '../hooks/useAdjustedPreviewCanvas'
import type { GradientShape, SelectionCombine, SelectionTool } from '../store/usePhotoEditorStore'

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
  brushSize: number
  brushHardness: number
  gradientShape: GradientShape
  /** Tint what's selected, not just outline it. */
  showMask: boolean
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
  brushSize,
  brushHardness,
  gradientShape,
  showMask,
  onOp,
  onDeselect,
}: Props) {
  const [gesture, setGesture] = useState<{ points: Point[]; combine: SelectionCombine } | null>(null)
  // Where the brush is hovering, for the size ring under the pointer.
  const [hover, setHover] = useState<Point | null>(null)
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
    // A brush paints from the point it starts on; everything else spans a drag.
    setGesture({ points: tool === 'brush' ? [p] : [p, p], combine: how })
  }

  const move = (e: ReactPointerEvent) => {
    if (tool === 'brush') setHover(local(e))
    if (!gesture) return
    const p = local(e)
    if (tool === 'lasso' || tool === 'brush') {
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
    if (tool === 'brush') {
      onOp(
        {
          kind: 'stroke',
          mode: 'add',
          points: simplifyPath(g.points).map(toSource),
          radius: brushRadius(brushSize),
          hardness: brushHardness,
        },
        // Paint builds up: a stroke adds to the mask (or erases with Alt),
        // never replaces it, whatever the combine mode says. Replacing would
        // wipe the previous stroke every time the pointer went down, which
        // is no use for painting a mask.
        g.combine === 'subtract' ? 'subtract' : 'add',
      )
      return
    }
    if (tool === 'gradient') {
      const [start, end] = [g.points[0], g.points[g.points.length - 1]]
      // A gradient with no length has no direction to fade along.
      if (Math.hypot(end.x - start.x, end.y - start.y) < CLICK_PX) return
      onOp(
        { kind: 'gradient', mode: 'add', shape: gradientShape, from: toSource(start), to: toSource(end) },
        g.combine,
      )
      return
    }
    const outline = gestureOutline(tool, g.points)
    if (!outline) {
      // A plain click with a fresh selection mode clears the selection, the
      // way clicking off a marquee does everywhere else.
      if (g.combine === 'new') onDeselect()
      return
    }
    onOp({ kind: 'polygon', mode: 'add', points: simplifyPath(outline).map(toSource) }, g.combine)
  }

  const inProgress = gesture && tool !== 'brush' && tool !== 'gradient' ? gestureOutline(tool, gesture.points, true) : null
  const brushPath = gesture && tool === 'brush' ? gesture.points : null
  const gradientLine = gesture && tool === 'gradient' ? [gesture.points[0], gesture.points[gesture.points.length - 1]] : null

  return (
    <>
      <SelectionOutline
        source={source}
        plan={plan}
        width={width}
        height={height}
        selection={selection}
        showMask={showMask}
      />
      {tool && (
        <div
          ref={surfaceRef}
          data-testid="selection-surface"
          className="absolute inset-0 cursor-crosshair touch-none select-none"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => setGesture(null)}
          onPointerLeave={() => setHover(null)}
          style={tool === 'brush' ? { cursor: 'none' } : undefined}
        >
          {tool === 'brush' && hover && (
            <svg className="pointer-events-none absolute inset-0" width={width} height={height}>
              <circle
                cx={hover.x}
                cy={hover.y}
                r={brushStrokeWidth(brushSize, width, plan) / 2}
                fill="none"
                stroke="#ffffff"
                strokeWidth={1}
              />
              <circle
                cx={hover.x}
                cy={hover.y}
                r={brushStrokeWidth(brushSize, width, plan) / 2 + 1}
                fill="none"
                stroke="rgba(0,0,0,0.5)"
                strokeWidth={1}
              />
            </svg>
          )}
          {brushPath && (
            <svg className="pointer-events-none absolute inset-0" width={width} height={height}>
              <polyline
                points={brushPath.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="rgba(255,255,255,0.75)"
                strokeWidth={brushStrokeWidth(brushSize, width, plan)}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
          {gradientLine && (
            <svg className="pointer-events-none absolute inset-0" width={width} height={height}>
              <line
                x1={gradientLine[0].x}
                y1={gradientLine[0].y}
                x2={gradientLine[1].x}
                y2={gradientLine[1].y}
                stroke="#ffffff"
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              {gradientShape === 'radial' ? (
                <circle
                  cx={gradientLine[0].x}
                  cy={gradientLine[0].y}
                  r={Math.hypot(gradientLine[1].x - gradientLine[0].x, gradientLine[1].y - gradientLine[0].y)}
                  fill="rgba(99,102,241,0.12)"
                  stroke="#ffffff"
                  strokeWidth={1}
                />
              ) : null}
            </svg>
          )}
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
  showMask,
}: {
  source: HTMLImageElement
  plan: GeometryPlan
  width: number
  height: number
  selection: PhotoSelection
  showMask: boolean
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
    // The mask itself, tinted — an outline alone says nothing about a soft
    // brush edge or a gradient's falloff.
    if (showMask) {
      for (let i = 0; i < mask.length; i++) {
        const m = mask[i]
        if (!m) continue
        const p = i * 4
        img.data[p] = 239
        img.data[p + 1] = 68
        img.data[p + 2] = 68
        img.data[p + 3] = Math.round(m * 0.4)
      }
    }
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
  }, [source, plan, selection, width, showMask])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ width, height }}
    />
  )
}
