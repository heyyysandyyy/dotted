import { CollapsibleSection } from '../../editor/components/CollapsibleSection'
import { usePhotoEditorStore } from '../store/usePhotoEditorStore'
import { AdjustmentSlider } from './AdjustmentSlider'

/** Brightness/contrast (PHOTO-004) plus exposure/highlights/shadows — the
 *  tone-controls phase of PHOTO-007's tonal/color adjustment set. Levels and
 *  curves (a histogram + point-based UI, not a slider) are a separate,
 *  follow-up phase. */
export function AdjustmentsPanel() {
  const adjustments = usePhotoEditorStore((s) => s.adjustments)
  const setAdjustment = usePhotoEditorStore((s) => s.setAdjustment)
  const resetAdjustment = usePhotoEditorStore((s) => s.resetAdjustment)

  return (
    <CollapsibleSection title="Adjustments" storageKey="photo-adjustments" className="space-y-4 p-4">
      <AdjustmentSlider
        label="Brightness"
        value={adjustments.brightness}
        onChange={(v) => setAdjustment('brightness', v)}
        onReset={() => resetAdjustment('brightness')}
      />
      <AdjustmentSlider
        label="Contrast"
        value={adjustments.contrast}
        onChange={(v) => setAdjustment('contrast', v)}
        onReset={() => resetAdjustment('contrast')}
      />
      <AdjustmentSlider
        label="Exposure"
        value={adjustments.exposure}
        onChange={(v) => setAdjustment('exposure', v)}
        onReset={() => resetAdjustment('exposure')}
      />
      <AdjustmentSlider
        label="Highlights"
        value={adjustments.highlights}
        onChange={(v) => setAdjustment('highlights', v)}
        onReset={() => resetAdjustment('highlights')}
      />
      <AdjustmentSlider
        label="Shadows"
        value={adjustments.shadows}
        onChange={(v) => setAdjustment('shadows', v)}
        onReset={() => resetAdjustment('shadows')}
      />
    </CollapsibleSection>
  )
}
