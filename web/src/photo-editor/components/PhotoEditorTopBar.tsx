import { Undo2, Redo2 } from 'lucide-react'
import { WorkspaceSwitcher } from '../../components/WorkspaceSwitcher'
import { usePhotoEditorStore } from '../store/usePhotoEditorStore'

/**
 * Photo Editor's own top bar (PHOTO-001) — intentionally not a reuse of the
 * Canvas workspace's TopBar. The two workspaces share no toolbars per the
 * three-workspace model; WorkspaceSwitcher is the one nav control that's
 * meant to look identical from both sides (see its own doc comment).
 * PHOTO-005 added undo/redo for the adjustment history — disabled (and a
 * no-op) with no image loaded, since historyIndex starts and stays at 0.
 */
export function PhotoEditorTopBar() {
  const historyIndex = usePhotoEditorStore((s) => s.historyIndex)
  const historyLength = usePhotoEditorStore((s) => s.historyStack.length)
  const undo = usePhotoEditorStore((s) => s.undo)
  const redo = usePhotoEditorStore((s) => s.redo)
  const canUndo = historyIndex > 0
  const canRedo = historyIndex < historyLength - 1

  return (
    <header className="flex h-12 items-center gap-3 border-b border-editor bg-editor-bg px-3 text-editor-text">
      <span className="font-semibold tracking-tight">dotted</span>
      <WorkspaceSwitcher />

      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Cmd/Ctrl+Z)"
          className="rounded-md p-1.5 hover:bg-editor-surface disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Undo2 size={16} />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Cmd/Ctrl+Shift+Z)"
          className="rounded-md p-1.5 hover:bg-editor-surface disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Redo2 size={16} />
        </button>
      </div>
    </header>
  )
}
