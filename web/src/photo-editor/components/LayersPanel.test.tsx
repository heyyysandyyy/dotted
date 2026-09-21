import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { LayersPanel } from './LayersPanel'
import { AdjustmentsPanel } from './AdjustmentsPanel'
import { usePhotoEditorStore, DEFAULT_ADJUSTMENTS } from '../store/usePhotoEditorStore'

const state = () => usePhotoEditorStore.getState()

describe('LayersPanel (PHOTO-011 phase 2)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    usePhotoEditorStore.setState({
      adjustments: DEFAULT_ADJUSTMENTS,
      historyStack: [DEFAULT_ADJUSTMENTS],
      historyIndex: 0,
      activeLayerId: null,
    })
  })
  afterEach(() => vi.useRealTimers())

  it('adds layers, lists them top-first above the base, and shows the target', () => {
    render(<LayersPanel />)
    fireEvent.click(screen.getByText('New layer'))
    fireEvent.click(screen.getByText('New layer'))
    const rows = within(screen.getByRole('list', { name: 'Adjustment layers' })).getAllByRole('listitem')
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Layer 2'),
      expect.stringContaining('Layer 1'),
      'Base image',
    ])
    expect(screen.getByText('Editing Layer 2. The panels below change only this layer.')).toBeTruthy()
    expect(screen.getByText('Layer opacity')).toBeTruthy()
  })

  it('switches the target, and the adjustment panels follow it', () => {
    render(
      <>
        <LayersPanel />
        <AdjustmentsPanel />
      </>,
    )
    fireEvent.click(screen.getByText('New layer'))
    const brightness = screen.getAllByRole('slider')[1]
    fireEvent.change(brightness, { target: { value: '35' } })
    expect(state().adjustments.layers[0].adjustments.brightness).toBe(35)
    expect(state().adjustments.brightness).toBe(0)

    fireEvent.click(screen.getByText('Base image'))
    expect((screen.getAllByRole('slider')[0] as HTMLInputElement).value).toBe('0')
    expect(screen.queryByText('Layer opacity')).toBeNull()
  })

  it('renames on double-click, hides, reorders and deletes', () => {
    render(<LayersPanel />)
    fireEvent.click(screen.getByText('New layer'))
    fireEvent.click(screen.getByText('New layer'))
    fireEvent.doubleClick(screen.getByText('Layer 1'))
    const input = screen.getByLabelText('Layer name')
    fireEvent.change(input, { target: { value: 'Shadows' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(state().adjustments.layers[0].name).toBe('Shadows')

    fireEvent.click(screen.getByLabelText('Hide Shadows'))
    expect(state().adjustments.layers[0].visible).toBe(false)

    const [upTop] = screen.getAllByTitle('Move up')
    expect((upTop as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getAllByTitle('Move up')[1])
    expect(state().adjustments.layers.map((l) => l.name)).toEqual(['Layer 2', 'Shadows'])

    fireEvent.click(screen.getByLabelText('Delete Shadows'))
    expect(state().adjustments.layers.map((l) => l.name)).toEqual(['Layer 2'])
  })
})
