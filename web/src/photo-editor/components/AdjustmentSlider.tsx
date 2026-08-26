import { RotateCcw } from 'lucide-react'

interface Props {
  label: string
  value: number
  onChange: (v: number) => void
  onReset: () => void
  /** Range and granularity, defaulting to the whole-number -100..100 scale
   *  every tone and colour control shares. Levels' black/white points
   *  (0..255) and its gamma (0.1..3, fractional) are the exceptions —
   *  they're real image-space quantities, not a percentage of neutral. */
  min?: number
  max?: number
  step?: number
  /** The value that counts as untouched, i.e. the one the reset button
   *  hides at. Zero for every ±100 control; 0/255/1 for levels. */
  neutral?: number
}

/** Slider + numeric input, kept in sync, with a reset button that only shows
 *  once the value has actually moved off its default (PHOTO-004). */
export function AdjustmentSlider({
  label,
  value,
  onChange,
  onReset,
  min = -100,
  max = 100,
  step = 1,
  neutral = 0,
}: Props) {
  const commit = (v: number) => {
    if (!Number.isNaN(v)) onChange(Math.max(min, Math.min(max, v)))
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-editor-text-muted">
        <span>{label}</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => commit(Number(e.target.value))}
            className="w-14 rounded border border-editor-strong bg-editor-surface px-1.5 py-0.5 text-right text-editor-text-strong outline-none focus:border-editor-input"
          />
          {value !== neutral && (
            <button
              onClick={onReset}
              title={`Reset ${label.toLowerCase()}`}
              className="rounded p-1 text-editor-text-muted hover:bg-editor-surface hover:text-editor-text"
            >
              <RotateCcw size={12} />
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => commit(Number(e.target.value))}
        className="w-full accent-indigo-500"
      />
    </div>
  )
}
