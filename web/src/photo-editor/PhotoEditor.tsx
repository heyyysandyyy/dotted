import { usePhotoEditorStore } from './store/usePhotoEditorStore'
import { PhotoEditorTopBar } from './components/PhotoEditorTopBar'
import { EmptyState } from './components/EmptyState'

/**
 * Photo Editor workspace shell (PHOTO-001). A separate top-level workspace
 * from Canvas — its own route, its own top bar, no Canvas toolbars/panels
 * (layout, typography, crop/resize) rendered here at all. Renders the empty
 * state until an image is loaded; PHOTO-002 (direct upload) and PHOTO-003
 * (Edit-from-Canvas) are what actually populate usePhotoEditorStore's
 * `image` field — this shell just reacts to it.
 */
export function PhotoEditor() {
  const image = usePhotoEditorStore((s) => s.image)

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-editor-shell">
      <PhotoEditorTopBar />
      <div className="flex-1 overflow-hidden p-6">
        {image ? (
          // PHOTO-004+ replaces this with the loaded image + adjustment panel.
          <img src={image} alt="" className="mx-auto max-h-full max-w-full object-contain" />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  )
}
