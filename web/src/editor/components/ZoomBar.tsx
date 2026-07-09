import { useState } from 'react'
import { Minus, Plus, Maximize } from 'lucide-react'
import { useCanvasStore } from '../store/useCanvasStore'
import { MIN_ZOOM, MAX_ZOOM, ZOOM_STEP } from '../constants'

/** UX-013: bottom-bar zoom controls — slider, +/- buttons, editable % readout,
 *  and fit-to-screen. Controls the single-page canvas's own zoom normally;
 *  while in stack view (BUG-003) it targets `stackZoom` instead, a separate
 *  piece of state, so zooming in on page thumbnails doesn't also blow up
 *  the single-page canvas to that same scale the moment a page is opened.
 *  Fit-to-screen has no stack-view equivalent (there's no single artboard
 *  to fit), so it's disabled there rather than silently doing nothing. */
export function ZoomBar() {
  const viewMode = useCanvasStore((s) => s.viewMode)
  const inStack = viewMode === 'stack'
  const zoom = useCanvasStore((s) => (inStack ? s.stackZoom : s.zoom))
  const setZoomSingle = useCanvasStore((s) => s.setZoom)
  const setStackZoom = useCanvasStore((s) => s.setStackZoom)
  const setZoom = inStack ? setStackZoom : setZoomSingle
  const fitToView = useCanvasStore((s) => s.fitToView)
  const [editing, setEditing] = useState<string | null>(null)

  const pct = Math.round(zoom * 100)

  const commit = () => {
    if (editing === null) return
    const v = parseInt(editing, 10)
    if (!Number.isNaN(v)) setZoom(v / 100)
    setEditing(null)
  }

  return (
    <div className="flex shrink-0 items-center gap-1 pl-2 text-editor-text-secondary">
      <button
        onClick={() => setZoom(zoom - ZOOM_STEP)}
        disabled={zoom <= MIN_ZOOM}
        title="Zoom out (⌘−)"
        className="rounded p-1.5 hover:bg-editor-surface disabled:opacity-40"
      >
        <Minus size={14} />
      </button>
      <input
        type="range"
        min={MIN_ZOOM * 100}
        max={MAX_ZOOM * 100}
        value={pct}
        onChange={(e) => setZoom(Number(e.target.value) / 100)}
        title="Zoom"
        className="w-28 accent-indigo-500"
      />
      <button
        onClick={() => setZoom(zoom + ZOOM_STEP)}
        disabled={zoom >= MAX_ZOOM}
        title="Zoom in (⌘+)"
        className="rounded p-1.5 hover:bg-editor-surface disabled:opacity-40"
      >
        <Plus size={14} />
      </button>
      {editing !== null ? (
        <input
          autoFocus
          value={editing}
          onChange={(e) => setEditing(e.target.value.replace(/[^0-9]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            else if (e.key === 'Escape') setEditing(null)
          }}
          className="w-12 rounded border border-editor-strong bg-editor-surface px-1 py-0.5 text-center text-xs text-editor-text-strong outline-none"
        />
      ) : (
        <button
          onClick={() => setEditing(String(pct))}
          onDoubleClick={() => setZoom(1)}
          title="Click to type a zoom · double-click for 100%"
          className="w-12 rounded px-1 py-0.5 text-center text-xs tabular-nums hover:bg-editor-surface"
        >
          {pct}%
        </button>
      )}
      <button
        onClick={fitToView}
        disabled={inStack}
        title="Fit to screen (⌘⇧H)"
        className="rounded p-1.5 hover:bg-editor-surface disabled:opacity-40"
      >
        <Maximize size={14} />
      </button>
    </div>
  )
}
