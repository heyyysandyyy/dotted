import { useState } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import { exportBookPrint, DEFAULT_PRINT_OPTIONS, type PrintFileScope, type PrintExportOptions } from '../bookExport'
import { bookSizeLabel } from '../constants'
import { Modal } from './Modal'

type FormatChoice = 'pdfx1a' | 'pdfx4' | 'pdf' | 'png'

const FORMAT_LABEL: Record<FormatChoice, string> = {
  pdfx1a: 'PDF/X-1a',
  pdfx4: 'PDF/X-4',
  pdf: 'PDF',
  png: 'PNG',
}
const SCOPE_LABEL: Record<PrintFileScope, string> = { cover: 'Cover', interior: 'Interior', both: 'Both files' }
const RESOLUTIONS = [
  { dpi: 150, label: '150 dpi (draft)' },
  { dpi: 300, label: '300 dpi (recommended)' },
  { dpi: 600, label: '600 dpi (high quality)' },
]

/** Toggle row used by the Print marks / Typography sections. */
function ToggleRow({
  label,
  subtitle,
  on,
  onClick,
}: {
  label: string
  subtitle: string
  on: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start justify-between gap-3 rounded border border-neutral-700 px-3 py-2 text-left hover:border-neutral-500"
    >
      <span>
        <span className="block text-sm text-neutral-200">{label}</span>
        <span className="block text-xs text-neutral-500">{subtitle}</span>
      </span>
      <span
        className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border ${
          on ? 'border-indigo-500 bg-indigo-500' : 'border-neutral-600 bg-transparent'
        }`}
      />
    </button>
  )
}

/**
 * BOOK-004: print-focused export flow for book projects, replacing the
 * standard ExportModal (see Editor.tsx's isBookProject branch).
 *
 * Two things this modal cannot honestly deliver, documented here rather than
 * silently faked:
 * - PDF/X-1a / PDF/X-4 are not genuinely compliant output. They set CMYK on
 *   the vector print marks and lock sensible defaults, but the page content
 *   itself is a rasterized RGB image (canvas 2D is sRGB-only, and there is
 *   no in-browser path to author a CMYK JPEG) — see bookExport.ts's
 *   PrintExportOptions doc comment for the full explanation. The banner
 *   copy below says this plainly instead of claiming certified compliance.
 * - Embed fonts / Outline fonts have no separate effect on the exported
 *   file: every page is already fully rasterized (text baked into pixels
 *   as part of the page image), so there is no live font reference in the
 *   output either way — nothing to embed, nothing that needs outlining.
 *   The toggle is kept because the ticket calls for it and because true
 *   per-object vector text export is a real, separate undertaking (walking
 *   every text object and redrawing it with jsPDF's own text APIs instead
 *   of rasterizing the page) that's out of scope for this phase.
 */
export function PrintExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const designName = useCanvasStore((s) => s.designName)
  const pages = useCanvasStore((s) => s.pages)

  const [fileScope, setFileScope] = useState<PrintFileScope>('cover')
  const [format, setFormat] = useState<FormatChoice>('pdfx1a')
  const [colorProfile, setColorProfile] = useState<'cmyk' | 'rgb'>('cmyk')
  const [resolution, setResolution] = useState(DEFAULT_PRINT_OPTIONS.resolution)
  const [includeBleed, setIncludeBleed] = useState(DEFAULT_PRINT_OPTIONS.includeBleed)
  const [cropMarks, setCropMarks] = useState(DEFAULT_PRINT_OPTIONS.cropMarks)
  const [spineMarks, setSpineMarks] = useState(DEFAULT_PRINT_OPTIONS.spineMarks)
  const [embedFonts, setEmbedFonts] = useState(true)
  const [outlineFonts, setOutlineFonts] = useState(false)
  const [exporting, setExporting] = useState(false)

  const cover = pages.find((p) => p.type === 'cover')
  const interiorCount = pages.filter((p) => p.type === 'spread').length
  const [pageFrom, setPageFrom] = useState(1)
  const [pageTo, setPageTo] = useState(interiorCount || 1)

  if (!open) return null

  const effectiveColorProfile = format === 'pdfx1a' ? 'cmyk' : colorProfile
  const effectiveFormat: PrintExportOptions['format'] = format === 'png' ? 'png' : 'pdf'
  const showPageRange = fileScope === 'interior' || fileScope === 'both'
  const showSpineToggle = fileScope !== 'interior'

  const setOutline = (on: boolean) => {
    setOutlineFonts(on)
    if (on) setEmbedFonts(false)
  }
  const setEmbed = (on: boolean) => {
    setEmbedFonts(on)
    if (on) setOutlineFonts(false)
  }

  const options: PrintExportOptions = {
    format: effectiveFormat,
    colorProfile: effectiveColorProfile,
    resolution,
    includeBleed,
    cropMarks,
    spineMarks: spineMarks && showSpineToggle,
    pageRange: showPageRange ? { from: pageFrom, to: pageTo } : null,
  }

  const doExport = async () => {
    setExporting(true)
    try {
      // Flush the live canvas into the active page first so the export
      // reflects any edit still in the 300ms autosave debounce window.
      useCanvasStore.getState().saveCurrentProject()
      const fresh = useCanvasStore.getState()
      const fallback = { width: fresh.width, height: fresh.height }
      if (fileScope === 'cover' || fileScope === 'both') {
        await exportBookPrint(fresh.pages, fallback, fresh.designName, 'cover', options)
      }
      if (fileScope === 'interior' || fileScope === 'both') {
        await exportBookPrint(fresh.pages, fallback, fresh.designName, 'interior', options)
      }
      onClose()
    } catch (err) {
      console.error('Print export failed', err)
    } finally {
      setExporting(false)
    }
  }

  const chip = (active: boolean) =>
    `rounded-md border px-3 py-1.5 text-sm font-medium ${
      active
        ? 'border-indigo-500 bg-indigo-600 text-white'
        : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'
    }`

  const markParts = [
    includeBleed && 'bleed',
    cropMarks && 'crop marks',
    showSpineToggle && spineMarks && 'spine marks',
  ].filter(Boolean)
  const summary = [
    SCOPE_LABEL[fileScope],
    FORMAT_LABEL[format],
    effectiveFormat === 'pdf' ? effectiveColorProfile.toUpperCase() : `${resolution} dpi`,
  ].join(' · ')
  const summaryTail = [markParts.length ? markParts.join(', ') : null, embedFonts ? 'fonts embedded' : outlineFonts ? 'fonts outlined' : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <Modal title="Export for print" widthClass="w-[480px]" onClose={onClose}>
      <div className="mb-4 text-xs text-neutral-500">
        {designName}
        {cover ? ` · ${bookSizeLabel(cover)}` : ''} · {interiorCount * 2} pages
      </div>

      <div className="mb-5">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">File</div>
        <div className="flex gap-2">
          {(['cover', 'interior', 'both'] as PrintFileScope[]).map((s) => (
            <button key={s} onClick={() => setFileScope(s)} className={chip(fileScope === s)}>
              {SCOPE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">Format</div>
        <div className="flex flex-wrap gap-2">
          {(['pdfx1a', 'pdfx4', 'pdf', 'png'] as FormatChoice[]).map((f) => (
            <button key={f} onClick={() => setFormat(f)} className={chip(format === f)}>
              {FORMAT_LABEL[f]}
            </button>
          ))}
        </div>
        {format === 'pdfx1a' && (
          <p className="mt-2 rounded border border-amber-700/40 bg-amber-950/30 p-2 text-xs leading-snug text-amber-200">
            Uses CMYK for print marks and locks the colour profile. Page content itself renders as an RGB image
            (a browser limitation) — this is a well-prepared print PDF, not an independently certified PDF/X-1a
            file. Have your printer preflight it before a production run.
          </p>
        )}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">Colour profile</div>
          <div className="flex gap-2">
            {(['cmyk', 'rgb'] as const).map((p) => (
              <button
                key={p}
                disabled={format === 'pdfx1a'}
                onClick={() => setColorProfile(p)}
                className={`${chip(effectiveColorProfile === p)} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        {format === 'png' && (
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">Resolution</div>
            <select
              value={resolution}
              onChange={(e) => setResolution(Number(e.target.value))}
              className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100"
            >
              {RESOLUTIONS.map((r) => (
                <option key={r.dpi} value={r.dpi}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="mb-5 space-y-2">
        <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">Print marks</div>
        <ToggleRow
          label="Include bleed"
          subtitle="Adds 0.125 in on all sides"
          on={includeBleed}
          onClick={() => setIncludeBleed((v) => !v)}
        />
        <ToggleRow
          label="Crop marks"
          subtitle="Corner cut lines at trim edge"
          on={cropMarks}
          onClick={() => setCropMarks((v) => !v)}
        />
        {showSpineToggle && (
          <ToggleRow
            label="Spine marks"
            subtitle="Top and bottom spine guides on cover"
            on={spineMarks}
            onClick={() => setSpineMarks((v) => !v)}
          />
        )}
      </div>

      <div className="mb-5 space-y-2">
        <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">Typography</div>
        <ToggleRow
          label="Embed fonts"
          subtitle="Required by most print vendors"
          on={embedFonts}
          onClick={() => setEmbed(!embedFonts)}
        />
        <ToggleRow
          label="Outline fonts"
          subtitle="Convert text to paths (no embed needed)"
          on={outlineFonts}
          onClick={() => setOutline(!outlineFonts)}
        />
      </div>

      {showPageRange && (
        <div className="mb-5">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">Page range</div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={interiorCount}
              value={pageFrom}
              onChange={(e) => setPageFrom(Math.min(Number(e.target.value) || 1, pageTo))}
              className="w-20 rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100"
            />
            <span className="text-sm text-neutral-500">to</span>
            <input
              type="number"
              min={pageFrom}
              max={interiorCount}
              value={pageTo}
              onChange={(e) => setPageTo(Math.max(Number(e.target.value) || interiorCount, pageFrom))}
              className="w-20 rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100"
            />
            <span className="text-xs text-neutral-500">of {interiorCount}</span>
          </div>
        </div>
      )}

      <div className="mb-4 rounded border border-neutral-800 bg-neutral-950 p-2 text-xs text-neutral-500">
        {summary}
        {summaryTail ? ` / ${summaryTail}` : ''}
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md px-3 py-2 text-sm text-neutral-400 hover:text-neutral-200">
          Cancel
        </button>
        <button
          onClick={doExport}
          disabled={exporting}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {exporting ? 'Exporting…' : 'Export'}
        </button>
      </div>
    </Modal>
  )
}
