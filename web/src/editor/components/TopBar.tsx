import { Undo2, Redo2, Download } from 'lucide-react'
import { useCanvasStore } from '../store/useCanvasStore'
import { useHistoryStore } from '../store/useHistoryStore'

interface Props {
  onNewDesign: () => void
  onExport: () => void
}

export function TopBar({ onNewDesign, onExport }: Props) {
  const zoom = useCanvasStore((s) => s.zoom)
  const width = useCanvasStore((s) => s.width)
  const height = useCanvasStore((s) => s.height)

  const canUndo = useHistoryStore((s) => s.canUndo)
  const canRedo = useHistoryStore((s) => s.canRedo)
  const undo = useHistoryStore((s) => s.undo)
  const redo = useHistoryStore((s) => s.redo)

  return (
    <header className="flex h-12 items-center gap-3 border-b border-neutral-800 bg-neutral-900 px-3 text-neutral-200">
      <span className="font-semibold tracking-tight">dotted</span>

      <button
        onClick={onNewDesign}
        className="rounded-md bg-neutral-700 px-3 py-1.5 text-sm font-medium hover:bg-neutral-600"
      >
        New design
      </button>

      <div className="flex items-center gap-1">
        <button
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Cmd/Ctrl+Z)"
          className="rounded-md p-1.5 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Undo2 size={16} />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Cmd/Ctrl+Shift+Z)"
          className="rounded-md p-1.5 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Redo2 size={16} />
        </button>
      </div>

      <div className="ml-auto flex items-center gap-3 text-xs text-neutral-400">
        <span>
          {width} × {height}
        </span>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          onClick={onExport}
          className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          <Download size={15} />
          Export
        </button>
      </div>
    </header>
  )
}
