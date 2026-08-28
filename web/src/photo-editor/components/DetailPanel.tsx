import { CollapsibleSection } from '../../editor/components/CollapsibleSection'
import { usePhotoEditorStore, type NumericAdjustmentKey } from '../store/usePhotoEditorStore'
import { AdjustmentSlider } from './AdjustmentSlider'

/** A control's range, where it differs from the shared -100..100. Mirrors
 *  ADJUSTMENT_LIMITS in the store — the store is what enforces the range;
 *  this is what stops the slider offering values it would clamp away. */
type SliderSpec = { key: NumericAdjustmentKey; label: string; min?: number; neutral?: number }

/** Strength first, then the radius it works over — the order they're reached
 *  for: you decide how much sharpening you want before tuning how coarse it
 *  is. `sharpenRadius` rests at 50 rather than 0, so its reset button hides
 *  there instead of at the bottom of its travel. */
const SHARPEN: SliderSpec[] = [
  { key: 'sharpen', label: 'Amount', min: 0 },
  { key: 'sharpenRadius', label: 'Radius', min: 0, neutral: 50 },
]

const BLUR: SliderSpec[] = [
  { key: 'blur', label: 'Gaussian', min: 0 },
  { key: 'motionBlur', label: 'Motion', min: 0 },
  // Signed: it's a direction (±90° of streak), not a strength.
  { key: 'motionBlurAngle', label: 'Motion angle' },
]

const NOISE: SliderSpec[] = [
  { key: 'noiseReduction', label: 'Reduce noise', min: 0 },
  { key: 'grain', label: 'Add grain', min: 0 },
]

/**
 * PHOTO-008's sharpen, blur and noise tools — the first Photo Editor controls
 * that read a pixel's neighbours rather than mapping each one independently
 * (see spatialPass.ts). Follows PHOTO-004's slider + live preview +
 * per-control reset pattern like every panel before it, and sits below the
 * tonal and colour sections since it's the finishing pass on the image those
 * produce.
 *
 * Split into three sections for the same reason ColorPanel is: sharpening,
 * softening and grain are three separate intentions, and each collapses on
 * its own so the sidebar stays workable now that it holds every PHOTO-007
 * control too.
 */
export function DetailPanel() {
  const adjustments = usePhotoEditorStore((s) => s.adjustments)
  const setAdjustment = usePhotoEditorStore((s) => s.setAdjustment)
  const resetAdjustment = usePhotoEditorStore((s) => s.resetAdjustment)

  const sliders = (specs: SliderSpec[]) =>
    specs.map(({ key, label, min, neutral }) => (
      <AdjustmentSlider
        key={key}
        label={label}
        value={adjustments[key]}
        min={min}
        neutral={neutral}
        onChange={(v) => setAdjustment(key, v)}
        onReset={() => resetAdjustment(key)}
      />
    ))

  return (
    <>
      <CollapsibleSection title="Sharpen" storageKey="photo-sharpen" className="space-y-4 border-t border-editor p-4">
        {sliders(SHARPEN)}
      </CollapsibleSection>
      <CollapsibleSection title="Blur" storageKey="photo-blur" className="space-y-4 border-t border-editor p-4">
        {sliders(BLUR)}
      </CollapsibleSection>
      <CollapsibleSection title="Noise" storageKey="photo-noise" className="space-y-4 border-t border-editor p-4">
        {sliders(NOISE)}
      </CollapsibleSection>
    </>
  )
}
