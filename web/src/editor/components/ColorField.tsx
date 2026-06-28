import { useState } from 'react'
import { Plus } from 'lucide-react'
import tinycolor from 'tinycolor2'
import { toColorString } from '../utils'
import { getPalette, addPaletteColor, removePaletteColor } from '../storage'

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
  // Bump to re-read the saved palette after add/remove.
  const [, refreshPalette] = useState(0)
  const color = tinycolor(value || '#000000')
  const hex = color.toHexString()
  const alphaPct = Math.round(color.getAlpha() * 100)
  const current = toColorString(hex, alphaPct)
  const palette = open ? getPalette() : []

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

            {/* Custom palette (CLR-003) — shared across projects. */}
            <div className="mt-3 flex items-center justify-between text-[11px] text-neutral-400">
              <span>Palette</span>
              <button
                type="button"
                onClick={() => {
                  addPaletteColor(current)
                  refreshPalette((n) => n + 1)
                }}
                title="Save current colour"
                className="flex items-center gap-0.5 text-neutral-300 hover:text-white"
              >
                <Plus size={12} />
                Save
              </button>
            </div>
            {palette.length === 0 ? (
              <p className="mt-1 text-[11px] text-neutral-600">No saved colours yet</p>
            ) : (
              <div className="mt-1 grid grid-cols-8 gap-1">
                {palette.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onChange(c)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      removePaletteColor(c)
                      refreshPalette((n) => n + 1)
                    }}
                    title={`${c} — click to apply, right-click to remove`}
                    className="h-4 w-4 overflow-hidden rounded border border-neutral-700"
                    style={CHECKER}
                  >
                    <span className="block h-full w-full" style={{ backgroundColor: c }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
