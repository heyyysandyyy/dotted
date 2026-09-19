import { CollapsibleSection } from '../../editor/components/CollapsibleSection'
import { selectActiveTone, usePhotoEditorStore, type NumericAdjustmentKey } from '../store/usePhotoEditorStore'
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
 *  tone-controls phase of PHOTO-007's tonal/color adjustment set. The rest
 *  of that set lives in its own panels: LevelsPanel and CurvesPanel (the
 *  histogram-backed controls) and ColorPanel (the colour half). */
export function AdjustmentsPanel() {
  // The active target's settings: the base image's, or the adjustment
  // layer being edited (PHOTO-011 phase 2).
  const adjustments = usePhotoEditorStore(selectActiveTone)
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
