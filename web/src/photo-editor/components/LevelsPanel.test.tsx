import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LevelsPanel } from './LevelsPanel'
import { usePhotoEditorStore, DEFAULT_ADJUSTMENTS } from '../store/usePhotoEditorStore'
import { DEFAULT_LEVELS } from '../utils/levelsCurves'
import { computeHistogram } from '../utils/histogram'

const HISTOGRAM = computeHistogram({ data: new Uint8ClampedArray([128, 128, 128, 255]) } as unknown as ImageData)

describe('LevelsPanel (PHOTO-007 levels)', () => {
  beforeEach(() => {
    // setLevel schedules the same debounced (real setTimeout) history push
    // every other adjustment does — fake timers keep it from firing later,
    // mid-assertion, in an unrelated test.
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

  it('renders the three levels controls', () => {
    render(<LevelsPanel histogram={HISTOGRAM} />)
    for (const label of ['Black point', 'White point', 'Midtones']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('gives each control its own range rather than the shared -100..100 one', () => {
    render(<LevelsPanel histogram={HISTOGRAM} />)
    const [black, white, gamma] = screen.getAllByRole('slider')

    expect(black).toHaveAttribute('min', '0')
    expect(black).toHaveAttribute('max', '254')
    expect(white).toHaveAttribute('max', '255')
    expect(gamma).toHaveAttribute('step', '0.01')
  })

  it('moving the black point writes it to the store', () => {
    render(<LevelsPanel histogram={HISTOGRAM} />)

    fireEvent.change(screen.getAllByRole('slider')[0], { target: { value: '32' } })

    expect(usePhotoEditorStore.getState().adjustments.levels).toEqual({ ...DEFAULT_LEVELS, black: 32 })
  })

  it('moving midtones writes a fractional gamma', () => {
    render(<LevelsPanel histogram={HISTOGRAM} />)

    fireEvent.change(screen.getAllByRole('slider')[2], { target: { value: '1.45' } })

    expect(usePhotoEditorStore.getState().adjustments.levels.gamma).toBe(1.45)
  })

  it('shows a reset only for the control that has moved, and resets just that one', () => {
    usePhotoEditorStore.setState({
      adjustments: { ...DEFAULT_ADJUSTMENTS, levels: { black: 20, white: 240, gamma: 1 } },
    })
    render(<LevelsPanel histogram={HISTOGRAM} />)

    expect(screen.queryByTitle('Reset midtones')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTitle('Reset black point'))

    expect(usePhotoEditorStore.getState().adjustments.levels).toEqual({ black: 0, white: 240, gamma: 1 })
  })

  it('renders the histogram even before one has been counted', () => {
    const { container } = render(<LevelsPanel histogram={null} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
