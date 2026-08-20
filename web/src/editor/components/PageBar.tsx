import { useEffect, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
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

/** A page's rendered box at strip scale — shared by the in-list thumbnail and
 *  the drag overlay clone so they're never computed differently. */
function thumbGeometry(page: PageData, fallback: { width: number; height: number }) {
  const { width, height } = pageSize(page, fallback)
  const scale = STRIP_THUMB_H / height
  const boxW = Math.round(width * scale)
  return { width, height, scale, boxW }
}

/** The actual thumbnail content — a live preview render plus the book guide
 *  overlay. Pure/presentational so the drag overlay clone can reuse it. */
function ThumbCanvas({
  page,
  width,
  height,
  scale,
  boxW,
}: {
  page: PageData
  width: number
  height: number
  scale: number
  boxW: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const gridSize = useCanvasStore((s) => s.grid.size)

  useEffect(() => {
    if (!ref.current) return
    return renderPreview(ref.current, page.canvas, width, height)
  }, [page, width, height])

  return (
    <>
      <canvas ref={ref} style={{ transformOrigin: 'top left', transform: `scale(${scale})` }} />
      <PageGuideOverlay
        type={page.type}
        width={boxW}
        height={STRIP_THUMB_H}
        bleedPx={typeof page.bleed === 'number' ? page.bleed * scale : undefined}
        gridSpacingPx={gridSize * scale}
      />
    </>
  )
}

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
  // Each page renders at its own size (UX-015 book pages can differ from the
  // project default), not whichever page happens to be active.
  const { width, height, scale, boxW } = thumbGeometry(page, fallbackSize)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
  })

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
        // isDragging just ghosts the in-place slot — the actual drag visual is
        // the DragOverlay clone below, sized correctly for this page's own
        // aspect ratio instead of whatever ends up under the raw drag delta
        // (covers and spreads differ in width, so without an overlay the
        // in-place item visibly stretched/squashed while being dragged).
        // outline, not border: a border is part of the box (border-box
        // sizing eats it out of the declared width/height), so the guide
        // overlay canvas — sized to exactly boxW x STRIP_THUMB_H to match —
        // ended up wider/taller than the actual space left inside the
        // border, overflowing past the button's own edge and getting
        // clipped by overflow-hidden. Same bug as PageStack.tsx's thumbnails
        // (right/bottom bleed guide reads thinner than left/top); an
        // outline sits outside the box model, so it can't eat into content.
        className={`relative touch-none overflow-hidden rounded bg-white outline outline-1 -outline-offset-1 ${
          active ? 'outline-indigo-500 ring-1 ring-indigo-500' : 'outline-editor-border-strong hover:outline-editor-border-input'
        } ${isDragging ? 'opacity-30' : ''}`}
        style={{ width: boxW, height: STRIP_THUMB_H }}
      >
        <ThumbCanvas page={page} width={width} height={height} scale={scale} boxW={boxW} />
        {/* Drag handle affordance — dragging works from anywhere on the
            thumbnail (the listeners above are on the whole button); this is
            just the hover hint, purely decorative. */}
        <div className="pointer-events-none absolute left-0.5 top-0.5 hidden rounded bg-editor-bg/60 p-0.5 text-editor-text-secondary group-hover:block">
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
          className="rounded bg-editor-bg/80 p-0.5 text-editor-text-secondary hover:text-editor-text-strong"
        >
          <Copy size={9} />
        </button>
        {canDelete && (
          <button
            onClick={onDelete}
            title="Delete page"
            className="rounded bg-editor-bg/80 p-0.5 text-editor-text-secondary hover:text-red-400"
          >
            <X size={9} />
          </button>
        )}
      </div>
      <span className="text-[9px] text-editor-text-subtle">{index + 1}</span>
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
  const activePage = activeId ? (pages.find((p) => p.id === activeId) ?? null) : null

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
    <div className="flex h-20 shrink-0 items-center gap-2 border-t border-editor bg-editor-bg px-2">
      <div className="flex flex-1 items-center gap-2 overflow-x-auto">
        {/* View toggle: single page vs all-pages stack. */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setViewMode('single')}
            title="Single page"
            aria-pressed={viewMode === 'single'}
            className={`rounded p-1.5 ${
              viewMode === 'single' ? 'bg-editor-surface-2 text-indigo-400' : 'text-editor-text-muted hover:bg-editor-surface'
            }`}
          >
            <Square size={14} />
          </button>
          <button
            onClick={() => setViewMode('stack')}
            title="All pages"
            aria-pressed={viewMode === 'stack'}
            className={`rounded p-1.5 ${
              viewMode === 'stack' ? 'bg-editor-surface-2 text-indigo-400' : 'text-editor-text-muted hover:bg-editor-surface'
            }`}
          >
            <LayoutGrid size={14} />
          </button>
        </div>
        <div className="h-8 w-px shrink-0 bg-editor-surface" />
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
          <DragOverlay>
            {activePage &&
              (() => {
                const g = thumbGeometry(activePage, { width, height })
                return (
                  <div
                    // outline, not border — see StripThumb's own comment on
                    // this same fix; the guide overlay canvas inside is
                    // sized to exactly boxW x STRIP_THUMB_H, so a border
                    // here would eat into that space and clip its right/
                    // bottom edge the same way.
                    className="overflow-hidden rounded bg-white shadow-lg shadow-black/50 outline outline-1 -outline-offset-1 outline-indigo-400"
                    style={{ width: g.boxW, height: STRIP_THUMB_H, opacity: 0.9 }}
                  >
                    <ThumbCanvas page={activePage} width={g.width} height={g.height} scale={g.scale} boxW={g.boxW} />
                  </div>
                )
              })()}
          </DragOverlay>
        </DndContext>
        {/* Matches StripThumb's column shape (thumbnail height + label-height
            spacer) so the row's vertical centering lines its top up with the
            page thumbnails instead of floating in the middle of the strip. */}
        <div className="flex shrink-0 flex-col items-center gap-0.5">
          <button
            onClick={addPage}
            title="Add page"
            style={{ height: STRIP_THUMB_H }}
            className="flex items-center justify-center rounded border border-dashed border-editor-strong px-3 text-editor-text-muted hover:border-editor-input hover:text-editor-text"
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
