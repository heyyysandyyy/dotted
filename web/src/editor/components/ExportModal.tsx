import { useState } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import {
  exportPNG,
  exportJPEG,
  exportPDF,
  exportSVG,
  exportBounds,
  sanitizeFileName,
  DEFAULT_JPEG_QUALITY,
  MAX_EXPORT_EDGE,
  MIN_EXPORT_SCALE,
  MAX_EXPORT_SCALE,
} from '../exporters'
import { exportBookPDF, type BookExportScope } from '../bookExport'
import { Modal } from './Modal'

interface Props {
  open: boolean
  onClose: () => void
}

type Format = 'png' | 'jpeg' | 'pdf' | 'svg'
type ExportScope = 'artboard' | 'selection'

const BOOK_SCOPE_LABEL: Record<BookExportScope, string> = {
  all: 'All pages',
  cover: 'Cover only',
  spreads: 'Spreads only',
}

const EXPORT_SCOPE_LABEL: Record<ExportScope, string> = {
  artboard: 'Full artboard',
  selection: 'Selection only',
}

const EXTENSION: Record<Format, string> = { png: 'png', jpeg: 'jpg', pdf: 'pdf', svg: 'svg' }

const SCALE_PRESETS = [1, 2, 3]

/** The custom-scale field's text as a usable scale, or null while it holds
 *  something that isn't one (empty, mid-edit, out of range). */
function parseScale(text: string): number | null {
  if (text.trim() === '') return null
  const n = Number(text)
  return Number.isFinite(n) && n >= MIN_EXPORT_SCALE && n <= MAX_EXPORT_SCALE ? n : null
}

export function ExportModal({ open, onClose }: Props) {
  const canvas = useCanvasStore((s) => s.canvas)
  const designName = useCanvasStore((s) => s.designName)
  const selection = useCanvasStore((s) => s.selection)
  // A book project (UX-015) has at least one page tagged cover/spread. (Not a
  // bare `p.type` truthy check: PageType's 'single' variant is never actually
  // assigned to a plain page — those signal "not a book page" via an absent
  // `type` — so this stays correct even if that changes.)
  const isBook = useCanvasStore((s) => s.pages.some((p) => p.type === 'cover' || p.type === 'spread'))
  // A print-product page (PROD-001) exports with its cut line composited in —
  // the line the product is cut out on, which is no use to anyone if it only
  // ever exists on screen. The bleed tint and safe-zone circle stay behind.
  // Independent of the layers panel's guide toggle, which is about on-screen
  // clutter, the same way a book PDF always carries its cut marks.
  const productCutLines = useCanvasStore((s) => s.pages.find((p) => p.id === s.activePageId)?.product ?? null)
  const [format, setFormat] = useState<Format>('png')
  // Held as text so a half-typed value ("1.") survives; the chips write it too.
  const [scaleText, setScaleText] = useState('1')
  const [quality, setQuality] = useState(DEFAULT_JPEG_QUALITY)
  const [bookScope, setBookScope] = useState<BookExportScope>('all')
  const [transparent, setTransparent] = useState(true)
  const [scope, setScope] = useState<ExportScope>('artboard')
  // null = not edited this time round, so the field follows the design name.
  const [fileName, setFileName] = useState<string | null>(null)

  if (!open) return null

  const close = () => {
    setFileName(null)
    onClose()
  }

  const bookPdfExport = isBook && format === 'pdf'
  const hasSelection = selection.length > 0
  // "Selection only" can't stay chosen once there's nothing selected.
  const selectionScope = scope === 'selection' && hasSelection && !bookPdfExport
  const exportSelection = selectionScope ? selection : null
  // A selection export is an asset cut out of the design, not the print
  // file, so the product's cut line only rides along with the full artboard.
  const cutLines = selectionScope ? null : productCutLines
  const bounds = canvas ? exportBounds(canvas, exportSelection) : null

  const usesScale = format !== 'svg' && !bookPdfExport
  const scale = parseScale(scaleText)
  const outW = bounds && scale ? Math.round(bounds.width * scale) : 0
  const outH = bounds && scale ? Math.round(bounds.height * scale) : 0
  const tooLarge = usesScale && Math.max(outW, outH) > MAX_EXPORT_EDGE

  const name = fileName ?? designName
  const savedAs = `${sanitizeFileName(name)}.${EXTENSION[format]}`

  let problem: string | null = null
  if (!bookPdfExport) {
    if (!canvas) problem = 'Nothing to export yet.'
    else if (!bounds) problem = 'The selection is entirely outside the artboard.'
    else if (usesScale && scale === null) {
      problem = `Scale must be between ${MIN_EXPORT_SCALE}× and ${MAX_EXPORT_SCALE}×.`
    } else if (tooLarge) {
      problem = `Too large to export — ${MAX_EXPORT_EDGE.toLocaleString()} px per side at most.`
    }
  }

  const doExport = () => {
    if (bookPdfExport) {
      // Flush the live canvas into the active page first so the export
      // reflects any edit still in the 300ms autosave debounce window.
      useCanvasStore.getState().saveCurrentProject()
      const { pages, width, height } = useCanvasStore.getState()
      exportBookPDF(pages, { width, height }, name, bookScope).catch((err) => {
        console.error('Book PDF export failed', err)
      })
      close()
      return
    }
    if (!canvas || problem) return
    const s = scale ?? 1
    const scoped = { selection: exportSelection, cutLines }
    if (format === 'png') exportPNG(canvas, name, { ...scoped, scale: s, transparent })
    else if (format === 'jpeg') exportJPEG(canvas, name, { ...scoped, scale: s, quality })
    // PDF export is async (jsPDF is lazy-loaded); surface load/render failures
    // instead of leaving an unhandled rejection.
    else if (format === 'pdf') {
      exportPDF(canvas, name, { ...scoped, scale: s }).catch((err) => {
        console.error('PDF export failed', err)
      })
    }
    // SVG export is async too (it fetches the fonts it embeds); same treatment.
    else if (format === 'svg') {
      exportSVG(canvas, name, scoped).catch((err) => {
        console.error('SVG export failed', err)
      })
    }
    close()
  }

  const chip = (active: boolean) =>
    `rounded-md border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
      active
        ? 'border-indigo-500 bg-indigo-600 text-white'
        : 'border-editor-strong text-editor-text-secondary hover:border-editor-input'
    }`
  const label = 'mb-2 text-xs font-medium uppercase tracking-wide text-editor-text-subtle'
  const input =
    'rounded border border-editor-strong bg-editor-surface px-2 py-1.5 text-sm text-editor-text-strong outline-none focus:border-editor-input'

  return (
    <Modal title="Export" widthClass="w-[440px]" onClose={close}>
      <div className="mb-4">
        <div className={label}>Format</div>
        <div className="flex gap-2">
          {(['png', 'jpeg', 'pdf', 'svg'] as Format[]).map((f) => (
            <button key={f} onClick={() => setFormat(f)} className={`${chip(format === f)} uppercase`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <label htmlFor="export-file-name" className={`block ${label}`}>
          File name
        </label>
        <input
          id="export-file-name"
          type="text"
          value={name}
          onChange={(e) => setFileName(e.target.value)}
          spellCheck={false}
          className={`w-full ${input}`}
        />
        <div className="mt-1 truncate text-xs text-editor-text-muted" title={savedAs}>
          Saves as {savedAs}
        </div>
      </div>

      {/* The scope toggle crops every format to the artboard or to the
          selection's box — a book PDF exports whole pages from storage
          instead, so it has its own page picker below. */}
      {!bookPdfExport && (
        <div className="mb-4">
          <div className={label}>Export</div>
          <div className="flex gap-2">
            {(['artboard', 'selection'] as ExportScope[]).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                disabled={s === 'selection' && !hasSelection}
                title={s === 'selection' && !hasSelection ? 'Select something on the canvas first' : undefined}
                className={chip(s === 'selection' ? selectionScope : !selectionScope)}
              >
                {EXPORT_SCOPE_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
      )}

      {format === 'png' && (
        <label className="mb-4 flex cursor-pointer items-center gap-2 text-sm text-editor-text-secondary">
          <input
            type="checkbox"
            checked={transparent}
            onChange={(e) => setTransparent(e.target.checked)}
            className="h-4 w-4 accent-indigo-500"
          />
          Transparent background
        </label>
      )}

      {format === 'jpeg' && (
        <div className="mb-5">
          <div className={`flex items-center justify-between ${label}`}>
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
          <div className={label}>Pages</div>
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
        usesScale && (
          <div className="mb-5">
            <div className={label}>Scale</div>
            <div className="flex items-center gap-2">
              {SCALE_PRESETS.map((s) => (
                <button key={s} onClick={() => setScaleText(String(s))} className={chip(scale === s)}>
                  {s}×
                </button>
              ))}
              <input
                type="number"
                aria-label="Custom scale"
                min={MIN_EXPORT_SCALE}
                max={MAX_EXPORT_SCALE}
                step={0.1}
                value={scaleText}
                onChange={(e) => setScaleText(e.target.value)}
                className={`w-20 ${input}`}
              />
              <span className="text-sm text-editor-text-muted">×</span>
            </div>
          </div>
        )
      )}

      {!bookPdfExport && bounds && (
        <div className="mb-4 text-xs text-editor-text-muted">
          {usesScale && scale
            ? `${outW.toLocaleString()} × ${outH.toLocaleString()} px`
            : `${bounds.width.toLocaleString()} × ${bounds.height.toLocaleString()} px`}
        </div>
      )}

      {problem && (
        <div role="alert" className="mb-4 text-xs text-red-500">
          {problem}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button onClick={close} className="rounded-md px-3 py-2 text-sm text-editor-text-muted hover:text-editor-text">
          Cancel
        </button>
        <button
          onClick={doExport}
          disabled={!!problem}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Download
        </button>
      </div>
    </Modal>
  )
}
