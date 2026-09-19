import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GeometryPanel } from './GeometryPanel'
import { usePhotoEditorStore, DEFAULT_ADJUSTMENTS } from '../store/usePhotoEditorStore'
import { planGeometry } from '../utils/geometry'

const W = 400
const H = 300

function renderPanel() {
  const plan = () => planGeometry(usePhotoEditorStore.getState().adjustments.geometry, W, H)
  const view = render(<GeometryPanel plan={plan()} />)
  return { ...view, refresh: () => view.rerender(<GeometryPanel plan={plan()} />) }
}

const geometry = () => usePhotoEditorStore.getState().adjustments.geometry

describe('GeometryPanel (PHOTO-009)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    usePhotoEditorStore.setState({
      adjustments: DEFAULT_ADJUSTMENTS,
      historyStack: [DEFAULT_ADJUSTMENTS],
      historyIndex: 0,
      cropMode: false,
      cropAspect: null,
    })
  })
  afterEach(() => vi.useRealTimers())

  it('opens and closes the crop tool', () => {
    renderPanel()
    fireEvent.click(screen.getByText('Crop'))
    expect(usePhotoEditorStore.getState().cropMode).toBe(true)
    expect(screen.getByRole('group', { name: 'Crop aspect ratio' })).toBeTruthy()
    fireEvent.click(screen.getByText('Done'))
    expect(usePhotoEditorStore.getState().cropMode).toBe(false)
  })

  it('reshapes the crop when an aspect preset is picked, and can swap its orientation', () => {
    usePhotoEditorStore.setState({ cropMode: true })
    const { refresh } = renderPanel()

    fireEvent.click(screen.getByText('16:9'))
    let c = geometry().crop
    expect((c.w * W) / (c.h * H)).toBeCloseTo(16 / 9)
    expect(usePhotoEditorStore.getState().cropAspect).toBeCloseTo(16 / 9)

    refresh()
    fireEvent.click(screen.getByTitle('Swap portrait/landscape'))
    c = geometry().crop
    expect((c.w * W) / (c.h * H)).toBeCloseTo(9 / 16)
  })

  it('turns and flips from its buttons', () => {
    renderPanel()
    fireEvent.click(screen.getByTitle('Rotate 90° right'))
    expect(geometry().quarterTurns).toBe(1)
    fireEvent.click(screen.getByTitle('Rotate 90° left'))
    expect(geometry().quarterTurns).toBe(0)
    fireEvent.click(screen.getByTitle('Flip horizontal'))
    fireEvent.click(screen.getByTitle('Flip vertical'))
    expect(geometry()).toMatchObject({ flipH: true, flipV: true })
  })

  it('drives straighten, rotate and perspective from sliders', () => {
    renderPanel()
    const [straighten, rotate, vertical] = screen.getAllByRole('slider')
    fireEvent.change(straighten, { target: { value: '4.5' } })
    fireEvent.change(rotate, { target: { value: '-30' } })
    fireEvent.change(vertical, { target: { value: '40' } })
    expect(geometry()).toMatchObject({ straighten: 4.5, angle: -30, perspectiveV: 40 })
  })

  it('resizes by pixel width, keeping the proportions, once the field is committed', () => {
    const { refresh } = renderPanel()
    const width = screen.getByLabelText('Width') as HTMLInputElement
    fireEvent.change(width, { target: { value: '20' } })
    // Nothing yet: "20" may be on its way to "200".
    expect(geometry().resizeScale).toBe(1)
    fireEvent.change(width, { target: { value: '200' } })
    fireEvent.keyDown(width, { key: 'Enter' })
    expect(geometry().resizeScale).toBeCloseTo(0.5)

    refresh()
    expect((screen.getByLabelText('Height') as HTMLInputElement).value).toBe('150')
    expect(screen.getByText('50% of 400 × 300')).toBeTruthy()
  })

  it('switches to nearest-neighbour resampling', () => {
    renderPanel()
    fireEvent.click(screen.getByText('Nearest'))
    expect(geometry().resample).toBe('nearest')
  })
})
