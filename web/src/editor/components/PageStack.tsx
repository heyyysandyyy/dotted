import { useEffect, useRef } from 'react'
import { Plus, X, Copy } from 'lucide-react'
import { useCanvasStore } from '../store/useCanvasStore'
import { renderPreview } from '../preview'
import { pageSize } from '../store/storeHelpers'
import { PageGuideOverlay } from './PageGuideOverlay'
import type { PageData } from '../storage'

const PREVIEW_W = 220

function PagePreview({
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

  useEffect(() => {
    if (!ref.current) return
    return renderPreview(ref.current, page.canvas, width, height)
  }, [page, width, height])

  const scale = PREVIEW_W / width
  const boxH = Math.round(height * scale)

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={onOpen}
        title={`Edit page ${index + 1}`}
        className={`relative overflow-hidden rounded border-2 bg-white shadow-lg ${
          active ? 'border-indigo-500' : 'border-neutral-700 hover:border-neutral-500'
        }`}
        style={{ width: PREVIEW_W, height: boxH }}
      >
        <canvas ref={ref} style={{ transformOrigin: 'top left', transform: `scale(${scale})` }} />
        <PageGuideOverlay
          type={page.type}
          width={PREVIEW_W}
          height={boxH}
          bleedPx={typeof page.bleed === 'number' ? page.bleed * scale : undefined}
        />
      </button>
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

/** All-pages overview: scroll through every page, click one to edit it (TPL-001). */
export function PageStack() {
  const pages = useCanvasStore((s) => s.pages)
  const width = useCanvasStore((s) => s.width)
  const height = useCanvasStore((s) => s.height)
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

  return (
    <div className="flex h-full flex-col items-center gap-4 overflow-y-auto bg-neutral-950 p-6">
      {pages.map((p, i) => (
        <PagePreview
          key={p.id}
          page={p}
          index={i}
          fallbackSize={{ width, height }}
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
