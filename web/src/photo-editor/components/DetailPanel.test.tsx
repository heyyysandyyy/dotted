import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DetailPanel } from './DetailPanel'
import { usePhotoEditorStore, DEFAULT_ADJUSTMENTS } from '../store/usePhotoEditorStore'

/** The number input beside a control's label — each slider renders a range
 *  and a number input bound to the same value. */
function inputFor(label: string): HTMLInputElement {
  const row = screen.getByText(label).closest('div')?.parentElement
  const input = row?.querySelector('input[type="number"]')
  if (!input) throw new Error(`no numeric input for ${label}`)
  return input as HTMLInputElement
}

describe('DetailPanel (PHOTO-008)', () => {
  beforeEach(() => {
    // setAdjustment schedules a debounced (real setTimeout) history push
    // (PHOTO-005) on the module-level timer shared with every other test
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

  it('renders every control across its three sections', () => {
    render(<DetailPanel />)
    for (const label of ['Amount', 'Radius', 'Gaussian', 'Motion', 'Motion angle', 'Reduce noise', 'Add grain']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('writes a typed value through to the store', () => {
    render(<DetailPanel />)
    fireEvent.change(inputFor('Gaussian'), { target: { value: '35' } })
    expect(usePhotoEditorStore.getState().adjustments.blur).toBe(35)
  })

  it('offers the one-directional controls no negative range', () => {
    render(<DetailPanel />)
    for (const label of ['Amount', 'Radius', 'Gaussian', 'Motion', 'Reduce noise', 'Add grain']) {
      expect(inputFor(label).min).toBe('0')
    }
  })

  it('leaves the motion angle signed — it is a direction, not a strength', () => {
    render(<DetailPanel />)
    expect(inputFor('Motion angle').min).toBe('-100')

    fireEvent.change(inputFor('Motion angle'), { target: { value: '-60' } })
    expect(usePhotoEditorStore.getState().adjustments.motionBlurAngle).toBe(-60)
  })

  it('hides the sharpen radius reset at its mid-scale default, not at zero', () => {
    render(<DetailPanel />)
    // Untouched: the radius sits at 50 and offers no reset.
    expect(screen.queryByTitle('Reset radius')).not.toBeInTheDocument()

    fireEvent.change(inputFor('Radius'), { target: { value: '80' } })
    expect(screen.getByTitle('Reset radius')).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('Reset radius'))
    expect(usePhotoEditorStore.getState().adjustments.sharpenRadius).toBe(DEFAULT_ADJUSTMENTS.sharpenRadius)
  })
})
