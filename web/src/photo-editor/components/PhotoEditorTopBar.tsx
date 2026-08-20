import { useState } from 'react'
import { Undo2, Redo2 } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { WorkspaceSwitcher } from '../../components/WorkspaceSwitcher'
import { useCanvasStore } from '../../editor/store/useCanvasStore'
import { usePhotoEditorStore } from '../store/usePhotoEditorStore'
import { flattenImage } from '../utils/flattenImage'

/**
 * Photo Editor's own top bar (PHOTO-001) — intentionally not a reuse of the
 * Canvas workspace's TopBar. The two workspaces share no toolbars per the
 * three-workspace model; WorkspaceSwitcher is the one nav control that's
 * meant to look identical from both sides (see its own doc comment).
 * PHOTO-005 added undo/redo for the adjustment history — disabled (and a
 * no-op) with no image loaded, since historyIndex starts and stays at 0.
 * PHOTO-006 added Save/Cancel: Save only shows for an Edit-from-Canvas
 * session (sourceRef set) — a direct upload (PHOTO-002) has nowhere on
 * Canvas to port back to. Cancel just clears the session and navigates
 * away; Canvas is never touched until Save explicitly flattens + ports back,
 * so it's a true no-op cancel by construction, not something to special-case.
 */
export function PhotoEditorTopBar() {
  const image = usePhotoEditorStore((s) => s.image)
  const sourceRef = usePhotoEditorStore((s) => s.sourceRef)
  const adjustments = usePhotoEditorStore((s) => s.adjustments)
  const historyIndex = usePhotoEditorStore((s) => s.historyIndex)
  const historyLength = usePhotoEditorStore((s) => s.historyStack.length)
  const undo = usePhotoEditorStore((s) => s.undo)
  const redo = usePhotoEditorStore((s) => s.redo)
  const setImage = usePhotoEditorStore((s) => s.setImage)
  const canUndo = historyIndex > 0
  const canRedo = historyIndex < historyLength - 1
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCancel = () => {
    setImage(null)
    navigate({ to: '/' })
  }

  const handleSave = async () => {
    if (!image || !sourceRef) return
    setSaving(true)
    setError(null)
    try {
      const flattened = await flattenImage(image, adjustments)
      const ok = useCanvasStore.getState().portBackFromPhotoEditor(sourceRef, flattened, adjustments)
      if (!ok) {
        setError("Couldn't find that image on Canvas anymore — it may have been deleted.")
        return
      }
      setImage(null)
      navigate({ to: '/' })
    } catch {
      setError('Something went wrong flattening the image — try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <header className="flex h-12 items-center gap-3 border-b border-editor bg-editor-bg px-3 text-editor-text">
      <span className="font-semibold tracking-tight">dotted</span>
      <WorkspaceSwitcher />

      {error && <span className="text-xs text-red-400">{error}</span>}

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

        {image && (
          <button
            onClick={handleCancel}
            className="ml-2 rounded-md px-3 py-1.5 text-sm font-medium text-editor-text-muted hover:bg-editor-surface"
          >
            Cancel
          </button>
        )}
        {image && sourceRef && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>
    </header>
  )
}
