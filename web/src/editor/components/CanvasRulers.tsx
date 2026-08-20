import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { SIZE_UNITS, type UnitId } from '../constants'
import { useCanvasStore } from '../store/useCanvasStore'
import { useThemeStore } from '../store/useThemeStore'
import { setupHiDPI, useViewportGeometry } from '../viewportGeometry'

/** Ruler gutter thickness in CSS px. */
const RULER = 20
/** Target on-screen spacing between major ticks, in CSS px. */
const TARGET_MAJOR_PX = 70
/** Half-thickness of a guide's draggable hit area, in CSS px. */
const GUIDE_GRAB = 4

// Guide colours are semantic (blue = guide, pink = active/snapped) and read
// fine against either ruler background, so they're the one pair that stays
// constant across themes (UX-026) — everything else here is drawn to a
// <canvas>, which can't pick up the editor-* CSS custom properties the rest
// of the chrome uses, so it needs its own light/dark pair.
const GUIDE = '#3b82f6'
const GUIDE_ACTIVE = '#ec4899'

interface RulerColors {
  bg: string
  line: string
  tick: string
  tickMajor: string
  label: string
}

const RULER_COLORS: Record<'light' | 'dark', RulerColors> = {
  dark: { bg: '#202020', line: '#3a3a3a', tick: '#6b6b6b', tickMajor: '#9a9a9a', label: '#9a9a9a' },
  light: { bg: '#f0f0f0', line: '#d4d4d4', tick: '#a3a3a3', tickMajor: '#525252', label: '#525252' },
}

type Orientation = 'horizontal' | 'vertical'
/** An in-progress ruler drag: creating a new guide or moving an existing one. */
interface Drag {
  kind: 'create' | 'move'
  orientation: Orientation
  index: number
  pos: number // live canvas-px position
}

const pxPerUnit = (unit: UnitId) => SIZE_UNITS.find((u) => u.id === unit)!.pxPer

/** Nearest "nice" step (1/2/5 × 10ⁿ) at or above the target span. */
function niceStep(target: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(target)))
  for (const m of [1, 2, 5, 10]) {
    if (m * pow >= target) return m * pow
  }
  return 10 * pow
}

/** Tick label: whole numbers for px, ≤2 trimmed decimals otherwise. */
function fmtLabel(unitValue: number, unit: UnitId): string {
  if (unit === 'px') return String(Math.round(unitValue))
  return parseFloat(unitValue.toFixed(2)).toString()
}

function drawRuler(
  ctx: CanvasRenderingContext2D,
  horizontal: boolean,
  length: number,
  origin: number,
  zoom: number,
  unit: UnitId,
  colors: RulerColors,
) {
  const pxPer = pxPerUnit(unit)
  ctx.clearRect(0, 0, horizontal ? length : RULER, horizontal ? RULER : length)
  ctx.fillStyle = colors.bg
  ctx.fillRect(0, 0, horizontal ? length : RULER, horizontal ? RULER : length)
  ctx.fillStyle = colors.line
  if (horizontal) ctx.fillRect(0, RULER - 1, length, 1)
  else ctx.fillRect(RULER - 1, 0, 1, length)

  const stepUnits = niceStep(TARGET_MAJOR_PX / zoom / pxPer)
  const minorPx = (stepUnits * pxPer) / 5
  ctx.font = '9px ui-sans-serif, system-ui, sans-serif'
  ctx.textBaseline = 'middle'

  let k = Math.ceil((0 - origin) / zoom / minorPx)
  for (;;) {
    const coordPx = k * minorPx
    const pos = origin + coordPx * zoom
    if (pos > length) break
    const isMajor = k % 5 === 0
    const len = isMajor ? RULER : RULER * 0.4
    ctx.fillStyle = isMajor ? colors.tickMajor : colors.tick
    if (horizontal) ctx.fillRect(pos, RULER - len, 1, len)
    else ctx.fillRect(RULER - len, pos, len, 1)
    if (isMajor) {
      ctx.fillStyle = colors.label
      const label = fmtLabel(coordPx / pxPer, unit)
      if (horizontal) {
        ctx.textAlign = 'left'
        ctx.fillText(label, pos + 2, RULER / 2)
      } else {
        ctx.save()
        ctx.translate(RULER / 2, pos + 2)
        ctx.rotate(-Math.PI / 2)
        ctx.textAlign = 'right'
        ctx.fillText(label, 0, 0)
        ctx.restore()
      }
    }
    k++
  }
}

/**
 * UX-004: measurement rulers + draggable guides. Rendered as an overlay inside
 * the canvas viewport so it tracks the CSS-scaled, centred fabric canvas. The
 * root is click-through (pointer-events: none) so canvas selection is
 * unaffected; only the ruler strips and guide lines capture pointer events.
 */
export function CanvasRulers() {
  const theme = useThemeStore((s) => s.theme)
  const rulerColors = RULER_COLORS[theme]
  const showRulers = useCanvasStore((s) => s.showRulers)
  const showGuides = useCanvasStore((s) => s.showGuides)
  const rulerUnit = useCanvasStore((s) => s.rulerUnit)
  const guides = useCanvasStore((s) => s.guides)
  const activeGuides = useCanvasStore((s) => s.activeGuides)
  const addGuide = useCanvasStore((s) => s.addGuide)
  const updateGuide = useCanvasStore((s) => s.updateGuide)
  const removeGuide = useCanvasStore((s) => s.removeGuide)

  const { rootRef, box, width, height, zoom, originX, originY } = useViewportGeometry(showRulers)
  const topRef = useRef<HTMLCanvasElement>(null)
  const leftRef = useRef<HTMLCanvasElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  // UX-017: inline editor for typing a guide's exact position.
  const [editing, setEditing] = useState<{
    orientation: Orientation
    index: number
    value: string
  } | null>(null)

  const openEdit = (orientation: Orientation, index: number, posPx: number) =>
    setEditing({ orientation, index, value: fmtLabel(posPx / pxPerUnit(rulerUnit), rulerUnit) })

  const commitEdit = () => {
    if (!editing) return
    const max = editing.orientation === 'horizontal' ? height : width
    const px = Math.round(
      Math.min(Math.max((Number(editing.value) || 0) * pxPerUnit(rulerUnit), 0), max),
    )
    updateGuide(editing.orientation, editing.index, px)
    setEditing(null)
  }

  useEffect(() => {
    if (!showRulers || box.w === 0 || box.h === 0) return
    if (topRef.current) {
      drawRuler(setupHiDPI(topRef.current, box.w, RULER), true, box.w, originX, zoom, rulerUnit, rulerColors)
    }
    if (leftRef.current) {
      drawRuler(setupHiDPI(leftRef.current, RULER, box.h), false, box.h, originY, zoom, rulerUnit, rulerColors)
    }
  }, [showRulers, rulerUnit, zoom, originX, originY, box, rulerColors])

  // Window-level drag for guide create/move; commits on pointer-up.
  useEffect(() => {
    if (!drag) return
    const onMove = (e: PointerEvent) => {
      const rect = rootRef.current?.getBoundingClientRect()
      if (!rect) return
      const pos =
        drag.orientation === 'horizontal'
          ? (e.clientY - rect.top - originY) / zoom
          : (e.clientX - rect.left - originX) / zoom
      setDrag((d) => (d ? { ...d, pos } : d))
    }
    const onUp = (e: PointerEvent) => {
      const rect = rootRef.current?.getBoundingClientRect()
      const max = drag.orientation === 'horizontal' ? height : width
      const clamped = Math.round(Math.min(Math.max(drag.pos, 0), max))
      // Released back onto the ruler gutter → drop the guide.
      const onRuler =
        rect &&
        (drag.orientation === 'horizontal'
          ? e.clientY - rect.top < RULER
          : e.clientX - rect.left < RULER)
      if (drag.kind === 'create') {
        if (!onRuler) addGuide(drag.orientation, clamped)
      } else if (onRuler) {
        removeGuide(drag.orientation, drag.index)
      } else {
        updateGuide(drag.orientation, drag.index, clamped)
      }
      setDrag(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [drag, originX, originY, zoom, width, height, addGuide, updateGuide, removeGuide, rootRef])

  const startCreate = useCallback(
    (orientation: Orientation) => (e: React.PointerEvent) => {
      const rect = rootRef.current?.getBoundingClientRect()
      if (!rect) return
      const pos =
        orientation === 'horizontal'
          ? (e.clientY - rect.top - originY) / zoom
          : (e.clientX - rect.left - originX) / zoom
      setDrag({ kind: 'create', orientation, index: -1, pos })
    },
    [originX, originY, zoom, rootRef],
  )

  if (!showRulers) return null

  // Effective position of each guide (live position wins while dragging it).
  const guidePos = (orientation: Orientation, index: number, stored: number) =>
    drag && drag.kind === 'move' && drag.orientation === orientation && drag.index === index
      ? drag.pos
      : stored

  const renderGuides = showGuides || !!drag

  // Live position readout (in the selected unit) that follows the dragged guide.
  let readout: ReactNode = null
  if (drag) {
    const max = drag.orientation === 'horizontal' ? height : width
    const clamped = Math.min(Math.max(drag.pos, 0), max)
    const label = `${fmtLabel(clamped / pxPerUnit(rulerUnit), rulerUnit)} ${rulerUnit}`
    const style: CSSProperties =
      drag.orientation === 'horizontal'
        ? { left: RULER + 4, top: originY + drag.pos * zoom + 4 }
        : { left: originX + drag.pos * zoom + 4, top: RULER + 4 }
    readout = (
      <div
        className="pointer-events-none absolute rounded bg-editor-bg/90 px-1.5 py-0.5 text-[10px] font-medium text-pink-400"
        style={style}
      >
        {label}
      </div>
    )
  }

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-10">
      <canvas
        ref={topRef}
        onPointerDown={startCreate('horizontal')}
        className="pointer-events-auto absolute left-0 top-0 cursor-ns-resize"
      />
      <canvas
        ref={leftRef}
        onPointerDown={startCreate('vertical')}
        className="pointer-events-auto absolute left-0 top-0 cursor-ew-resize"
      />
      <div
        className="absolute left-0 top-0 border-b border-r border-editor-strong"
        style={{ width: RULER, height: RULER, backgroundColor: rulerColors.bg }}
      />

      {renderGuides &&
        guides.horizontal.map((y, i) => {
          const sy = originY + guidePos('horizontal', i, y) * zoom
          const dragging = drag?.kind === 'move' && drag.orientation === 'horizontal' && drag.index === i
          const active = dragging || activeGuides.horizontal.includes(y)
          return (
            <div
              key={`h${i}`}
              onPointerDown={() => setDrag({ kind: 'move', orientation: 'horizontal', index: i, pos: y })}
              onDoubleClick={() => openEdit('horizontal', i, y)}
              className="pointer-events-auto absolute cursor-ns-resize"
              style={{ left: RULER, right: 0, top: sy - GUIDE_GRAB, height: GUIDE_GRAB * 2 }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: GUIDE_GRAB,
                  left: 0,
                  right: 0,
                  height: 1,
                  background: active ? GUIDE_ACTIVE : GUIDE,
                }}
              />
            </div>
          )
        })}

      {renderGuides &&
        guides.vertical.map((x, i) => {
          const sx = originX + guidePos('vertical', i, x) * zoom
          const dragging = drag?.kind === 'move' && drag.orientation === 'vertical' && drag.index === i
          const active = dragging || activeGuides.vertical.includes(x)
          return (
            <div
              key={`v${i}`}
              onPointerDown={() => setDrag({ kind: 'move', orientation: 'vertical', index: i, pos: x })}
              onDoubleClick={() => openEdit('vertical', i, x)}
              className="pointer-events-auto absolute cursor-ew-resize"
              style={{ top: RULER, bottom: 0, left: sx - GUIDE_GRAB, width: GUIDE_GRAB * 2 }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: GUIDE_GRAB,
                  top: 0,
                  bottom: 0,
                  width: 1,
                  background: active ? GUIDE_ACTIVE : GUIDE,
                }}
              />
            </div>
          )
        })}

      {/* Preview line while dragging a brand-new guide off the ruler. */}
      {drag?.kind === 'create' &&
        (drag.orientation === 'horizontal' ? (
          <div
            className="pointer-events-none absolute"
            style={{ left: RULER, right: 0, top: originY + drag.pos * zoom, height: 1, background: GUIDE_ACTIVE }}
          />
        ) : (
          <div
            className="pointer-events-none absolute"
            style={{ top: RULER, bottom: 0, left: originX + drag.pos * zoom, width: 1, background: GUIDE_ACTIVE }}
          />
        ))}

      {readout}

      {editing &&
        (() => {
          const pos = guides[editing.orientation][editing.index]
          if (pos === undefined) return null
          const style: CSSProperties =
            editing.orientation === 'horizontal'
              ? { left: RULER + 4, top: originY + pos * zoom - 9 }
              : { left: originX + pos * zoom + 4, top: RULER + 4 }
          return (
            <input
              autoFocus
              value={editing.value}
              onChange={(e) => setEditing({ ...editing, value: e.target.value })}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit()
                else if (e.key === 'Escape') setEditing(null)
              }}
              title={`Position in ${rulerUnit}`}
              className="pointer-events-auto absolute w-16 rounded border border-editor-input bg-editor-bg px-1 text-xs text-editor-text-strong outline-none"
              style={style}
            />
          )
        })()}
    </div>
  )
}
