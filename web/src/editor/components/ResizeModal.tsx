import { useState } from 'react'
import { SIZE_PRESETS, SIZE_UNITS, type UnitId } from '../constants'
import { useCanvasStore } from '../store/useCanvasStore'

interface Props {
  onClose: () => void
}

const pxPer = (unit: UnitId) => SIZE_UNITS.find((u) => u.id === unit)!.pxPer
const fmt = (px: number, unit: UnitId) =>
  unit === 'px' ? String(Math.round(px)) : (px / pxPer(unit)).toFixed(2)

/**
 * UX-014: resize the current artboard, optionally scaling content to fit.
 * Mounted only while open, so its state seeds from the current dimensions.
 */
export function ResizeModal({ onClose }: Props) {
  const width = useCanvasStore((s) => s.width)
  const height = useCanvasStore((s) => s.height)
  const canvas = useCanvasStore((s) => s.canvas)
  const resizeCanvas = useCanvasStore((s) => s.resizeCanvas)

  const [unit, setUnit] = useState<UnitId>('px')
  const [wStr, setWStr] = useState(() => String(width))
  const [hStr, setHStr] = useState(() => String(height))
  const [lock, setLock] = useState(false)
  const [scaleContent, setScaleContent] = useState(false)
  // Aspect ratio captured when the modal opened, for the lock.
  const [ratio] = useState(() => (height > 0 ? width / height : 1))

  const toPx = (s: string) => Math.max(1, Math.round((Number(s) || 0) * pxPer(unit)))
  const pxW = toPx(wStr)
  const pxH = toPx(hStr)

  const changeUnit = (next: UnitId) => {
    setWStr(fmt(pxW, next))
    setHStr(fmt(pxH, next))
    setUnit(next)
  }

  const onWidth = (s: string) => {
    setWStr(s)
    if (lock) setHStr(fmt(toPx(s) / ratio, unit))
  }
  const onHeight = (s: string) => {
    setHStr(s)
    if (lock) setWStr(fmt(toPx(s) * ratio, unit))
  }

  const pickPreset = (pw: number, ph: number) => {
    setUnit('px')
    setWStr(String(pw))
    setHStr(String(ph))
  }

  // Warn if objects would fall outside the new (smaller) bounds without scaling.
  const outOfBounds =
    !scaleContent &&
    !!canvas &&
    canvas.getObjects().some((o) => {
      const b = o.getBoundingRect()
      return b.left < 0 || b.top < 0 || b.left + b.width > pxW || b.top + b.height > pxH
    })

  const confirm = () => {
    resizeCanvas(pxW, pxH, scaleContent)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-[420px] rounded-xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-neutral-900">Resize canvas</h2>

        <div className="flex items-end gap-3">
          <label className="flex flex-col text-xs text-neutral-500">
            Width
            <input
              type="number"
              min={1}
              value={wStr}
              onChange={(e) => onWidth(e.target.value)}
              className="mt-1 w-24 rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-900"
            />
          </label>
          <span className="pb-2 text-neutral-400">×</span>
          <label className="flex flex-col text-xs text-neutral-500">
            Height
            <input
              type="number"
              min={1}
              value={hStr}
              onChange={(e) => onHeight(e.target.value)}
              className="mt-1 w-24 rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-900"
            />
          </label>
          <label className="flex flex-col text-xs text-neutral-500">
            Units
            <select
              value={unit}
              onChange={(e) => changeUnit(e.target.value as UnitId)}
              className="mt-1 rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-900"
            >
              {SIZE_UNITS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 space-y-2">
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} />
            Lock aspect ratio
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={scaleContent}
              onChange={(e) => setScaleContent(e.target.checked)}
            />
            Scale content to fit
          </label>
        </div>

        <div className="mt-4">
          <div className="mb-1 text-xs font-medium text-neutral-500">Presets</div>
          <div className="flex flex-wrap gap-1">
            {SIZE_PRESETS.filter((p) => p.category !== 'book').map((p) => (
              <button
                key={p.id}
                onClick={() => pickPreset(p.width, p.height)}
                className="rounded border border-neutral-200 px-2 py-1 text-xs text-neutral-700 hover:border-neutral-400"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {outOfBounds && (
          <p className="mt-3 text-xs text-amber-600">
            Some objects are outside the canvas bounds.
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:text-neutral-800"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Resize
          </button>
        </div>
      </div>
    </div>
  )
}
