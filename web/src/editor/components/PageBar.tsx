import { useEffect, useRef } from 'react'
import { Plus, X, Copy, Square, LayoutGrid } from 'lucide-react'
import { useCanvasStore } from '../store/useCanvasStore'
import { renderPreview } from '../preview'
import { pageSize } from '../store/storeHelpers'
import { PageGuideOverlay } from './PageGuideOverlay'
import type { PageData } from '../storage'
import { ZoomBar } from './ZoomBar'

/** Thumbnail height in the strip (px); width follows each page's own aspect ratio. */
const STRIP_THUMB_H = 52

function StripThumb({
  page,
  index,
  fallbackSize,
  active,
  canDelete,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  page: PageData
  index: number
  fallbackSize: { width: number; height: number }
  active: boolean
  canDelete: boolean
  onOpen: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  // Each page renders at its own size (UX-015 book pages can differ from the
  // project default), not whichever page happens to be active.
  const { width, height } = pageSize(page, fallbackSize)
  const scale = STRIP_THUMB_H / height
  const boxW = Math.round(width * scale)

  useEffect(() => {
    if (!ref.current) return
    return renderPreview(ref.current, page.canvas, width, height)
  }, [page, width, height])

  return (
    <div className="group relative flex shrink-0 flex-col items-center gap-0.5">
      <button
        onClick={onOpen}
        title={`Edit page ${index + 1}`}
        className={`relative overflow-hidden rounded border bg-white ${
          active ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-neutral-700 hover:border-neutral-500'
        }`}
        style={{ width: boxW, height: STRIP_THUMB_H }}
      >
        <canvas ref={ref} style={{ transformOrigin: 'top left', transform: `scale(${scale})` }} />
        <PageGuideOverlay
          type={page.type}
          width={boxW}
          height={STRIP_THUMB_H}
          bleedPx={typeof page.bleed === 'number' ? page.bleed * scale : undefined}
        />
      </button>
      {/* Sibling of the thumbnail button, not a descendant — nesting <button>
          inside <button> is invalid HTML and misbehaves across browsers. Inset
          (not offset past the thumbnail's own edge) so it can't get clipped by
          the strip's scroll container, which forces vertical clipping too once
          horizontal scroll is enabled. */}
      <div className="absolute right-0.5 top-0.5 hidden gap-0.5 group-hover:flex">
        <button
          onClick={onDuplicate}
          title="Duplicate page"
          className="rounded bg-neutral-900/80 p-0.5 text-neutral-300 hover:text-neutral-100"
        >
          <Copy size={9} />
        </button>
        {canDelete && (
          <button
            onClick={onDelete}
            title="Delete page"
            className="rounded bg-neutral-900/80 p-0.5 text-neutral-300 hover:text-red-400"
          >
            <X size={9} />
          </button>
        )}
      </div>
      <span className="text-[9px] text-neutral-500">{index + 1}</span>
    </div>
  )
}

/** Bottom strip for multi-page designs: a persistent thumbnail strip to switch,
 *  add, and delete pages (TPL-001; upgraded from text-only buttons to real
 *  thumbnails with book guide overlays in BOOK-002). */
export function PageBar() {
  const pages = useCanvasStore((s) => s.pages)
  const width = useCanvasStore((s) => s.width)
  const height = useCanvasStore((s) => s.height)
  const activePageId = useCanvasStore((s) => s.activePageId)
  const selectPage = useCanvasStore((s) => s.selectPage)
  const addPage = useCanvasStore((s) => s.addPage)
  const deletePage = useCanvasStore((s) => s.deletePage)
  const duplicatePage = useCanvasStore((s) => s.duplicatePage)
  const viewMode = useCanvasStore((s) => s.viewMode)
  const setViewMode = useCanvasStore((s) => s.setViewMode)

  // Nothing to show until a project is loaded.
  if (pages.length === 0) return null

  return (
    <div className="flex h-20 shrink-0 items-center gap-2 border-t border-neutral-800 bg-neutral-900 px-2">
      <div className="flex flex-1 items-center gap-2 overflow-x-auto">
        {/* View toggle: single page vs all-pages stack. */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setViewMode('single')}
            title="Single page"
            aria-pressed={viewMode === 'single'}
            className={`rounded p-1.5 ${
              viewMode === 'single' ? 'bg-neutral-700 text-indigo-400' : 'text-neutral-400 hover:bg-neutral-800'
            }`}
          >
            <Square size={14} />
          </button>
          <button
            onClick={() => setViewMode('stack')}
            title="All pages"
            aria-pressed={viewMode === 'stack'}
            className={`rounded p-1.5 ${
              viewMode === 'stack' ? 'bg-neutral-700 text-indigo-400' : 'text-neutral-400 hover:bg-neutral-800'
            }`}
          >
            <LayoutGrid size={14} />
          </button>
        </div>
        <div className="h-8 w-px shrink-0 bg-neutral-800" />
        {pages.map((p, i) => (
          <StripThumb
            key={p.id}
            page={p}
            index={i}
            fallbackSize={{ width, height }}
            active={p.id === activePageId}
            canDelete={pages.length > 1}
            onOpen={() => {
              selectPage(p.id)
              setViewMode('single')
            }}
            onDuplicate={() => duplicatePage(p.id)}
            onDelete={() => deletePage(p.id)}
          />
        ))}
        {/* Matches StripThumb's column shape (thumbnail height + label-height
            spacer) so the row's vertical centering lines its top up with the
            page thumbnails instead of floating in the middle of the strip. */}
        <div className="flex shrink-0 flex-col items-center gap-0.5">
          <button
            onClick={addPage}
            title="Add page"
            style={{ height: STRIP_THUMB_H }}
            className="flex items-center justify-center rounded border border-dashed border-neutral-700 px-3 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
          >
            <Plus size={14} />
          </button>
          <span aria-hidden className="text-[9px] text-transparent">
            +
          </span>
        </div>
      </div>
      <ZoomBar />
    </div>
  )
}
