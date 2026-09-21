import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SelectionPanel } from './SelectionPanel'
import { usePhotoEditorStore, DEFAULT_ADJUSTMENTS } from '../store/usePhotoEditorStore'

const BOX = {
  kind: 'polygon' as const,
  mode: 'add' as const,
  points: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
  ],
}

describe('SelectionPanel (PHOTO-011)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    usePhotoEditorStore.setState({
      adjustments: DEFAULT_ADJUSTMENTS,
      historyStack: [DEFAULT_ADJUSTMENTS],
      historyIndex: 0,
      selectionTool: null,
      selectionCombine: 'new',
      cropMode: false,
      activeLayerId: null,
      showMask: true,
    })
  })
  afterEach(() => vi.useRealTimers())

  it('walks through the steps as the selection is made', () => {
    const { rerender } = render(<SelectionPanel />)
    expect(screen.getByText(/Pick a tool above/)).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Rectangle marquee'))
    rerender(<SelectionPanel />)
    expect(screen.getByText(/Drag on.*the photo/)).toBeTruthy()
    usePhotoEditorStore.getState().applySelectionOp(BOX, 'new')
    rerender(<SelectionPanel />)
    expect(screen.getByText(/Move any slider below/)).toBeTruthy()
  })

  it('turns the selection into its own layer in one click', () => {
    usePhotoEditorStore.getState().applySelectionOp(BOX, 'new')
    render(<SelectionPanel />)
    fireEvent.click(screen.getByText('Adjust this area separately'))
    const { adjustments, activeLayerId } = usePhotoEditorStore.getState()
    expect(adjustments.layers).toHaveLength(1)
    expect(activeLayerId).toBe(adjustments.layers[0].id)
    // The mask moved onto the layer, so the base isn't adjusted too.
    expect(adjustments.layers[0].selection.ops).toHaveLength(1)
    expect(adjustments.selection.ops).toHaveLength(0)
  })

  it('toggles the mask tint', () => {
    render(<SelectionPanel />)
    expect(usePhotoEditorStore.getState().showMask).toBe(true)
    fireEvent.click(screen.getByLabelText('Show mask'))
    expect(usePhotoEditorStore.getState().showMask).toBe(false)
  })

  it('picks a tool, and picking it again puts it down', () => {
    render(<SelectionPanel />)
    fireEvent.click(screen.getByLabelText('Lasso'))
    expect(usePhotoEditorStore.getState().selectionTool).toBe('lasso')
    fireEvent.click(screen.getByLabelText('Lasso'))
    expect(usePhotoEditorStore.getState().selectionTool).toBeNull()
  })

  it('shows the wand’s settings only with the wand', () => {
    render(<SelectionPanel />)
    expect(screen.queryByText('Tolerance')).toBeNull()
    fireEvent.click(screen.getByLabelText('Magic wand'))
    expect(screen.getByText('Tolerance')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Contiguous'))
    expect(usePhotoEditorStore.getState().wandContiguous).toBe(false)
  })

  it('shows the brush and gradient settings only with those tools', () => {
    render(<SelectionPanel />)
    expect(screen.queryByText('Brush size')).toBeNull()
    fireEvent.click(screen.getByLabelText('Brush'))
    expect(screen.getByText('Brush size')).toBeTruthy()
    expect(screen.getByText('Hardness')).toBeTruthy()
    expect(screen.getByText('Paint to add; hold Alt to erase.')).toBeTruthy()
    const [size] = screen.getAllByRole('slider')
    fireEvent.change(size, { target: { value: '80' } })
    expect(usePhotoEditorStore.getState().brushSize).toBe(80)

    fireEvent.click(screen.getByLabelText('Gradient'))
    expect(screen.queryByText('Brush size')).toBeNull()
    fireEvent.click(screen.getByText('Radial'))
    expect(usePhotoEditorStore.getState().gradientShape).toBe('radial')
  })

  it('sets how the next shape combines', () => {
    render(<SelectionPanel />)
    fireEvent.click(screen.getByText('Subtract'))
    expect(usePhotoEditorStore.getState().selectionCombine).toBe('subtract')
  })

  it('offers invert and deselect only with something selected', () => {
    const { rerender } = render(<SelectionPanel />)
    expect((screen.getByText('Invert') as HTMLButtonElement).disabled).toBe(true)
    usePhotoEditorStore.getState().applySelectionOp(BOX, 'new')
    rerender(<SelectionPanel />)
    expect(screen.getByText('Adjustments below apply only inside the selection.')).toBeTruthy()
    fireEvent.click(screen.getByText('Invert'))
    expect(usePhotoEditorStore.getState().adjustments.selection.inverted).toBe(true)
    fireEvent.click(screen.getByText('Deselect'))
    expect(usePhotoEditorStore.getState().adjustments.selection.ops).toHaveLength(0)
  })
})
