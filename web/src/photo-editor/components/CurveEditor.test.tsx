import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { CurveEditor } from './CurveEditor'
import { MAX_CURVE_POINTS, IDENTITY_CURVE } from '../utils/levelsCurves'

/** Lays the plot out as a 255x255 box at the origin, so a client coordinate
 *  *is* a curve coordinate (with y flipped) and the assertions below can
 *  name the values they expect. jsdom measures every element as 0x0
 *  otherwise, which the editor treats as "not laid out yet". */
function layOutPlot() {
  vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 255,
    height: 255,
  } as DOMRect)
}

function renderEditor(points = IDENTITY_CURVE) {
  const onChange = vi.fn()
  const { container } = render(
    <CurveEditor points={points} channel="rgb" histogram={null} onChange={onChange} />,
  )
  const svg = container.querySelector('[aria-label="Tone curve"]') as SVGSVGElement
  return { onChange, container, svg }
}

describe('CurveEditor (PHOTO-007 curves)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders one handle per control point', () => {
    layOutPlot()
    const { container } = renderEditor([
      { x: 0, y: 0 },
      { x: 128, y: 200 },
      { x: 255, y: 255 },
    ])

    expect(container.querySelectorAll('circle')).toHaveLength(3)
  })

  it('clicking empty space adds a point there, in input order', () => {
    layOutPlot()
    const { onChange, svg } = renderEditor()

    fireEvent.pointerDown(svg, { clientX: 64, clientY: 155 })

    expect(onChange).toHaveBeenCalledWith([
      { x: 0, y: 0 },
      { x: 64, y: 100 },
      { x: 255, y: 255 },
    ])
  })

  it('clicking on top of an existing point grabs it instead of adding a duplicate', () => {
    layOutPlot()
    const { onChange, svg } = renderEditor()

    fireEvent.pointerDown(svg, { clientX: 2, clientY: 253 })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('dragging a handle moves it to the pointer', () => {
    layOutPlot()
    const { onChange, container } = renderEditor([
      { x: 0, y: 0 },
      { x: 128, y: 128 },
      { x: 255, y: 255 },
    ])

    fireEvent.pointerDown(container.querySelectorAll('circle')[1])
    fireEvent.pointerMove(window, { clientX: 128, clientY: 55 })

    expect(onChange).toHaveBeenCalledWith([
      { x: 0, y: 0 },
      { x: 128, y: 200 },
      { x: 255, y: 255 },
    ])
  })

  it('stops moving the point once the pointer is released', () => {
    layOutPlot()
    const { onChange, container } = renderEditor([
      { x: 0, y: 0 },
      { x: 128, y: 128 },
      { x: 255, y: 255 },
    ])

    fireEvent.pointerDown(container.querySelectorAll('circle')[1])
    fireEvent.pointerUp(window)
    fireEvent.pointerMove(window, { clientX: 128, clientY: 55 })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps a dragged point between its neighbours', () => {
    layOutPlot()
    const { onChange, container } = renderEditor([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 120, y: 120 },
      { x: 255, y: 255 },
    ])

    // Dragged well past the point on its right; it stops just short of it.
    fireEvent.pointerDown(container.querySelectorAll('circle')[1])
    fireEvent.pointerMove(window, { clientX: 200, clientY: 55 })

    const moved = onChange.mock.calls[0][0]
    expect(moved[1].x).toBeLessThan(120)
    expect(moved[1].x).toBeGreaterThan(100)
  })

  it('double-clicking an interior point removes it', () => {
    layOutPlot()
    const { onChange, container } = renderEditor([
      { x: 0, y: 0 },
      { x: 128, y: 200 },
      { x: 255, y: 255 },
    ])

    fireEvent.doubleClick(container.querySelectorAll('circle')[1])

    expect(onChange).toHaveBeenCalledWith(IDENTITY_CURVE)
  })

  it('refuses to remove an endpoint — they are the curve\'s own range', () => {
    layOutPlot()
    const { onChange, container } = renderEditor([
      { x: 0, y: 0 },
      { x: 128, y: 200 },
      { x: 255, y: 255 },
    ])

    fireEvent.doubleClick(container.querySelectorAll('circle')[0])
    fireEvent.doubleClick(container.querySelectorAll('circle')[2])

    expect(onChange).not.toHaveBeenCalled()
  })

  it('stops adding points at MAX_CURVE_POINTS', () => {
    layOutPlot()
    const full = Array.from({ length: MAX_CURVE_POINTS }, (_, i) => ({ x: i * 16, y: i * 16 }))
    const { onChange, svg } = renderEditor(full)

    fireEvent.pointerDown(svg, { clientX: 250, clientY: 5 })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('ignores pointers while the plot has no layout to measure against', () => {
    const { onChange, svg } = renderEditor()

    fireEvent.pointerDown(svg, { clientX: 64, clientY: 155 })

    expect(onChange).not.toHaveBeenCalled()
  })
})
