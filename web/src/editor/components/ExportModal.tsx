import { useState } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import { exportPNG, exportJPEG, exportPDF, exportSVG, DEFAULT_JPEG_QUALITY } from '../exporters'
import { exportBookPDF, type BookExportScope } from '../bookExport'
import { Modal } from './Modal'

interface Props {
  open: boolean
  onClose: () => void
}

type Format = 'png' | 'jpeg' | 'pdf' | 'svg'

const BOOK_SCOPE_LABEL: Record<BookExportScope, string> = {
  all: 'All pages',
  cover: 'Cover only',
  spreads: 'Spreads only',
}

export function ExportModal({ open, onClose }: Props) {
  const canvas = useCanvasStore((s) => s.canvas)
  const designName = useCanvasStore((s) => s.designName)
  // A book project (UX-015) has at least one page tagged cover/spread. (Not a
  // bare `p.type` truthy check: PageType's 'single' variant is never actually
  // assigned to a plain page — those signal "not a book page" via an absent
  // `type` — so this stays correct even if that changes.)
  const isBook = useCanvasStore((s) => s.pages.some((p) => p.type === 'cover' || p.type === 'spread'))
  const [format, setFormat] = useState<Format>('png')
  const [scale, setScale] = useState(1)
  const [quality, setQuality] = useState(DEFAULT_JPEG_QUALITY)
  const [bookScope, setBookScope] = useState<BookExportScope>('all')

  if (!open) return null

  const bookPdfExport = isBook && format === 'pdf'

  const doExport = () => {
    if (bookPdfExport) {
      // Flush the live canvas into the active page first so the export
      // reflects any edit still in the 300ms autosave debounce window.
      useCanvasStore.getState().saveCurrentProject()
      const { pages, width, height, designName: name } = useCanvasStore.getState()
      exportBookPDF(pages, { width, height }, name, bookScope).catch((err) => {
        console.error('Book PDF export failed', err)
      })
      onClose()
      return
    }
    if (!canvas) return
    if (format === 'png') exportPNG(canvas, designName, scale)
    else if (format === 'jpeg') exportJPEG(canvas, designName, scale, quality)
    // PDF export is async (jsPDF is lazy-loaded); surface load/render failures
    // instead of leaving an unhandled rejection.
    else if (format === 'pdf') {
      exportPDF(canvas, designName, scale).catch((err) => {
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
        : 'border-editor-strong text-editor-text-secondary hover:border-editor-input'
    }`

  return (
    <Modal title="Export" widthClass="w-[420px]" onClose={onClose}>
      <div className="mb-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-editor-text-subtle">Format</div>
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
          <div className="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-editor-text-subtle">
            <span>Quality</span>
            <span className="text-editor-text-secondary">{Math.round(quality * 100)}%</span>
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

      {/* Book PDF (UX-015) renders every page at its own native 300dpi size —
          no scale multiplier — but offers which pages to include instead. */}
      {bookPdfExport ? (
        <div className="mb-5">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-editor-text-subtle">Pages</div>
          <div className="flex gap-2">
            {(['all', 'cover', 'spreads'] as BookExportScope[]).map((s) => (
              <button key={s} onClick={() => setBookScope(s)} className={chip(bookScope === s)}>
                {BOOK_SCOPE_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
      ) : (
        // SVG is vector and resolution-independent, so scale does not apply.
        format !== 'svg' && (
          <div className="mb-5">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-editor-text-subtle">Scale</div>
            <div className="flex gap-2">
              {[1, 2, 3].map((s) => (
                <button key={s} onClick={() => setScale(s)} className={chip(scale === s)}>
                  {s}×
                </button>
              ))}
            </div>
          </div>
        )
      )}

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md px-3 py-2 text-sm text-editor-text-muted hover:text-editor-text">
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
