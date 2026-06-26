import { useEffect } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'

function isTypingTarget(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable
}

/** Global editor keyboard shortcuts: arrow-key nudging and delete. */
export function useEditorShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const { canvas, nudge, deleteActive } = useCanvasStore.getState()
      if (!canvas) return
      const active = canvas.getActiveObject()

      // Never hijack keys while editing text or typing in a panel input.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((active as any)?.isEditing || isTypingTarget()) return

      const step = e.shiftKey ? 10 : 1
      switch (e.key) {
        case 'ArrowLeft':
          if (!active) return
          e.preventDefault()
          nudge(-step, 0)
          break
        case 'ArrowRight':
          if (!active) return
          e.preventDefault()
          nudge(step, 0)
          break
        case 'ArrowUp':
          if (!active) return
          e.preventDefault()
          nudge(0, -step)
          break
        case 'ArrowDown':
          if (!active) return
          e.preventDefault()
          nudge(0, step)
          break
        case 'Delete':
        case 'Backspace':
          if (!active) return
          e.preventDefault()
          deleteActive()
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
