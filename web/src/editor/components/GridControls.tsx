import { useEffect, useRef, useState } from 'react'
import { Grid3x3 } from 'lucide-react'
import { GRID_PRESETS } from '../constants'
import { useCanvasStore } from '../store/useCanvasStore'

/** Grid toggle + settings popover (UX-005): visibility, snap, size, style. */
export function GridControls() {
  const grid = useCanvasStore((s) => s.grid)
  const toggleGrid = useCanvasStore((s) => s.toggleGrid)
  const setGridSize = useCanvasStore((s) => s.setGridSize)
  const setGridStyle = useCanvasStore((s) => s.setGridStyle)
  const toggleGridSnap = useCanvasStore((s) => s.toggleGridSnap)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const active = grid.visible || grid.snap
  const isCustom = !GRID_PRESETS.includes(grid.size)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Grid"
        aria-pressed={active}
        className={`rounded-md p-1.5 hover:bg-neutral-800 ${
          active ? 'bg-neutral-800 text-indigo-400' : 'text-neutral-400'
        }`}
      >
        <Grid3x3 size={16} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-52 space-y-3 rounded-lg border border-neutral-700 bg-neutral-800 p-3 text-sm text-neutral-200 shadow-xl">
          <label className="flex items-center justify-between">
            Show grid
            <input
              type="checkbox"
              checked={grid.visible}
              onChange={toggleGrid}
              className="accent-indigo-500"
            />
          </label>
          <label className="flex items-center justify-between">
            Snap to grid
            <input
              type="checkbox"
              checked={grid.snap}
              onChange={toggleGridSnap}
              className="accent-indigo-500"
            />
          </label>

          <div>
            <div className="mb-1 text-xs text-neutral-400">Size</div>
            <div className="flex flex-wrap items-center gap-1">
              {GRID_PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setGridSize(p)}
                  className={`rounded px-2 py-1 text-xs ${
                    grid.size === p ? 'bg-indigo-600 text-white' : 'bg-neutral-700 hover:bg-neutral-600'
                  }`}
                >
                  {p}
                </button>
              ))}
              <input
                type="number"
                min={1}
                value={grid.size}
                onChange={(e) => setGridSize(Number(e.target.value) || 1)}
                aria-label="Custom grid size"
                className={`w-14 rounded border bg-neutral-900 px-1 py-1 text-right text-xs text-neutral-100 ${
                  isCustom ? 'border-indigo-500' : 'border-neutral-600'
                }`}
              />
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs text-neutral-400">Style</div>
            <div className="flex gap-1">
              {(['lines', 'dots'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setGridStyle(st)}
                  className={`flex-1 rounded px-2 py-1 text-xs capitalize ${
                    grid.style === st ? 'bg-indigo-600 text-white' : 'bg-neutral-700 hover:bg-neutral-600'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
