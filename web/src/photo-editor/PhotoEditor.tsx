import { usePhotoEditorStore } from './store/usePhotoEditorStore'
import { PhotoEditorTopBar } from './components/PhotoEditorTopBar'
import { EmptyState } from './components/EmptyState'
import { AdjustmentsPanel } from './components/AdjustmentsPanel'
import { cssFilterFor } from './utils/adjustmentFilter'

/**
 * Photo Editor workspace shell (PHOTO-001). A separate top-level workspace
 * from Canvas — its own route, its own top bar, no Canvas toolbars/panels
 * (layout, typography, crop/resize) rendered here at all. Renders the empty
 * state until an image is loaded; PHOTO-002 (direct upload) and PHOTO-003
 * (Edit-from-Canvas) populate usePhotoEditorStore's `image` field, and
 * PHOTO-004 adds the adjustments panel + live CSS-filter preview once one is.
 */
export function PhotoEditor() {
  const image = usePhotoEditorStore((s) => s.image)
  const adjustments = usePhotoEditorStore((s) => s.adjustments)

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-editor-shell">
      <PhotoEditorTopBar />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden p-6">
          {image ? (
            <img
              src={image}
              alt=""
              style={{ filter: cssFilterFor(adjustments) }}
              className="mx-auto max-h-full max-w-full object-contain"
            />
          ) : (
            <EmptyState />
          )}
        </div>
        {image && (
          <aside className="w-64 shrink-0 border-l border-editor bg-editor-bg">
            <AdjustmentsPanel />
          </aside>
        )}
      </div>
    </div>
  )
}
