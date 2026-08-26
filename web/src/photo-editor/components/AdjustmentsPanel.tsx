import { CollapsibleSection } from '../../editor/components/CollapsibleSection'
import { usePhotoEditorStore, type NumericAdjustmentKey } from '../store/usePhotoEditorStore'
import { AdjustmentSlider } from './AdjustmentSlider'

/** Field/label pairs, in display order — the single place a further tonal
 *  control gets added, instead of another copy-pasted block. Colour controls
 *  live in their own sections (ColorPanel). */
const CONTROLS: { key: NumericAdjustmentKey; label: string }[] = [
  { key: 'brightness', label: 'Brightness' },
  { key: 'contrast', label: 'Contrast' },
  { key: 'exposure', label: 'Exposure' },
  { key: 'highlights', label: 'Highlights' },
  { key: 'shadows', label: 'Shadows' },
]

/** Brightness/contrast (PHOTO-004) plus exposure/highlights/shadows — the
 *  tone-controls phase of PHOTO-007's tonal/color adjustment set. The colour
 *  half of that set is ColorPanel; levels and curves (a histogram +
 *  point-based UI, not a slider) are a separate, follow-up phase. */
export function AdjustmentsPanel() {
  const adjustments = usePhotoEditorStore((s) => s.adjustments)
  const setAdjustment = usePhotoEditorStore((s) => s.setAdjustment)
  const resetAdjustment = usePhotoEditorStore((s) => s.resetAdjustment)

  return (
    <CollapsibleSection title="Adjustments" storageKey="photo-adjustments" className="space-y-4 p-4">
      {CONTROLS.map(({ key, label }) => (
        <AdjustmentSlider
          key={key}
          label={label}
          value={adjustments[key]}
          onChange={(v) => setAdjustment(key, v)}
          onReset={() => resetAdjustment(key)}
        />
      ))}
    </CollapsibleSection>
  )
}
