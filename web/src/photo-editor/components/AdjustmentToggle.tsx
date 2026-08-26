interface Props {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

/** An on/off adjustment (black & white conversion, invert) — the checkbox
 *  counterpart to AdjustmentSlider, for the PHOTO-007 colour controls that
 *  have no meaningful in-between value to drag. No reset button: unchecking
 *  it already is the reset. */
export function AdjustmentToggle({ label, checked, onChange }: Props) {
  return (
    <label className="flex cursor-pointer items-center justify-between text-xs text-editor-text-muted">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-indigo-500"
      />
    </label>
  )
}
