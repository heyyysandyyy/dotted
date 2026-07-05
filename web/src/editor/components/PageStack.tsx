import { useEffect, useRef, useState } from 'react'
import { Plus, X, Copy } from 'lucide-react'
import { useCanvasStore } from '../store/useCanvasStore'
import { renderPreview } from '../preview'
import { pageSize } from '../store/storeHelpers'
import { PageGuideOverlay } from './PageGuideOverlay'
import type { PageData } from '../storage'

/** Space-held-drag (or middle-mouse-drag) pans the stack view in both axes —
 *  same gesture as the main canvas (CanvasStage.tsx's own UX-013 pan), kept
 *  as a separate, self-contained copy rather than a shared hook: this one
 *  scrolls a plain DOM container directly (native overflow, not a store
 *  `pan` value), and the main canvas's version has fabric-specific capture-
 *  phase concerns that don't apply here, so extracting a "shared" hook would
 *  need to abstract away real differences rather than remove duplication.
 *
 * Needed because at higher zoom (BUG-003) a page's thumbnail can genuinely
 * be wider than the viewport — native two-finger/trackpad horizontal scroll
 * already reaches the overflow, but there's no visible scrollbar hinting
 * that, and no way to pan at all with a plain mouse (reported: "I cannot
 * pan"). This adds an explicit, discoverable gesture matching the one users
 * already know from the main canvas. */
function useSpaceDragPan(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [panCursor, setPanCursor] = useState<'grab' | 'grabbing' | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let spaceDown = false
    let panning = false
    let lastX = 0
    let lastY = 0
    const isTyping = () => {
      const a = document.activeElement as HTMLElement | null
      if (!a) return false
      if (a.isContentEditable || a.tagName === 'TEXTAREA') return true
      if (a.tagName === 'INPUT') {
        const type = (a as HTMLInputElement).type
        return !['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file'].includes(type)
      }
      return false
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !spaceDown && !isTyping()) {
        e.preventDefault()
        spaceDown = true
        if (!panning) setPanCursor('grab')
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDown = false
        if (!panning) setPanCursor(null)
      }
    }
    const onMouseDown = (e: MouseEvent) => {
      if ((spaceDown && e.button === 0) || e.button === 1) {
        panning = true
        lastX = e.clientX
        lastY = e.clientY
        setPanCursor('grabbing')
        e.preventDefault()
      }
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!panning) return
      el.scrollLeft -= e.clientX - lastX
      el.scrollTop -= e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
    }
    const onMouseUp = () => {
      if (!panning) return
      panning = false
      setPanCursor(spaceDown ? 'grab' : null)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    el.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      el.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [containerRef])

  return panCursor
}

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
  const containerRef = useRef<HTMLDivElement>(null)
  const panCursor = useSpaceDragPan(containerRef)

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
    <div
      ref={containerRef}
      className="flex h-full flex-col items-center gap-4 overflow-auto bg-neutral-950 p-6"
      style={{ cursor: panCursor ?? undefined }}
    >
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
