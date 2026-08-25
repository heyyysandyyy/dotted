import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AdjustmentsPanel } from './AdjustmentsPanel'
import { usePhotoEditorStore, DEFAULT_ADJUSTMENTS } from '../store/usePhotoEditorStore'

describe('AdjustmentsPanel (PHOTO-004 + PHOTO-007 tone controls)', () => {
  beforeEach(() => {
    // setAdjustment schedules a debounced (real setTimeout) history push
    // (PHOTO-005) on the module-level timer it shares with every other test
    // file — fake timers keep that pending callback from firing later,
    // mid-assertion, in some unrelated test.
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

  it('renders Brightness, Contrast, Exposure, Highlights and Shadows controls', () => {
    render(<AdjustmentsPanel />)
    expect(screen.getByText('Brightness')).toBeInTheDocument()
    expect(screen.getByText('Contrast')).toBeInTheDocument()
    expect(screen.getByText('Exposure')).toBeInTheDocument()
    expect(screen.getByText('Highlights')).toBeInTheDocument()
    expect(screen.getByText('Shadows')).toBeInTheDocument()
  })

  it('moving the brightness slider updates only brightness in the store live', () => {
    render(<AdjustmentsPanel />)
    const sliders = screen.getAllByRole('slider')
    fireEvent.change(sliders[0], { target: { value: '60' } })
    expect(usePhotoEditorStore.getState().adjustments).toEqual({ ...DEFAULT_ADJUSTMENTS, brightness: 60 })
  })

  it('moving the exposure slider updates only exposure in the store live', () => {
    render(<AdjustmentsPanel />)
    const sliders = screen.getAllByRole('slider')
    // Order matches AdjustmentsPanel's render order: brightness, contrast, exposure, highlights, shadows.
    fireEvent.change(sliders[2], { target: { value: '35' } })
    expect(usePhotoEditorStore.getState().adjustments).toEqual({ ...DEFAULT_ADJUSTMENTS, exposure: 35 })
  })

  it('reset zeroes only the control that was reset', () => {
    usePhotoEditorStore.setState({ adjustments: { ...DEFAULT_ADJUSTMENTS, brightness: 40, shadows: -30 } })
    render(<AdjustmentsPanel />)

    fireEvent.click(screen.getByTitle('Reset brightness'))

    expect(usePhotoEditorStore.getState().adjustments).toEqual({ ...DEFAULT_ADJUSTMENTS, shadows: -30 })
  })
})
