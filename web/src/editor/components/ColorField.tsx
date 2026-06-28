import { useState } from 'react'
import tinycolor from 'tinycolor2'
import { toColorString } from '../utils'

interface Props {
  label: string
  /** Current colour — any CSS colour string (hex or rgba). */
  value: string
  /** Emits a hex string when fully opaque, otherwise an rgba() string. */
  onChange: (color: string) => void
}

// Small checkerboard so a translucent swatch reads as translucent.
const CHECKER: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg, #bbb 25%, transparent 25%), linear-gradient(-45deg, #bbb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #bbb 75%), linear-gradient(-45deg, transparent 75%, #bbb 75%)',
  backgroundSize: '8px 8px',
  backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0',
  backgroundColor: '#fff',
}

/**
 * Colour control with an opacity slider (CLR-002). The native colour input
 * supplies the hue/RGB; the slider supplies alpha. Output is a hex string when
 * fully opaque and an rgba() string otherwise, so it drops into Fabric fills,
 * strokes, and the canvas background unchanged.
 */
export function ColorField({ label, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const color = tinycolor(value || '#000000')
  const hex = color.toHexString()
  const alphaPct = Math.round(color.getAlpha() * 100)

  const emit = (nextHex: string, nextAlphaPct: number) => {
    onChange(toColorString(nextHex, nextAlphaPct))
  }

  return (
    <div className="relative flex items-center justify-between text-xs text-neutral-400">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={`${hex} · ${alphaPct}%`}
        className="h-6 w-10 overflow-hidden rounded border border-neutral-700"
        style={CHECKER}
      >
        <span className="block h-full w-full" style={{ backgroundColor: color.toRgbString() }} />
      </button>

      {open && (
        <>
          {/* Click-away backdrop. */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-7 z-20 w-44 rounded-md border border-neutral-700 bg-neutral-900 p-2 shadow-xl">
            <input
              type="color"
              value={hex}
              onChange={(e) => emit(e.target.value, alphaPct)}
              className="h-8 w-full cursor-pointer rounded border border-neutral-700 bg-neutral-800"
            />
            <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-400">
              <span>Opacity</span>
              <span>{alphaPct}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={alphaPct}
              onChange={(e) => emit(hex, Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
          </div>
        </>
      )}
    </div>
  )
}
