import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CurvesPanel } from './CurvesPanel'
import { usePhotoEditorStore, DEFAULT_ADJUSTMENTS } from '../store/usePhotoEditorStore'
import { DEFAULT_CURVES, IDENTITY_CURVE } from '../utils/levelsCurves'

const BENT = [
  { x: 0, y: 0 },
  { x: 128, y: 200 },
  { x: 255, y: 255 },
]

describe('CurvesPanel (PHOTO-007 curves)', () => {
  beforeEach(() => {
    // setCurve shares the debounced (real setTimeout) history push with
    // every other adjustment — fake timers keep it from firing mid-assertion
    // in an unrelated test.
    vi.useFakeTimers()
    usePhotoEditorStore.setState({
      adjustments: DEFAULT_ADJUSTMENTS,
      historyStack: [DEFAULT_ADJUSTMENTS],
      historyIndex: 0,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('offers a curve per channel, composite first', () => {
    render(<CurvesPanel histogram={null} />)
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(
      expect.arrayContaining(['RGB', 'Red', 'Green', 'Blue']),
    )
    expect(screen.getByText('RGB')).toHaveAttribute('aria-pressed', 'true')
  })

  it('switching channel swaps which curve is on screen without touching the others', () => {
    usePhotoEditorStore.setState({
      adjustments: { ...DEFAULT_ADJUSTMENTS, curves: { ...DEFAULT_CURVES, r: BENT } },
    })
    const { container } = render(<CurvesPanel histogram={null} />)

    expect(container.querySelectorAll('circle')).toHaveLength(2) // RGB, still straight
    fireEvent.click(screen.getByText('Red'))

    expect(screen.getByText('Red')).toHaveAttribute('aria-pressed', 'true')
    expect(container.querySelectorAll('circle')).toHaveLength(3)
    expect(usePhotoEditorStore.getState().adjustments.curves).toEqual({ ...DEFAULT_CURVES, r: BENT })
  })

  it('shows a reset only once the channel on screen has been bent', () => {
    usePhotoEditorStore.setState({
      adjustments: { ...DEFAULT_ADJUSTMENTS, curves: { ...DEFAULT_CURVES, g: BENT } },
    })
    render(<CurvesPanel histogram={null} />)

    expect(screen.queryByTitle('Reset RGB curve')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Green'))
    expect(screen.getByTitle('Reset Green curve')).toBeInTheDocument()
  })

  it('resetting a channel straightens only that curve', () => {
    usePhotoEditorStore.setState({
      adjustments: { ...DEFAULT_ADJUSTMENTS, curves: { ...DEFAULT_CURVES, rgb: BENT, b: BENT } },
    })
    render(<CurvesPanel histogram={null} />)

    fireEvent.click(screen.getByTitle('Reset RGB curve'))

    const { curves } = usePhotoEditorStore.getState().adjustments
    expect(curves.rgb).toEqual(IDENTITY_CURVE)
    expect(curves.b).toEqual(BENT)
  })

  it('editing the plot writes to the channel currently selected', () => {
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 255,
      height: 255,
    } as DOMRect)
    const { container } = render(<CurvesPanel histogram={null} />)
    fireEvent.click(screen.getByText('Blue'))

    fireEvent.pointerDown(container.querySelector('[aria-label="Tone curve"]') as SVGSVGElement, {
      clientX: 128,
      clientY: 55,
    })

    const { curves } = usePhotoEditorStore.getState().adjustments
    expect(curves.b).toEqual([
      { x: 0, y: 0 },
      { x: 128, y: 200 },
      { x: 255, y: 255 },
    ])
    expect(curves.rgb).toEqual(DEFAULT_CURVES.rgb)
  })
})
