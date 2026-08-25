import { useEffect } from 'react'
import { usePhotoEditorStore } from '../store/usePhotoEditorStore'
import { isTypingTarget } from '../../lib/isTypingTarget'

/** Cmd/Ctrl+Z undo, Cmd/Ctrl+Shift+Z redo, for the adjustment history (PHOTO-005).
 *  A range/number AdjustmentSlider is an <input> too, and stays focused after a
 *  drag — treating every <input> as "typing" swallowed Cmd+Z right after using
 *  any of the five Adjustments controls (bug found manually testing PHOTO-007's
 *  new sliders; pre-existing since PHOTO-005, just far more likely to bite now
 *  that there are five focusable controls instead of two). isTypingTarget's own
 *  exclusion list is what fixes that.
 *  Skipped while focus is in a text field so native input undo still works there. */
export function usePhotoEditorShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod || (e.key !== 'z' && e.key !== 'Z') || isTypingTarget()) return
      e.preventDefault()
      if (e.shiftKey) usePhotoEditorStore.getState().redo()
      else usePhotoEditorStore.getState().undo()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])
}
