import { CollapsibleSection } from '../../editor/components/CollapsibleSection'
import { Histogram } from './Histogram'
import { AdjustmentSlider } from './AdjustmentSlider'
import { usePhotoEditorStore } from '../store/usePhotoEditorStore'
import { DEFAULT_LEVELS, LEVELS_LIMITS, type PhotoLevels } from '../utils/levelsCurves'
import type { Histogram as HistogramData } from '../utils/histogram'

/** Field/label pairs in display order. "Midtones" rather than "Gamma": it's
 *  the label every consumer photo editor uses for the same control, and the
 *  number beside it (1.00 neutral) says what it really is. */
const CONTROLS: { key: keyof PhotoLevels; label: string }[] = [
  { key: 'black', label: 'Black point' },
  { key: 'white', label: 'White point' },
  { key: 'gamma', label: 'Midtones' },
]

interface Props {
  histogram: HistogramData | null
}

/**
 * Input levels (PHOTO-007 levels/curves phase): the black point, the white
 * point and the midtone gamma between them, plotted over the live histogram
 * of the adjusted image so the two clipping points can be set against the
 * pixels they actually affect.
 *
 * Slider bounds come straight from LEVELS_LIMITS, the same constants the
 * store clamps with — these are the one set of controls not on the shared
 * -100..100 scale, since black/white are real input values and gamma is an
 * exponent.
 */
export function LevelsPanel({ histogram }: Props) {
  const levels = usePhotoEditorStore((s) => s.adjustments.levels)
  const setLevel = usePhotoEditorStore((s) => s.setLevel)
  const resetLevel = usePhotoEditorStore((s) => s.resetLevel)

  return (
    <CollapsibleSection title="Levels" storageKey="photo-levels" className="space-y-4 border-t border-editor p-4">
      <Histogram
        histogram={histogram}
        channel="rgb"
        black={levels.black}
        white={levels.white}
        className="h-16 w-full rounded border border-editor-strong bg-editor-surface"
      />
      {CONTROLS.map(({ key, label }) => (
        <AdjustmentSlider
          key={key}
          label={label}
          value={levels[key]}
          min={LEVELS_LIMITS[key].min}
          max={LEVELS_LIMITS[key].max}
          step={LEVELS_LIMITS[key].step}
          neutral={DEFAULT_LEVELS[key]}
          onChange={(v) => setLevel(key, v)}
          onReset={() => resetLevel(key)}
        />
      ))}
    </CollapsibleSection>
  )
}
