import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useCanvasStore } from '../store/useCanvasStore'
import { usePhotoEditorStore } from '../../photo-editor/store/usePhotoEditorStore'
import { isImage } from '../utils'
import { buildPhotoEditorHandoff } from '../photoEditorHandoff'

/**
 * UX-007: right-click menu over the canvas with Copy/Paste style; UX-022
 * added Duplicate; UX-023 added the z-order actions; PHOTO-003 added Edit in
 * Photo Editor. Right-clicking selects the object under the cursor first
 * (handled in CanvasStage), so the actions operate on it.
 */
export function ContextMenu() {
  const selection = useCanvasStore((s) => s.selection)
  const clipboardStyle = useCanvasStore((s) => s.clipboardStyle)
  const copyStyle = useCanvasStore((s) => s.copyStyle)
  const pasteStyle = useCanvasStore((s) => s.pasteStyle)
  const duplicateActive = useCanvasStore((s) => s.duplicateActive)
  const bringToFront = useCanvasStore((s) => s.bringToFront)
  const sendToBack = useCanvasStore((s) => s.sendToBack)
  const bringForward = useCanvasStore((s) => s.bringForward)
  const sendBackward = useCanvasStore((s) => s.sendBackward)
  const openFromCanvas = usePhotoEditorStore((s) => s.openFromCanvas)
  const navigate = useNavigate()
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null
      if (!el?.closest('.canvas-container')) return // only over the fabric canvas
      e.preventDefault()
      setMenu({ x: e.clientX, y: e.clientY })
    }
    const onClose = () => setMenu(null)
    document.addEventListener('contextmenu', onCtx)
    document.addEventListener('click', onClose)
    document.addEventListener('scroll', onClose, true)
    return () => {
      document.removeEventListener('contextmenu', onCtx)
      document.removeEventListener('click', onClose)
      document.removeEventListener('scroll', onClose, true)
    }
  }, [])

  if (!menu) return null
  const hasSelection = selection.length > 0
  const canPaste = hasSelection && !!clipboardStyle
  const singleObj = selection.length === 1 ? selection[0] : null
  const canEditInPhotoEditor = isImage(singleObj)

  // PHOTO-003: pass the image + enough of its Canvas placement (page,
  // position, size, z-order) for PHOTO-006 to find and replace this same
  // object later — captured now because it's only readable while Canvas is
  // mounted, not after navigating away.
  const editInPhotoEditor = () => {
    const { canvas, activePageId } = useCanvasStore.getState()
    if (!canvas || !singleObj) return
    const handoff = buildPhotoEditorHandoff(canvas, singleObj, activePageId)
    if (!handoff) return
    openFromCanvas(handoff.image, handoff.sourceRef)
    navigate({ to: '/photo-editor' })
  }

  const item = (label: string, enabled: boolean, onClick: () => void): ReactNode => (
    <button
      disabled={!enabled}
      onClick={() => {
        onClick()
        setMenu(null)
      }}
      className="block w-full px-3 py-1.5 text-left text-sm text-editor-text hover:bg-editor-surface-2 disabled:cursor-not-allowed disabled:text-editor-text-subtle disabled:hover:bg-transparent"
    >
      {label}
    </button>
  )

  return (
    <div
      className="fixed z-50 min-w-[160px] rounded-md border border-editor-strong bg-editor-surface py-1 shadow-xl"
      style={{ left: menu.x, top: menu.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {item('Duplicate', hasSelection, duplicateActive)}
      <hr className="my-1 border-editor-strong" />
      {item('Bring to front', hasSelection, bringToFront)}
      {item('Bring forward', hasSelection, bringForward)}
      {item('Send backward', hasSelection, sendBackward)}
      {item('Send to back', hasSelection, sendToBack)}
      <hr className="my-1 border-editor-strong" />
      {item('Copy style', hasSelection, copyStyle)}
      {item('Paste style', canPaste, pasteStyle)}
      {canEditInPhotoEditor && <hr className="my-1 border-editor-strong" />}
      {canEditInPhotoEditor && item('Edit in Photo Editor', true, editInPhotoEditor)}
    </div>
  )
}
