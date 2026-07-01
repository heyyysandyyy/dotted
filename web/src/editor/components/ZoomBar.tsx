import { useState } from 'react'
import { Minus, Plus, Maximize } from 'lucide-react'
import { useCanvasStore } from '../store/useCanvasStore'
import { MIN_ZOOM, MAX_ZOOM, ZOOM_STEP } from '../constants'

/** UX-013: bottom-bar zoom controls — slider, +/- buttons, editable % readout,
 *  and fit-to-screen. */
export function ZoomBar() {
  const zoom = useCanvasStore((s) => s.zoom)
  const setZoom = useCanvasStore((s) => s.setZoom)
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
    <div className="flex shrink-0 items-center gap-1 pl-2 text-neutral-300">
      <button
        onClick={() => setZoom(zoom - ZOOM_STEP)}
        disabled={zoom <= MIN_ZOOM}
        title="Zoom out (⌘−)"
        className="rounded p-1.5 hover:bg-neutral-800 disabled:opacity-40"
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
        className="rounded p-1.5 hover:bg-neutral-800 disabled:opacity-40"
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
          className="w-12 rounded border border-neutral-700 bg-neutral-800 px-1 py-0.5 text-center text-xs text-neutral-100 outline-none"
        />
      ) : (
        <button
          onClick={() => setEditing(String(pct))}
          onDoubleClick={() => setZoom(1)}
          title="Click to type a zoom · double-click for 100%"
          className="w-12 rounded px-1 py-0.5 text-center text-xs tabular-nums hover:bg-neutral-800"
        >
          {pct}%
        </button>
      )}
      <button onClick={fitToView} title="Fit to screen (⌘⇧H)" className="rounded p-1.5 hover:bg-neutral-800">
        <Maximize size={14} />
      </button>
    </div>
  )
}
