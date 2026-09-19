import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePhotoEditorShortcuts } from './usePhotoEditorShortcuts'
import { usePhotoEditorStore, DEFAULT_ADJUSTMENTS } from '../store/usePhotoEditorStore'

function pressKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }))
}

const BRIGHT_40 = { ...DEFAULT_ADJUSTMENTS, brightness: 40 }

describe('usePhotoEditorShortcuts (PHOTO-005)', () => {
  beforeEach(() => {
    usePhotoEditorStore.setState({
      historyStack: [DEFAULT_ADJUSTMENTS, BRIGHT_40],
      historyIndex: 1,
      adjustments: BRIGHT_40,
    })
  })

  it('Cmd/Ctrl+Z undoes', () => {
    renderHook(() => usePhotoEditorShortcuts())
    pressKey('z', { metaKey: true })
    expect(usePhotoEditorStore.getState().adjustments).toEqual(DEFAULT_ADJUSTMENTS)
  })

  it('Cmd/Ctrl+Shift+Z redoes', () => {
    renderHook(() => usePhotoEditorShortcuts())
    pressKey('z', { metaKey: true }) // undo first
    pressKey('z', { metaKey: true, shiftKey: true }) // then redo
    expect(usePhotoEditorStore.getState().adjustments).toEqual(BRIGHT_40)
  })

  it('does nothing without a modifier key', () => {
    renderHook(() => usePhotoEditorShortcuts())
    pressKey('z')
    expect(usePhotoEditorStore.getState().adjustments).toEqual(BRIGHT_40)
  })

  it('is skipped while focus is in a text field, so native undo there is untouched', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    renderHook(() => usePhotoEditorShortcuts())
    pressKey('z', { metaKey: true })

    // Our undo never ran — history state is unchanged.
    expect(usePhotoEditorStore.getState().adjustments).toEqual(BRIGHT_40)
    document.body.removeChild(input)
  })

  it('still undoes with focus left on a range slider (PHOTO-007 regression) — a slider stays focused after a drag', () => {
    const range = document.createElement('input')
    range.type = 'range'
    document.body.appendChild(range)
    range.focus()

    renderHook(() => usePhotoEditorShortcuts())
    pressKey('z', { metaKey: true })

    expect(usePhotoEditorStore.getState().adjustments).toEqual(DEFAULT_ADJUSTMENTS)
    document.body.removeChild(range)
  })

  it('is still skipped with focus on the numeric spinbutton, so its native undo is untouched', () => {
    const number = document.createElement('input')
    number.type = 'number'
    document.body.appendChild(number)
    number.focus()

    renderHook(() => usePhotoEditorShortcuts())
    pressKey('z', { metaKey: true })

    expect(usePhotoEditorStore.getState().adjustments).toEqual(BRIGHT_40)
    document.body.removeChild(number)
  })
})

describe('usePhotoEditorShortcuts — deselect (PHOTO-011)', () => {
  it('Cmd/Ctrl+D deselects and beats the browser’s bookmark shortcut', () => {
    const selected = {
      ...DEFAULT_ADJUSTMENTS,
      selection: {
        ops: [{ kind: 'polygon' as const, mode: 'add' as const, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }],
        feather: 0,
        inverted: false,
      },
    }
    usePhotoEditorStore.setState({ adjustments: selected, historyStack: [selected], historyIndex: 0 })
    renderHook(() => usePhotoEditorShortcuts())
    const event = new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true, cancelable: true })
    document.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(usePhotoEditorStore.getState().adjustments.selection.ops).toHaveLength(0)
  })
})
