import { useRef, useState } from 'react'
import { Pipette } from 'lucide-react'
import tinycolor from 'tinycolor2'
import { toColorString } from '../utils'
import { getRecentColors, addRecentColor } from '../storage'
import { pickColor } from '../eyedropper'

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

const HUE_GRADIENT =
  'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)'

interface Hsv {
  h: number
  s: number
  v: number
  a: number
}

/** Track a pointer drag over `el`, reporting the 0–1 fraction (x, y). */
function trackDrag(el: HTMLElement, onMove: (fx: number, fy: number) => void) {
  const rect = el.getBoundingClientRect()
  const to = (clientX: number, clientY: number) =>
    onMove(
      Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    )
  const move = (e: PointerEvent) => to(e.clientX, e.clientY)
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  return to
}

/** UX-012: the HSV picker body — gradient area, hue + alpha sliders, inputs,
 *  eyedropper, and recent colours. Mounted only while shown, seeded from value.
 *  Positionless so it embeds in a popover or a fill/stroke switcher. */
export function ColorPickerBody({
  value,
  onChange,
  onClose,
}: Omit<Props, 'label'> & { onClose: () => void }) {
  const [hsv, setHsv] = useState<Hsv>(() => tinycolor(value || '#000000').toHsv())
  const [recent] = useState(() => getRecentColors())
  const squareRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)
  const alphaRef = useRef<HTMLDivElement>(null)

  const opaque = tinycolor({ h: hsv.h, s: hsv.s, v: hsv.v })
  const hex = opaque.toHexString()
  const rgb = opaque.toRgb()
  const alphaPct = Math.round(hsv.a * 100)

  // Push a change out as hex (opaque) or rgba (translucent), tracking recents.
  const emit = (next: Hsv) => {
    setHsv(next)
    const h = tinycolor({ h: next.h, s: next.s, v: next.v }).toHexString()
    onChange(toColorString(h, Math.round(next.a * 100)))
  }
  const fromColor = (c: string) => {
    const t = tinycolor(c)
    if (t.isValid()) emit(t.toHsv())
  }

  return (
    <div className="w-full">
      {/* Saturation / value area. */}
      <div
        ref={squareRef}
        onPointerDown={(e) => {
          const to = trackDrag(e.currentTarget, (fx, fy) => emit({ ...hsv, s: fx, v: 1 - fy }))
          to(e.clientX, e.clientY)
        }}
        className="relative h-32 w-full cursor-crosshair rounded"
        style={{
          backgroundColor: `hsl(${hsv.h}, 100%, 50%)`,
          backgroundImage:
            'linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)',
        }}
      >
        <div
          className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
        />
      </div>

      {/* Hue slider + eyedropper. */}
      <div className="mt-3 flex items-center gap-2">
        <div
          ref={hueRef}
          onPointerDown={(e) => {
            const to = trackDrag(e.currentTarget, (fx) => emit({ ...hsv, h: fx * 360 }))
            to(e.clientX, e.clientY)
          }}
          className="relative h-3 flex-1 cursor-pointer rounded-full"
          style={{ backgroundImage: HUE_GRADIENT }}
        >
          <div
            className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
            style={{ left: `${(hsv.h / 360) * 100}%` }}
          />
        </div>
        <button
          type="button"
          onClick={() => pickColor().then((c) => c && fromColor(c))}
          title="Pick a colour from the canvas (I)"
          className="flex h-6 w-6 items-center justify-center rounded border border-neutral-700 text-neutral-300 hover:text-white"
        >
          <Pipette size={13} />
        </button>
      </div>

      {/* Alpha slider. */}
      <div
        ref={alphaRef}
        onPointerDown={(e) => {
          const to = trackDrag(e.currentTarget, (fx) => emit({ ...hsv, a: fx }))
          to(e.clientX, e.clientY)
        }}
        className="relative mt-3 h-3 w-full cursor-pointer overflow-hidden rounded-full"
        style={CHECKER}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{ backgroundImage: `linear-gradient(to right, transparent, ${hex})` }}
        />
        <div
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{ left: `${hsv.a * 100}%` }}
        />
      </div>

      {/* HEX / RGB / A inputs. */}
      <div className="mt-3 grid grid-cols-5 gap-1 text-[10px] text-neutral-400">
        <label className="col-span-2 flex flex-col">
          <input
            value={hex.replace('#', '').toUpperCase()}
            onChange={(e) => fromColor('#' + e.target.value)}
            className="rounded border border-neutral-700 bg-neutral-800 px-1 py-1 text-center font-mono text-[11px] text-neutral-100"
          />
          <span className="mt-0.5 text-center">HEX</span>
        </label>
        {(['r', 'g', 'b'] as const).map((ch) => (
          <label key={ch} className="flex flex-col">
            <input
              type="number"
              min={0}
              max={255}
              value={rgb[ch]}
              onChange={(e) => {
                const n = Math.min(255, Math.max(0, Number(e.target.value) || 0))
                fromColor(tinycolor({ ...rgb, [ch]: n }).toHexString())
              }}
              className="w-full rounded border border-neutral-700 bg-neutral-800 px-1 py-1 text-center text-[11px] text-neutral-100"
            />
            <span className="mt-0.5 text-center uppercase">{ch}</span>
          </label>
        ))}
      </div>
      <label className="mt-1 flex items-center justify-between text-[10px] text-neutral-400">
        <span>A%</span>
        <input
          type="number"
          min={0}
          max={100}
          value={alphaPct}
          onChange={(e) => emit({ ...hsv, a: Math.min(100, Math.max(0, Number(e.target.value) || 0)) / 100 })}
          className="w-14 rounded border border-neutral-700 bg-neutral-800 px-1 py-1 text-center text-[11px] text-neutral-100"
        />
      </label>

      {/* Recent colours. */}
      {recent.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[10px] text-neutral-500">Recent</div>
          <div className="grid grid-cols-8 gap-1">
            {recent.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => fromColor(c)}
                title={c}
                className="h-4 w-4 overflow-hidden rounded border border-neutral-700"
                style={CHECKER}
              >
                <span className="block h-full w-full" style={{ backgroundColor: c }} />
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          addRecentColor(toColorString(hex, alphaPct))
          onClose()
        }}
        className="mt-3 w-full rounded bg-neutral-800 py-1 text-xs text-neutral-200 hover:bg-neutral-700"
      >
        Done
      </button>
    </div>
  )
}

/**
 * Colour control (UX-012): a swatch that opens the HSV picker popover. Output is
 * a hex string when fully opaque and an rgba() string otherwise, so it drops
 * into Fabric fills, strokes, and the canvas background unchanged.
 */
export function ColorField({ label, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const color = tinycolor(value || '#000000')

  return (
    <div className="relative flex items-center justify-between text-xs text-neutral-400">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={color.toRgbString()}
        className="h-6 w-10 overflow-hidden rounded border border-neutral-700"
        style={CHECKER}
      >
        <span className="block h-full w-full" style={{ backgroundColor: color.toRgbString() }} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-7 z-20 w-56 rounded-lg border border-neutral-700 bg-neutral-900 p-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <ColorPickerBody value={value} onChange={onChange} onClose={() => setOpen(false)} />
          </div>
        </>
      )}
    </div>
  )
}
