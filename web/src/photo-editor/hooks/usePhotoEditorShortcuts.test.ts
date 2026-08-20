import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePhotoEditorShortcuts } from './usePhotoEditorShortcuts'
import { usePhotoEditorStore } from '../store/usePhotoEditorStore'

function pressKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }))
}

describe('usePhotoEditorShortcuts (PHOTO-005)', () => {
  beforeEach(() => {
    usePhotoEditorStore.setState({
      historyStack: [
        { brightness: 0, contrast: 0 },
        { brightness: 40, contrast: 0 },
      ],
      historyIndex: 1,
      adjustments: { brightness: 40, contrast: 0 },
    })
  })

  it('Cmd/Ctrl+Z undoes', () => {
    renderHook(() => usePhotoEditorShortcuts())
    pressKey('z', { metaKey: true })
    expect(usePhotoEditorStore.getState().adjustments).toEqual({ brightness: 0, contrast: 0 })
  })

  it('Cmd/Ctrl+Shift+Z redoes', () => {
    renderHook(() => usePhotoEditorShortcuts())
    pressKey('z', { metaKey: true }) // undo first
    pressKey('z', { metaKey: true, shiftKey: true }) // then redo
    expect(usePhotoEditorStore.getState().adjustments).toEqual({ brightness: 40, contrast: 0 })
  })

  it('does nothing without a modifier key', () => {
    renderHook(() => usePhotoEditorShortcuts())
    pressKey('z')
    expect(usePhotoEditorStore.getState().adjustments).toEqual({ brightness: 40, contrast: 0 })
  })

  it('is skipped while focus is in a text field, so native undo there is untouched', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    renderHook(() => usePhotoEditorShortcuts())
    pressKey('z', { metaKey: true })

    // Our undo never ran — history state is unchanged.
    expect(usePhotoEditorStore.getState().adjustments).toEqual({ brightness: 40, contrast: 0 })
    document.body.removeChild(input)
  })
})
