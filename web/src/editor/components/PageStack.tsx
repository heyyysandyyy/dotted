import { useEffect, useRef } from 'react'
import { Plus, X, Copy } from 'lucide-react'
import { useCanvasStore } from '../store/useCanvasStore'
import { renderPreview } from '../preview'
import { pageSize } from '../store/storeHelpers'
import { PageGuideOverlay } from './PageGuideOverlay'
import type { PageData } from '../storage'

/** Display height every thumbnail normalises to, at 100% zoom (BUG-004) —
 *  width follows proportionally from each page's own aspect ratio, so a
 *  spread (2x the width of a single/cover page, same height) reads roughly
 *  twice as wide rather than being squashed to a fixed width like a cover. */
const BASE_THUMB_HEIGHT = 240

function PagePreview({
  page,
  index,
  fallbackSize,
  thumbHeight,
  columnWidth,
  active,
  canDelete,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  page: PageData
  index: number
  fallbackSize: { width: number; height: number }
  thumbHeight: number
  columnWidth: number
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

  useEffect(() => {
    if (!ref.current) return
    return renderPreview(ref.current, page.canvas, width, height)
  }, [page, width, height])

  const scale = thumbHeight / height
  const thumbWidth = Math.round(width * scale)

  return (
    <div className="flex flex-col items-center gap-1">
      {/* A shared-width column so every page's row aligns the same way
          regardless of its own thumbnail width (BUG-005) — narrower than a
          spread's own thumbnail, a cover sits flush to the column's right
          edge, mirroring where it sits in an open book (the right-hand
          page of a spread). PageType has no 'back-cover' variant yet
          (would mirror to the left edge) — left as a no-op until it does. */}
      <div style={{ width: columnWidth }} className="flex justify-center">
        <button
          onClick={onOpen}
          title={`Edit page ${index + 1}`}
          className={`relative overflow-hidden rounded border-2 bg-white shadow-lg ${
            active ? 'border-indigo-500' : 'border-neutral-700 hover:border-neutral-500'
          }`}
          style={{ width: thumbWidth, height: thumbHeight, marginLeft: page.type === 'cover' ? 'auto' : undefined }}
        >
          <canvas ref={ref} style={{ transformOrigin: 'top left', transform: `scale(${scale})` }} />
          <PageGuideOverlay
            type={page.type}
            width={thumbWidth}
            height={thumbHeight}
            bleedPx={typeof page.bleed === 'number' ? page.bleed * scale : undefined}
          />
        </button>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-neutral-400">
        <span>Page {index + 1}</span>
        <button onClick={onDuplicate} title="Duplicate page" className="text-neutral-500 hover:text-neutral-200">
          <Copy size={12} />
        </button>
        {canDelete && (
          <button onClick={onDelete} title="Delete page" className="text-neutral-500 hover:text-red-400">
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

/** All-pages overview: scroll through every page, click one to edit it
 *  (TPL-001). Shares the main canvas's own zoom state (BUG-003) — the same
 *  slider in the bottom bar scales every page thumbnail uniformly. */
export function PageStack() {
  const pages = useCanvasStore((s) => s.pages)
  const width = useCanvasStore((s) => s.width)
  const height = useCanvasStore((s) => s.height)
  const zoom = useCanvasStore((s) => s.zoom)
  const activePageId = useCanvasStore((s) => s.activePageId)
  const selectPage = useCanvasStore((s) => s.selectPage)
  const setViewMode = useCanvasStore((s) => s.setViewMode)
  const addPage = useCanvasStore((s) => s.addPage)
  const deletePage = useCanvasStore((s) => s.deletePage)
  const duplicatePage = useCanvasStore((s) => s.duplicatePage)

  const openForEdit = (id: string) => {
    selectPage(id)
    setViewMode('single')
  }

  const fallbackSize = { width, height }
  const thumbHeight = BASE_THUMB_HEIGHT * zoom
  // The widest page's own thumbnail width becomes the shared column width
  // every row aligns against (BUG-004/005) — normally a spread, since it's
  // 2x a single/cover page's width at the same trim height.
  const columnWidth = Math.max(
    ...pages.map((p) => {
      const size = pageSize(p, fallbackSize)
      return Math.round(size.width * (thumbHeight / size.height))
    }),
  )

  return (
    <div className="flex h-full flex-col items-center gap-4 overflow-y-auto bg-neutral-950 p-6">
      {pages.map((p, i) => (
        <PagePreview
          key={p.id}
          page={p}
          index={i}
          fallbackSize={fallbackSize}
          thumbHeight={thumbHeight}
          columnWidth={columnWidth}
          active={p.id === activePageId}
          canDelete={pages.length > 1}
          onOpen={() => openForEdit(p.id)}
          onDuplicate={() => duplicatePage(p.id)}
          onDelete={() => deletePage(p.id)}
        />
      ))}
      <button
        onClick={addPage}
        className="flex items-center gap-1.5 rounded border border-dashed border-neutral-700 px-4 py-2 text-sm text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
      >
        <Plus size={16} />
        Add page
      </button>
    </div>
  )
}
