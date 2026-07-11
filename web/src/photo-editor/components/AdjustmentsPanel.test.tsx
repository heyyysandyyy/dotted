import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AdjustmentsPanel } from './AdjustmentsPanel'
import { usePhotoEditorStore } from '../store/usePhotoEditorStore'

describe('AdjustmentsPanel (PHOTO-004)', () => {
  beforeEach(() => {
    // setAdjustment schedules a debounced (real setTimeout) history push
    // (PHOTO-005) on the module-level timer it shares with every other test
    // file — fake timers keep that pending callback from firing later,
    // mid-assertion, in some unrelated test.
    vi.useFakeTimers()
    usePhotoEditorStore.setState({
      adjustments: { brightness: 0, contrast: 0 },
      historyStack: [{ brightness: 0, contrast: 0 }],
      historyIndex: 0,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders both Brightness and Contrast controls', () => {
    render(<AdjustmentsPanel />)
    expect(screen.getByText('Brightness')).toBeInTheDocument()
    expect(screen.getByText('Contrast')).toBeInTheDocument()
  })

  it('moving the brightness slider updates the store live', () => {
    render(<AdjustmentsPanel />)
    const sliders = screen.getAllByRole('slider')
    fireEvent.change(sliders[0], { target: { value: '60' } })
    expect(usePhotoEditorStore.getState().adjustments.brightness).toBe(60)
    expect(usePhotoEditorStore.getState().adjustments.contrast).toBe(0)
  })

  it('reset zeroes only the control that was reset', () => {
    usePhotoEditorStore.setState({ adjustments: { brightness: 40, contrast: -30 } })
    render(<AdjustmentsPanel />)

    fireEvent.click(screen.getByTitle('Reset brightness'))

    expect(usePhotoEditorStore.getState().adjustments).toEqual({ brightness: 0, contrast: -30 })
  })
})
