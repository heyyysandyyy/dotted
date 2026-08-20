import { useEffect } from 'react'
import { usePhotoEditorStore } from '../store/usePhotoEditorStore'

function isTypingTarget(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable
}

/** Cmd/Ctrl+Z undo, Cmd/Ctrl+Shift+Z redo, for the adjustment history (PHOTO-005).
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
