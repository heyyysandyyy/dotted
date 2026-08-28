import { usePhotoEditorStore } from './store/usePhotoEditorStore'
import { PhotoEditorTopBar } from './components/PhotoEditorTopBar'
import { EmptyState } from './components/EmptyState'
import { AdjustmentsPanel } from './components/AdjustmentsPanel'
import { LevelsPanel } from './components/LevelsPanel'
import { CurvesPanel } from './components/CurvesPanel'
import { ColorPanel } from './components/ColorPanel'
import { DetailPanel } from './components/DetailPanel'
import { useDecodedImage } from './hooks/useDecodedImage'
import { useAdjustedPreviewCanvas } from './hooks/useAdjustedPreviewCanvas'
import { useHistogram } from './hooks/useHistogram'
import { usePhotoEditorShortcuts } from './hooks/usePhotoEditorShortcuts'

/**
 * Photo Editor workspace shell (PHOTO-001). A separate top-level workspace
 * from Canvas — its own route, its own top bar, no Canvas toolbars/panels
 * (layout, typography, crop/resize) rendered here at all. Renders the empty
 * state until an image is loaded; PHOTO-002 (direct upload) and PHOTO-003
 * (Edit-from-Canvas) populate usePhotoEditorStore's `image` field. The
 * preview is a <canvas> (not a plain <img>) since PHOTO-007's tone and
 * colour controls need real pixel passes on top of PHOTO-004's CSS-filter
 * brightness/contrast — see useAdjustedPreviewCanvas. The image is decoded
 * once here and shared with the histogram the Levels and Curves panels plot
 * (useDecodedImage), so the two never decode the same data URL twice. The
 * sidebar scrolls: with the colour, levels, curves and detail sections added
 * it can outgrow the viewport even though every section is collapsible.
 */
export function PhotoEditor() {
  const image = usePhotoEditorStore((s) => s.image)
  const adjustments = usePhotoEditorStore((s) => s.adjustments)
  const decoded = useDecodedImage(image)
  const canvasRef = useAdjustedPreviewCanvas(decoded, adjustments)
  const histogram = useHistogram(decoded, adjustments)
  usePhotoEditorShortcuts()

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-editor-shell">
      <PhotoEditorTopBar />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden p-6">
          {image ? (
            <canvas ref={canvasRef} className="mx-auto max-h-full max-w-full object-contain" />
          ) : (
            <EmptyState />
          )}
        </div>
        {image && (
          <aside className="w-64 shrink-0 overflow-y-auto border-l border-editor bg-editor-bg">
            <AdjustmentsPanel />
            <LevelsPanel histogram={histogram} />
            <CurvesPanel histogram={histogram} />
            <ColorPanel />
            <DetailPanel />
          </aside>
        )}
      </div>
    </div>
  )
}
