import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ColorPanel } from './ColorPanel'
import { usePhotoEditorStore, DEFAULT_ADJUSTMENTS } from '../store/usePhotoEditorStore'

describe('ColorPanel (PHOTO-007 colour controls)', () => {
  beforeEach(() => {
    // setAdjustment/setToggle schedule a debounced (real setTimeout) history
    // push (PHOTO-005) on the module-level timer shared with every other
    // test file — fake timers keep that pending callback from firing later,
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

  it('renders every colour control across its three sections', () => {
    render(<ColorPanel />)
    for (const label of [
      'Saturation',
      'Vibrance',
      'Hue shift',
      'Black & white',
      'Invert',
      'Temperature',
      'Tint',
      'Red',
      'Green',
      'Blue',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('moving the saturation slider updates only saturation in the store live', () => {
    render(<ColorPanel />)
    // Order matches the render order: saturation, vibrance, hue, then the
    // white-balance and colour-balance sections.
    fireEvent.change(screen.getAllByRole('slider')[0], { target: { value: '65' } })
    expect(usePhotoEditorStore.getState().adjustments).toEqual({ ...DEFAULT_ADJUSTMENTS, saturation: 65 })
  })

  it('moving the temperature slider updates only temperature', () => {
    render(<ColorPanel />)
    fireEvent.change(screen.getAllByRole('slider')[3], { target: { value: '-40' } })
    expect(usePhotoEditorStore.getState().adjustments).toEqual({ ...DEFAULT_ADJUSTMENTS, temperature: -40 })
  })

  it('moving a colour-balance slider updates only that channel', () => {
    render(<ColorPanel />)
    fireEvent.change(screen.getAllByRole('slider')[6], { target: { value: '25' } })
    expect(usePhotoEditorStore.getState().adjustments).toEqual({ ...DEFAULT_ADJUSTMENTS, greenBalance: 25 })
  })

  it('checking Black & white sets the toggle without disturbing the sliders', () => {
    usePhotoEditorStore.setState({ adjustments: { ...DEFAULT_ADJUSTMENTS, saturation: 30 } })
    render(<ColorPanel />)

    fireEvent.click(screen.getAllByRole('checkbox')[0])

    expect(usePhotoEditorStore.getState().adjustments).toEqual({
      ...DEFAULT_ADJUSTMENTS,
      saturation: 30,
      blackAndWhite: true,
    })
  })

  it('unchecking Invert clears it again', () => {
    usePhotoEditorStore.setState({ adjustments: { ...DEFAULT_ADJUSTMENTS, invert: true } })
    render(<ColorPanel />)

    fireEvent.click(screen.getAllByRole('checkbox')[1])

    expect(usePhotoEditorStore.getState().adjustments.invert).toBe(false)
  })

  it('reset zeroes only the control that was reset', () => {
    usePhotoEditorStore.setState({ adjustments: { ...DEFAULT_ADJUSTMENTS, hue: 40, tint: -30 } })
    render(<ColorPanel />)

    fireEvent.click(screen.getByTitle('Reset hue shift'))

    expect(usePhotoEditorStore.getState().adjustments).toEqual({ ...DEFAULT_ADJUSTMENTS, tint: -30 })
  })
})
