import { useState } from 'react'
import { SIZE_PRESETS } from '../constants'
import { useCanvasStore } from '../store/useCanvasStore'

interface Props {
  open: boolean
  onClose: () => void
}

export function NewDesignModal({ open, onClose }: Props) {
  const newDesign = useCanvasStore((s) => s.newDesign)
  const [customW, setCustomW] = useState(1080)
  const [customH, setCustomH] = useState(1080)

  if (!open) return null

  const choose = (w: number, h: number) => {
    newDesign(w, h)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-[480px] rounded-xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-neutral-900">New design</h2>

        <div className="grid grid-cols-3 gap-3">
          {SIZE_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => choose(p.width, p.height)}
              className="flex flex-col items-center gap-2 rounded-lg border border-neutral-200 p-3 text-center transition hover:border-neutral-900 hover:bg-neutral-50"
            >
              <div className="flex h-16 w-16 items-center justify-center">
                <div
                  className="bg-neutral-200"
                  style={{
                    width: p.width >= p.height ? 48 : (48 * p.width) / p.height,
                    height: p.height >= p.width ? 48 : (48 * p.height) / p.width,
                  }}
                />
              </div>
              <div className="text-sm font-medium text-neutral-800">{p.label}</div>
              <div className="text-xs text-neutral-500">
                {p.width} × {p.height}
              </div>
            </button>
          ))}
        </div>

        <div className="mt-5 rounded-lg border border-neutral-200 p-3">
          <div className="mb-2 text-sm font-medium text-neutral-800">Custom size</div>
          <div className="flex items-end gap-3">
            <label className="flex flex-col text-xs text-neutral-500">
              Width
              <input
                type="number"
                min={1}
                value={customW}
                onChange={(e) => setCustomW(Math.max(1, Number(e.target.value)))}
                className="mt-1 w-24 rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-900"
              />
            </label>
            <span className="pb-2 text-neutral-400">×</span>
            <label className="flex flex-col text-xs text-neutral-500">
              Height
              <input
                type="number"
                min={1}
                value={customH}
                onChange={(e) => setCustomH(Math.max(1, Number(e.target.value)))}
                className="mt-1 w-24 rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-900"
              />
            </label>
            <button
              onClick={() => choose(customW, customH)}
              className="ml-auto rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
            >
              Create
            </button>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:text-neutral-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
