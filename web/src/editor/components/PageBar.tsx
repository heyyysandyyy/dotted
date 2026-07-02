import { useEffect, useRef, useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, X, Copy, Square, LayoutGrid, GripVertical } from 'lucide-react'
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
  dropBefore,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  page: PageData
  index: number
  fallbackSize: { width: number; height: number }
  active: boolean
  canDelete: boolean
  /** Show the insertion-point indicator on this thumbnail's leading edge (BOOK-003). */
  dropBefore: boolean
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

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
  })

  useEffect(() => {
    if (!ref.current) return
    return renderPreview(ref.current, page.canvas, width, height)
  }, [page, width, height])

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="group relative flex shrink-0 flex-col items-center gap-0.5"
    >
      {/* Insertion-point indicator (BOOK-003) — the project has no --border-accent
          token, so this reuses the app's existing indigo accent for consistency
          with the active-page border below. */}
      {dropBefore && (
        <div
          className="absolute -left-1.5 top-0 w-0.5 rounded bg-indigo-400"
          style={{ height: STRIP_THUMB_H }}
        />
      )}
      <button
        onClick={onOpen}
        title={`Edit page ${index + 1}`}
        {...attributes}
        {...listeners}
        className={`relative touch-none overflow-hidden rounded border bg-white ${
          active ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-neutral-700 hover:border-neutral-500'
        } ${isDragging ? 'opacity-90 shadow-lg shadow-black/50' : ''}`}
        style={{ width: boxW, height: STRIP_THUMB_H }}
      >
        <canvas ref={ref} style={{ transformOrigin: 'top left', transform: `scale(${scale})` }} />
        <PageGuideOverlay
          type={page.type}
          width={boxW}
          height={STRIP_THUMB_H}
          bleedPx={typeof page.bleed === 'number' ? page.bleed * scale : undefined}
        />
        {/* Drag handle affordance — dragging works from anywhere on the
            thumbnail (the listeners above are on the whole button); this is
            just the hover hint, purely decorative. */}
        <div className="pointer-events-none absolute left-0.5 top-0.5 hidden rounded bg-neutral-900/60 p-0.5 text-neutral-300 group-hover:block">
          <GripVertical size={9} />
        </div>
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

/** Bottom strip for multi-page designs: a persistent, draggable thumbnail strip
 *  to switch, reorder, add, and delete pages (TPL-001; upgraded from text-only
 *  buttons to real thumbnails with book guide overlays in BOOK-002; drag
 *  reorder in BOOK-003 — same @dnd-kit/sortable pattern as LayersPanel). */
export function PageBar() {
  const pages = useCanvasStore((s) => s.pages)
  const width = useCanvasStore((s) => s.width)
  const height = useCanvasStore((s) => s.height)
  const activePageId = useCanvasStore((s) => s.activePageId)
  const selectPage = useCanvasStore((s) => s.selectPage)
  const addPage = useCanvasStore((s) => s.addPage)
  const deletePage = useCanvasStore((s) => s.deletePage)
  const duplicatePage = useCanvasStore((s) => s.duplicatePage)
  const reorderPages = useCanvasStore((s) => s.reorderPages)
  const viewMode = useCanvasStore((s) => s.viewMode)
  const setViewMode = useCanvasStore((s) => s.setViewMode)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  // Keyboard sensor gives dnd-kit's own accessible drag pattern for free
  // (focus a thumbnail, Space to pick up, Arrow keys to move, Space to drop).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Nothing to show until a project is loaded.
  if (pages.length === 0) return null

  const ids = pages.map((p) => p.id)

  const onDragStart = (e: DragStartEvent) => setActiveId(e.active.id as string)
  const onDragOver = (e: DragOverEvent) => setOverId((e.over?.id as string | undefined) ?? null)
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    setOverId(null)
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = ids.indexOf(active.id as string)
    const to = ids.indexOf(over.id as string)
    if (from < 0 || to < 0) return
    reorderPages(from, to)
  }
  const onDragCancel = () => {
    setActiveId(null)
    setOverId(null)
  }

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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
            {pages.map((p, i) => (
              <StripThumb
                key={p.id}
                page={p}
                index={i}
                fallbackSize={{ width, height }}
                active={p.id === activePageId}
                canDelete={pages.length > 1}
                dropBefore={activeId !== null && overId === p.id && activeId !== p.id}
                onOpen={() => {
                  selectPage(p.id)
                  setViewMode('single')
                }}
                onDuplicate={() => duplicatePage(p.id)}
                onDelete={() => deletePage(p.id)}
              />
            ))}
          </SortableContext>
        </DndContext>
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
