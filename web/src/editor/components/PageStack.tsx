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
 *  `pan` value), so extracting a "shared" hook would need to abstract away
 *  a real difference rather than remove duplication.
 *
 * Needed because at higher zoom (BUG-003) a page's thumbnail can genuinely
 * be wider than the viewport — native two-finger/trackpad horizontal scroll
 * already reaches the overflow, but there's no visible scrollbar hinting
 * that, and no way to pan at all with a plain mouse (reported: "I cannot
 * pan"). This adds an explicit, discoverable gesture matching the one users
 * already know from the main canvas.
 *
 * A completed drag also has to not open whatever page thumbnail happened to
 * be under the pointer when it started (reported bug: grabbing to pan was
 * also selecting/opening the page). A browser tracks whether to fire `click`
 * on mouseup independently of whatever JS did with the mousedown event —
 * stopping mousedown's own propagation doesn't stop a *separate*, later
 * `click` event from still firing on the same element (that's why this
 * works for CanvasStage's own pan gesture: fabric's own selection logic is
 * *also* a plain mousedown listener, not click-based, so stopping mousedown
 * propagation is enough there — a native <button>'s click is a different
 * mechanism entirely). The fix here is to arm a suppression flag when a
 * mouseup completes a real drag (more than `CLICK_DRAG_THRESHOLD` px — a
 * stationary click still opens a page normally) and consume it on whichever
 * event fires next: `click` for a space+left-drag, `auxclick` for a middle-
 * drag (middle-button releases never fire a plain `click` at all, so
 * without also listening for `auxclick` the flag would stay armed and
 * wrongly suppress a later, unrelated left-click). Listening on `window`
 * rather than just the container so the flag gets consumed even if the drag
 * ended with the pointer outside it. */
const CLICK_DRAG_THRESHOLD = 4

function useSpaceDragPan(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [panCursor, setPanCursor] = useState<'grab' | 'grabbing' | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let spaceDown = false
    let panning = false
    let lastX = 0
    let lastY = 0
    let dragDistance = 0
    let suppressNextClick = false
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
        dragDistance = 0
        setPanCursor('grabbing')
        e.preventDefault()
      }
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!panning) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      dragDistance += Math.abs(dx) + Math.abs(dy)
      el.scrollLeft -= dx
      el.scrollTop -= dy
      lastX = e.clientX
      lastY = e.clientY
    }
    const onMouseUp = () => {
      if (!panning) return
      panning = false
      if (dragDistance > CLICK_DRAG_THRESHOLD) suppressNextClick = true
      setPanCursor(spaceDown ? 'grab' : null)
    }
    const onClickCapture = (e: MouseEvent) => {
      if (suppressNextClick) {
        e.stopPropagation()
        e.preventDefault()
      }
      suppressNextClick = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    el.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('click', onClickCapture, { capture: true })
    window.addEventListener('auxclick', onClickCapture, { capture: true })
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      el.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('click', onClickCapture, { capture: true })
      window.removeEventListener('auxclick', onClickCapture, { capture: true })
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
  panCursor,
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
  panCursor: 'grab' | 'grabbing' | null
  onOpen: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const gridSize = useCanvasStore((s) => s.grid.size)
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
          // outline, not border: a border is part of the box (border-box
          // sizing eats it out of the declared width/height), so the guide
          // overlay canvas below — sized to exactly thumbWidth x thumbHeight
          // to match — ended up wider/taller than the actual space left
          // inside the border, overflowing past the button's own edge and
          // getting clipped by overflow-hidden. Only showed up as asymmetry
          // because the clip lands on the right/bottom (top-left anchored),
          // cutting the right-edge bleed guide down to a sliver (reported
          // bug). An outline sits outside the box model entirely, so it
          // can't eat into the content area no matter its width.
          className={`relative overflow-hidden rounded bg-white shadow-lg outline outline-2 -outline-offset-2 ${
            active ? 'outline-indigo-500' : 'outline-editor-border-strong hover:outline-editor-border-input'
          }`}
          style={{
            width: thumbWidth,
            height: thumbHeight,
            marginLeft: page.type === 'cover' ? 'auto' : undefined,
            // A <button>'s own default cursor (pointer) otherwise wins over
            // the container's cursor style everywhere the mouse is actually
            // over a thumbnail — which is most of the visible area, so the
            // grab/grabbing hand from holding space would never show
            // (reported bug). Same reason CanvasStage.tsx sets its own
            // cursor directly on specific elements instead of relying on
            // CSS inheritance from an ancestor.
            cursor: panCursor ?? undefined,
          }}
        >
          <canvas ref={ref} style={{ transformOrigin: 'top left', transform: `scale(${scale})` }} />
          <PageGuideOverlay
            type={page.type}
            width={thumbWidth}
            height={thumbHeight}
            bleedPx={typeof page.bleed === 'number' ? page.bleed * scale : undefined}
            gridSpacingPx={gridSize * scale}
          />
        </button>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-editor-text-muted">
        <span>Page {index + 1}</span>
        <button onClick={onDuplicate} title="Duplicate page" className="text-editor-text-subtle hover:text-editor-text">
          <Copy size={12} />
        </button>
        {canDelete && (
          <button onClick={onDelete} title="Delete page" className="text-editor-text-subtle hover:text-red-400">
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

/** All-pages overview: scroll through every page, click one to edit it
 *  (TPL-001). Has its own zoom state, `stackZoom` (BUG-003) — the bottom
 *  bar's slider controls it while in this view, but it's kept independent
 *  from the single-page canvas's own `zoom` so cranking up the thumbnail
 *  size to see pages better doesn't also blow up the single-page canvas to
 *  that same scale the moment a page is clicked open. */
export function PageStack() {
  const pages = useCanvasStore((s) => s.pages)
  const width = useCanvasStore((s) => s.width)
  const height = useCanvasStore((s) => s.height)
  const zoom = useCanvasStore((s) => s.stackZoom)
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
      className="flex h-full flex-col items-center gap-4 overflow-auto bg-editor-shell p-6"
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
          panCursor={panCursor}
          onOpen={() => openForEdit(p.id)}
          onDuplicate={() => duplicatePage(p.id)}
          onDelete={() => deletePage(p.id)}
        />
      ))}
      <button
        onClick={addPage}
        className="flex items-center gap-1.5 rounded border border-dashed border-editor-strong px-4 py-2 text-sm text-editor-text-muted hover:border-editor-input hover:text-editor-text"
      >
        <Plus size={16} />
        Add page
      </button>
    </div>
  )
}
