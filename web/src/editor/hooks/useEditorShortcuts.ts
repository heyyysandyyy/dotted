import { useEffect } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import { useHistoryStore } from '../store/useHistoryStore'
import { pickColor } from '../eyedropper'
import { ZOOM_STEP } from '../constants'

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

      // Undo / redo (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, Cmd/Ctrl+Y).
      const mod = e.metaKey || e.ctrlKey
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const editing = (active as any)?.isEditing
      if (mod && !editing && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        if (e.shiftKey) useHistoryStore.getState().redo()
        else useHistoryStore.getState().undo()
        return
      }
      if (mod && !editing && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault()
        useHistoryStore.getState().redo()
        return
      }

      // Resize canvas (Cmd/Ctrl+Shift+R) — checked before the rulers shortcut.
      if (mod && e.shiftKey && !editing && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault()
        window.dispatchEvent(new Event('dotted:resize-canvas'))
        return
      }

      // Toggle rulers (Cmd/Ctrl+R) — intercept so the browser doesn't reload.
      if (mod && !editing && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault()
        useCanvasStore.getState().toggleRulers()
        return
      }

      // Toggle guides visibility (Cmd/Ctrl+;).
      if (mod && !editing && e.key === ';') {
        e.preventDefault()
        useCanvasStore.getState().toggleGuides()
        return
      }

      // Toggle the grid overlay (Cmd/Ctrl+').
      if (mod && !editing && e.key === "'") {
        e.preventDefault()
        useCanvasStore.getState().toggleGrid()
        return
      }

      // Zoom (UX-013): Cmd/Ctrl +/- to step, 0 to reset to 100%, Shift+H to fit.
      // In stack view (BUG-003) these target stackZoom instead of the
      // single-page canvas's own zoom — kept separate so zooming in on
      // thumbnails doesn't also blow up the canvas to that scale the moment
      // a page is opened. Fit-to-view has no stack-view equivalent (no
      // single artboard to fit), so it's a no-op there.
      const inStack = useCanvasStore.getState().viewMode === 'stack'
      if (mod && e.shiftKey && !editing && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault()
        if (!inStack) useCanvasStore.getState().fitToView()
        return
      }
      if (mod && !editing && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        const { zoom, stackZoom, setZoom, setStackZoom } = useCanvasStore.getState()
        if (inStack) setStackZoom(stackZoom + ZOOM_STEP)
        else setZoom(zoom + ZOOM_STEP)
        return
      }
      if (mod && !editing && e.key === '-') {
        e.preventDefault()
        const { zoom, stackZoom, setZoom, setStackZoom } = useCanvasStore.getState()
        if (inStack) setStackZoom(stackZoom - ZOOM_STEP)
        else setZoom(zoom - ZOOM_STEP)
        return
      }
      if (mod && !editing && e.key === '0') {
        e.preventDefault()
        if (inStack) useCanvasStore.getState().setStackZoom(1)
        else useCanvasStore.getState().setZoom(1)
        return
      }

      // Group / ungroup (Cmd/Ctrl+G, Shift+Cmd/Ctrl+G) — UX-016.
      if (mod && !editing && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault()
        if (e.shiftKey) useCanvasStore.getState().ungroupSelection()
        else useCanvasStore.getState().groupSelection()
        return
      }

      // Copy / paste style (Cmd/Ctrl+Alt+C / V) — use e.code since Alt changes
      // e.key on some layouts (UX-007).
      if (mod && e.altKey && !editing && e.code === 'KeyC') {
        e.preventDefault()
        useCanvasStore.getState().copyStyle()
        return
      }
      if (mod && e.altKey && !editing && e.code === 'KeyV') {
        e.preventDefault()
        useCanvasStore.getState().pasteStyle()
        return
      }

      // Escape leaves format-painter mode (UX-007).
      if (e.key === 'Escape' && useCanvasStore.getState().painterMode !== 'off') {
        e.preventDefault()
        useCanvasStore.getState().exitPainter()
        return
      }

      // Never hijack keys while editing text or typing in a panel input.
      if (editing || isTypingTarget()) return

      // Eyedropper (I): sample a colour and apply it to the active object's fill.
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault()
        pickColor().then((hex) => {
          if (hex) useCanvasStore.getState().updateActive({ fill: hex })
        })
        return
      }

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
