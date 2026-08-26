import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Histogram } from './Histogram'
import { CHANNEL_COLORS } from './channelColors'
import { buildCurveLUT, MAX_CURVE_POINTS } from '../utils/levelsCurves'
import type { Histogram as HistogramData } from '../utils/histogram'
import type { CurveChannel, CurvePoint } from '../utils/levelsCurves'

/** Radius of a control point, in curve (0..255) space. Big enough to grab
 *  at the sidebar's width without covering the curve it sits on. */
const POINT_RADIUS = 7
/** How close, in input values, a click has to land to count as grabbing an
 *  existing point rather than adding a new one. Also the minimum gap
 *  between two points, so a new one can never land on another's x (which
 *  normalizeCurvePoints would resolve by dropping one of them). */
const POINT_HIT_RANGE = 8

interface Props {
  points: CurvePoint[]
  channel: CurveChannel
  histogram: HistogramData | null
  onChange: (points: CurvePoint[]) => void
}

/**
 * The point-based curve editor (PHOTO-007 levels/curves phase): drag a point
 * to shape the curve, click empty space to add one, double-click an interior
 * point to remove it. The two endpoints stay — they define where the curve
 * starts and stops, and dragging them is how input clipping is set — so they
 * can be moved but not deleted.
 *
 * The drawn curve is sampled from the same buildCurveLUT the pixel pipeline
 * uses, not from an SVG spline of its own, so the line on screen is exactly
 * the mapping being applied — no smoothing that only exists in the picture.
 */
export function CurveEditor({ points, channel, histogram, onChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  /** Pointer position in curve space (x = input, y = output, y up), or null
   *  when the element has no layout to measure against yet. */
  const positionFrom = (event: { clientX: number; clientY: number }): CurvePoint | null => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return null
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 255),
      y: clamp(255 - ((event.clientY - rect.top) / rect.height) * 255),
    }
  }

  /** Moves one point, keeping the list ordered: a point may travel only as
   *  far as one step short of each neighbour, and the endpoints keep their
   *  place at the ends of the list (though not at the ends of the range —
   *  dragging them inwards is how the curve clips). */
  const movePoint = (index: number, position: CurvePoint): CurvePoint[] => {
    const lower = index === 0 ? 0 : points[index - 1].x + POINT_HIT_RANGE
    const upper = index === points.length - 1 ? 255 : points[index + 1].x - POINT_HIT_RANGE
    const x = lower > upper ? points[index].x : Math.max(lower, Math.min(upper, position.x))
    return points.map((point, i) => (i === index ? { x, y: position.y } : point))
  }

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    const position = positionFrom(event)
    if (!position) return
    const existing = points.findIndex((point) => Math.abs(point.x - position.x) < POINT_HIT_RANGE)
    if (existing >= 0) {
      setDragIndex(existing)
      return
    }
    if (points.length >= MAX_CURVE_POINTS) return
    const index = points.findIndex((point) => point.x > position.x)
    const insertAt = index === -1 ? points.length : index
    onChange([...points.slice(0, insertAt), position, ...points.slice(insertAt)])
    setDragIndex(insertAt)
  }

  const handleRemove = (index: number) => {
    // The endpoints are the curve's own range; removing one would leave the
    // rest of the table extrapolating off nothing.
    if (index === 0 || index === points.length - 1) return
    onChange(points.filter((_, i) => i !== index))
  }

  useEffect(() => {
    if (dragIndex === null) return
    // Tracked on the window rather than the svg so a drag that leaves the
    // (small) plot keeps working, and released on pointerup wherever it
    // happens. Re-subscribed on every move because `points` moves with it —
    // cheaper than the stale-closure bugs a ref would trade it for.
    const move = (event: PointerEvent) => {
      const position = positionFrom(event)
      if (position) onChange(movePoint(dragIndex, position))
    }
    const stop = () => setDragIndex(null)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  })

  const lut = buildCurveLUT(points)
  let curvePath = `M 0 ${255 - lut[0]}`
  for (let v = 1; v < 256; v++) curvePath += ` L ${v} ${255 - lut[v]}`

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded border border-editor-strong bg-editor-surface">
      <Histogram histogram={histogram} channel={channel} className="absolute inset-0 h-full w-full opacity-60" />
      <svg
        ref={svgRef}
        viewBox="0 0 255 255"
        preserveAspectRatio="none"
        onPointerDown={handlePointerDown}
        aria-label="Tone curve"
        className="absolute inset-0 h-full w-full cursor-crosshair touch-none text-editor-text-muted"
      >
        {[64, 128, 191].map((at) => (
          <g key={at} stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.15}>
            <line x1={at} y1={0} x2={at} y2={255} />
            <line x1={0} y1={at} x2={255} y2={at} />
          </g>
        ))}
        {/* The no-op diagonal, so how far the curve has been bent is
            readable at a glance. */}
        <line
          x1={0}
          y1={255}
          x2={255}
          y2={0}
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
          opacity={0.3}
        />
        <path
          d={curvePath}
          fill="none"
          stroke={CHANNEL_COLORS[channel]}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
        {points.map((point, index) => (
          <circle
            key={index}
            cx={point.x}
            cy={255 - point.y}
            r={POINT_RADIUS}
            fill={CHANNEL_COLORS[channel]}
            stroke="currentColor"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            onPointerDown={(event) => {
              event.stopPropagation()
              setDragIndex(index)
            }}
            onDoubleClick={() => handleRemove(index)}
            className="cursor-grab"
          />
        ))}
      </svg>
    </div>
  )
}
