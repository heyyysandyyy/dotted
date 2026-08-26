import { CollapsibleSection } from '../../editor/components/CollapsibleSection'
import { usePhotoEditorStore, type NumericAdjustmentKey, type ToggleAdjustmentKey } from '../store/usePhotoEditorStore'
import { AdjustmentSlider } from './AdjustmentSlider'
import { AdjustmentToggle } from './AdjustmentToggle'

type SliderSpec = { key: NumericAdjustmentKey; label: string }

/** Split into three sections rather than one long list: they're three
 *  different mental models (grade the colour that's there / correct the
 *  light it was shot under / push individual channels), and each collapses
 *  independently so the sidebar stays workable with the tone controls above
 *  it. */
const COLOR: SliderSpec[] = [
  { key: 'saturation', label: 'Saturation' },
  { key: 'vibrance', label: 'Vibrance' },
  { key: 'hue', label: 'Hue shift' },
]

const WHITE_BALANCE: SliderSpec[] = [
  { key: 'temperature', label: 'Temperature' },
  { key: 'tint', label: 'Tint' },
]

const COLOR_BALANCE: SliderSpec[] = [
  { key: 'redBalance', label: 'Red' },
  { key: 'greenBalance', label: 'Green' },
  { key: 'blueBalance', label: 'Blue' },
]

const TOGGLES: { key: ToggleAdjustmentKey; label: string }[] = [
  { key: 'blackAndWhite', label: 'Black & white' },
  { key: 'invert', label: 'Invert' },
]

/** The colour-controls phase of PHOTO-007 — saturation/vibrance, hue shift,
 *  white balance, colour balance, black & white conversion and invert, all
 *  following PHOTO-004's slider + live preview + per-control reset pattern.
 *  Sits below AdjustmentsPanel's tonal controls and the histogram-backed
 *  Levels and Curves sections. */
export function ColorPanel() {
  const adjustments = usePhotoEditorStore((s) => s.adjustments)
  const setAdjustment = usePhotoEditorStore((s) => s.setAdjustment)
  const setToggle = usePhotoEditorStore((s) => s.setToggle)
  const resetAdjustment = usePhotoEditorStore((s) => s.resetAdjustment)

  const sliders = (specs: SliderSpec[]) =>
    specs.map(({ key, label }) => (
      <AdjustmentSlider
        key={key}
        label={label}
        value={adjustments[key]}
        onChange={(v) => setAdjustment(key, v)}
        onReset={() => resetAdjustment(key)}
      />
    ))

  return (
    <>
      <CollapsibleSection title="Color" storageKey="photo-color" className="space-y-4 border-t border-editor p-4">
        {sliders(COLOR)}
        {TOGGLES.map(({ key, label }) => (
          <AdjustmentToggle key={key} label={label} checked={adjustments[key]} onChange={(v) => setToggle(key, v)} />
        ))}
      </CollapsibleSection>

      <CollapsibleSection
        title="White balance"
        storageKey="photo-white-balance"
        className="space-y-4 border-t border-editor p-4"
      >
        {sliders(WHITE_BALANCE)}
      </CollapsibleSection>

      <CollapsibleSection
        title="Color balance"
        storageKey="photo-color-balance"
        className="space-y-4 border-t border-editor p-4"
      >
        {sliders(COLOR_BALANCE)}
      </CollapsibleSection>
    </>
  )
}
