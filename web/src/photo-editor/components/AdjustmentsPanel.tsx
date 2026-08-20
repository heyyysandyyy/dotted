import { CollapsibleSection } from '../../editor/components/CollapsibleSection'
import { usePhotoEditorStore } from '../store/usePhotoEditorStore'
import { AdjustmentSlider } from './AdjustmentSlider'

/** Brightness/contrast controls (PHOTO-004) — the only adjustments for v1. */
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
    </CollapsibleSection>
  )
}
