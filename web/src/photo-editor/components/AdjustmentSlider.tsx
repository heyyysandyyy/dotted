import { RotateCcw } from 'lucide-react'

interface Props {
  label: string
  value: number
  onChange: (v: number) => void
  onReset: () => void
}

/** Slider + numeric input, kept in sync, with a reset button that only shows
 *  once the value has actually moved off its default (PHOTO-004). */
export function AdjustmentSlider({ label, value, onChange, onReset }: Props) {
  const commit = (v: number) => {
    if (!Number.isNaN(v)) onChange(Math.max(-100, Math.min(100, v)))
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-editor-text-muted">
        <span>{label}</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={-100}
            max={100}
            value={value}
            onChange={(e) => commit(Number(e.target.value))}
            className="w-14 rounded border border-editor-strong bg-editor-surface px-1.5 py-0.5 text-right text-editor-text-strong outline-none focus:border-editor-input"
          />
          {value !== 0 && (
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
        min={-100}
        max={100}
        step={1}
        value={value}
        onChange={(e) => commit(Number(e.target.value))}
        className="w-full accent-indigo-500"
      />
    </div>
  )
}
