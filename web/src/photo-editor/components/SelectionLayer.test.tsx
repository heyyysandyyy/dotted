import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SelectionLayer } from './SelectionLayer'
import { DEFAULT_GEOMETRY, planGeometry } from '../utils/geometry'
import { EMPTY_SELECTION } from '../utils/selection'
import type { PolygonOp } from '../utils/selection'
import type { SelectionTool } from '../store/usePhotoEditorStore'

// jsdom has no PointerEvent; without one fireEvent drops clientX/clientY.
beforeAll(() => {
  if (typeof window.PointerEvent === 'undefined') {
    class PointerEventPolyfill extends MouseEvent {
      pointerId: number
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init)
        this.pointerId = init.pointerId ?? 1
      }
    }
    window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent
  }
})

/** The layer shown 200×100 on screen over a 400×200 photo, at the origin. */
function layer(tool: SelectionTool, geometry = DEFAULT_GEOMETRY) {
  const plan = planGeometry(geometry, 400, 200)
  const onOp = vi.fn()
  const onDeselect = vi.fn()
  const source = document.createElement('img')
  const w = plan.width / 2
  const h = plan.height / 2
  render(
    <div style={{ position: 'relative' }}>
      <SelectionLayer
        source={source}
        plan={plan}
        width={w}
        height={h}
        selection={EMPTY_SELECTION}
        tool={tool}
        combine="new"
        wandTolerance={20}
        wandContiguous={false}
        onOp={onOp}
        onDeselect={onDeselect}
      />
    </div>,
  )
  const surface = screen.getByTestId('selection-surface')
  surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: w, height: h, right: w, bottom: h, x: 0, y: 0, toJSON: () => ({}) })
  return { surface, onOp, onDeselect }
}

function drag(el: Element, points: [number, number][], init: PointerEventInit = {}) {
  const [first, ...rest] = points
  fireEvent.pointerDown(el, { clientX: first[0], clientY: first[1], button: 0, pointerId: 1, ...init })
  for (const [x, y] of rest) fireEvent.pointerMove(el, { clientX: x, clientY: y, pointerId: 1 })
  const [lx, ly] = points[points.length - 1]
  fireEvent.pointerUp(el, { clientX: lx, clientY: ly, pointerId: 1 })
}

describe('SelectionLayer (PHOTO-011)', () => {
  it('turns a marquee drag into a polygon in normalized source coordinates', () => {
    const { surface, onOp } = layer('rect')
    drag(surface, [[20, 10], [120, 60]])
    const [op, combine] = onOp.mock.calls[0]
    expect(combine).toBe('new')
    const pts = (op as PolygonOp).points
    expect(pts[0].x).toBeCloseTo(0.1)
    expect(pts[0].y).toBeCloseTo(0.1)
    expect(pts[2].x).toBeCloseTo(0.6)
    expect(pts[2].y).toBeCloseTo(0.6)
  })

  it('maps through the geometry: on a quarter-turned photo the screen’s top-left is the source’s bottom-left', () => {
    const { surface, onOp } = layer('rect', { ...DEFAULT_GEOMETRY, quarterTurns: 1 })
    drag(surface, [[0, 0], [20, 20]])
    const first = (onOp.mock.calls[0][0] as PolygonOp).points[0]
    expect(first.x).toBeCloseTo(0)
    expect(first.y).toBeCloseTo(1)
  })

  it('lets Shift add and Alt subtract for one gesture', () => {
    const { surface, onOp } = layer('ellipse')
    drag(surface, [[10, 10], [60, 60]], { shiftKey: true })
    drag(surface, [[10, 10], [60, 60]], { altKey: true })
    expect(onOp.mock.calls.map((c) => c[1])).toEqual(['add', 'subtract'])
  })

  it('collects a lasso path', () => {
    const { surface, onOp } = layer('lasso')
    drag(surface, [[10, 10], [60, 12], [70, 60], [15, 55]])
    expect((onOp.mock.calls[0][0] as PolygonOp).points.length).toBeGreaterThanOrEqual(4)
  })

  it('seeds the wand with a click, carrying its settings', () => {
    const { surface, onOp } = layer('wand')
    fireEvent.pointerDown(surface, { clientX: 100, clientY: 50, button: 0, pointerId: 1 })
    expect(onOp.mock.calls[0][0]).toMatchObject({ kind: 'wand', seed: { x: 0.5, y: 0.5 }, tolerance: 20, contiguous: false })
  })

  it('ignores a wand click off the photo', () => {
    const { surface, onOp } = layer('wand', { ...DEFAULT_GEOMETRY, angle: 45 })
    // The top-left corner of a 45°-turned photo's frame is empty.
    fireEvent.pointerDown(surface, { clientX: 1, clientY: 1, button: 0, pointerId: 1 })
    expect(onOp).not.toHaveBeenCalled()
  })

  it('thins a very long lasso before storing it', () => {
    const { surface, onOp } = layer('lasso')
    const path: [number, number][] = Array.from({ length: 1200 }, (_, i) => {
      const t = (i / 1200) * Math.PI * 2
      return [100 + 60 * Math.cos(t) + (i % 2) * 3, 50 + 40 * Math.sin(t)]
    })
    drag(surface, path)
    const pts = (onOp.mock.calls[0][0] as PolygonOp).points
    expect(pts.length).toBeLessThanOrEqual(400)
    expect(pts.length).toBeGreaterThan(100)
  })

  it('deselects on a plain click', () => {
    const { surface, onOp, onDeselect } = layer('rect')
    drag(surface, [[30, 30], [31, 31]])
    expect(onOp).not.toHaveBeenCalled()
    expect(onDeselect).toHaveBeenCalled()
  })
})
