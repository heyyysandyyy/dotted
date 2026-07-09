import { useEffect, useState, type ReactNode } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'

/**
 * UX-007: right-click menu over the canvas with Copy/Paste style; UX-022
 * added Duplicate. Right-clicking selects the object under the cursor first
 * (handled in CanvasStage), so the actions operate on it.
 */
export function ContextMenu() {
  const selection = useCanvasStore((s) => s.selection)
  const clipboardStyle = useCanvasStore((s) => s.clipboardStyle)
  const copyStyle = useCanvasStore((s) => s.copyStyle)
  const pasteStyle = useCanvasStore((s) => s.pasteStyle)
  const duplicateActive = useCanvasStore((s) => s.duplicateActive)
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

  const item = (label: string, enabled: boolean, onClick: () => void): ReactNode => (
    <button
      disabled={!enabled}
      onClick={() => {
        onClick()
        setMenu(null)
      }}
      className="block w-full px-3 py-1.5 text-left text-sm text-neutral-200 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:text-neutral-600 disabled:hover:bg-transparent"
    >
      {label}
    </button>
  )

  return (
    <div
      className="fixed z-50 min-w-[160px] rounded-md border border-neutral-700 bg-neutral-800 py-1 shadow-xl"
      style={{ left: menu.x, top: menu.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {item('Duplicate', hasSelection, duplicateActive)}
      <hr className="my-1 border-neutral-700" />
      {item('Copy style', hasSelection, copyStyle)}
      {item('Paste style', canPaste, pasteStyle)}
    </div>
  )
}
