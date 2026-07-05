import { useState } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import { exportPNG, exportJPEG, exportPDF, exportSVG, DEFAULT_JPEG_QUALITY } from '../exporters'
import { Modal } from './Modal'

interface Props {
  open: boolean
  onClose: () => void
}

type Format = 'png' | 'jpeg' | 'pdf' | 'svg'

/** Book projects use PrintExportModal.tsx instead (BOOK-004) — this modal is
 *  reached only when isBookProject(pages) is false (see Editor.tsx). */
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
    // PDF export is async (jsPDF is lazy-loaded); surface load/render failures
    // instead of leaving an unhandled rejection.
    else if (format === 'pdf') {
      exportPDF(canvas, designName, scale).catch((err: unknown) => {
        console.error('PDF export failed', err)
      })
    }
    else if (format === 'svg') exportSVG(canvas, designName)
    onClose()
  }

  const chip = (active: boolean) =>
    `rounded-md border px-3 py-1.5 text-sm font-medium ${
      active
        ? 'border-indigo-500 bg-indigo-600 text-white'
        : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'
    }`

  return (
    <Modal title="Export" widthClass="w-[420px]" onClose={onClose}>
      <div className="mb-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">Format</div>
        <div className="flex gap-2">
          {(['png', 'jpeg', 'pdf', 'svg'] as Format[]).map((f) => (
            <button key={f} onClick={() => setFormat(f)} className={`${chip(format === f)} uppercase`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {format === 'jpeg' && (
        <div className="mb-5">
          <div className="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-neutral-500">
            <span>Quality</span>
            <span className="text-neutral-300">{Math.round(quality * 100)}%</span>
          </div>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.01}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="w-full accent-indigo-500"
          />
        </div>
      )}

      {/* SVG is vector and resolution-independent, so scale does not apply. */}
      {format !== 'svg' && (
        <div className="mb-5">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">Scale</div>
          <div className="flex gap-2">
            {[1, 2, 3].map((s) => (
              <button key={s} onClick={() => setScale(s)} className={chip(scale === s)}>
                {s}×
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md px-3 py-2 text-sm text-neutral-400 hover:text-neutral-200">
          Cancel
        </button>
        <button
          onClick={doExport}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Download
        </button>
      </div>
    </Modal>
  )
}
