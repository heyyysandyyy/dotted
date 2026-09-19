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
import { GeometryPanel } from './components/GeometryPanel'
import { PhotoStage } from './components/PhotoStage'
import { planGeometry } from './utils/geometry'

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
 *
 * PHOTO-009's geometry tools head the sidebar, and PhotoStage lays the
 * preview out from the geometry plan so the crop box can sit exactly over
 * it. Two plans: the finished one (what Save produces, and the size the
 * resize fields show) and, while the crop tool is open, the uncropped frame
 * the preview shows instead.
 */
export function PhotoEditor() {
  const image = usePhotoEditorStore((s) => s.image)
  const adjustments = usePhotoEditorStore((s) => s.adjustments)
  const cropMode = usePhotoEditorStore((s) => s.cropMode)
  const cropAspect = usePhotoEditorStore((s) => s.cropAspect)
  const setGeometry = usePhotoEditorStore((s) => s.setGeometry)
  const decoded = useDecodedImage(image)
  const canvasRef = useAdjustedPreviewCanvas(decoded, adjustments, cropMode)
  const histogram = useHistogram(decoded, adjustments)
  usePhotoEditorShortcuts()
  const plan = decoded ? planGeometry(adjustments.geometry, decoded.naturalWidth, decoded.naturalHeight) : null
  const stagePlan =
    decoded && cropMode
      ? planGeometry(adjustments.geometry, decoded.naturalWidth, decoded.naturalHeight, { cropEditing: true })
      : plan

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-editor-shell">
      <PhotoEditorTopBar />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden p-6">
          {!image ? (
            <EmptyState />
          ) : stagePlan ? (
            <PhotoStage
              canvasRef={canvasRef}
              plan={stagePlan}
              cropMode={cropMode}
              crop={adjustments.geometry.crop}
              cropAspect={cropAspect}
              onCropChange={(crop) => setGeometry({ crop })}
            />
          ) : null}
        </div>
        {image && (
          <aside className="w-64 shrink-0 overflow-y-auto border-l border-editor bg-editor-bg">
            {plan && <GeometryPanel plan={plan} />}
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
