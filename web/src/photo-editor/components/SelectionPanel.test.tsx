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
    })
  })
  afterEach(() => vi.useRealTimers())

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
