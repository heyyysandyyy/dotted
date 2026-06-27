import { useState } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import { exportPNG, exportJPEG, DEFAULT_JPEG_QUALITY } from '../exporters'

interface Props {
  open: boolean
  onClose: () => void
}

type Format = 'png' | 'jpeg'

export function ExportModal({ open, onClose }: Props) {
  const canvas = useCanvasStore((s) => s.canvas)
  const designName = useCanvasStore((s) => s.designName)
  const [format, setFormat] = useState<Format>('png')
  const [scale, setScale] = useState(1)
  const [quality, setQuality] = useState(DEFAULT_JPEG_QUALITY)

  if (!open) return null

  const doExport = () => {
    if (!canvas) return
    if (format === 'png') exportPNG(canvas, designName, scale)
    else if (format === 'jpeg') exportJPEG(canvas, designName, scale, quality)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-[420px] rounded-xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-neutral-900">Export</h2>

        <div className="mb-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Format
          </div>
          <div className="flex gap-2">
            {(['png', 'jpeg'] as Format[]).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`rounded-md border px-3 py-1.5 text-sm font-medium uppercase ${
                  format === f
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-300 text-neutral-700 hover:border-neutral-500'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {format === 'jpeg' && (
          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-neutral-500">
              <span>Quality</span>
              <span className="text-neutral-700">{Math.round(quality * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.01}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              className="w-full accent-neutral-900"
            />
          </div>
        )}

        <div className="mb-5">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Scale
          </div>
          <div className="flex gap-2">
            {[1, 2, 3].map((s) => (
              <button
                key={s}
                onClick={() => setScale(s)}
                className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                  scale === s
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-300 text-neutral-700 hover:border-neutral-500'
                }`}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-2 text-sm text-neutral-500 hover:text-neutral-800"
          >
            Cancel
          </button>
          <button
            onClick={doExport}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Download
          </button>
        </div>
      </div>
    </div>
  )
}
