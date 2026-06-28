import { Undo2, Redo2, Download, FolderOpen, Magnet, Grid3x3 } from 'lucide-react'
import { useCanvasStore } from '../store/useCanvasStore'
import { useHistoryStore } from '../store/useHistoryStore'

interface Props {
  onNewDesign: () => void
  onProjects: () => void
  onExport: () => void
}

export function TopBar({ onNewDesign, onProjects, onExport }: Props) {
  const zoom = useCanvasStore((s) => s.zoom)
  const width = useCanvasStore((s) => s.width)
  const height = useCanvasStore((s) => s.height)
  const designName = useCanvasStore((s) => s.designName)
  const setDesignName = useCanvasStore((s) => s.setDesignName)
  const renameProject = useCanvasStore((s) => s.renameProject)
  const snapMode = useCanvasStore((s) => s.snapMode)
  const setSnapMode = useCanvasStore((s) => s.setSnapMode)

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

      <button
        onClick={onProjects}
        title="Projects"
        className="flex items-center gap-1.5 rounded-md bg-neutral-700 px-3 py-1.5 text-sm font-medium hover:bg-neutral-600"
      >
        <FolderOpen size={15} />
        Projects
      </button>

      {/* Editable project name — persisted on blur / Enter via renameProject. */}
      <input
        value={designName}
        onChange={(e) => setDesignName(e.target.value)}
        onBlur={renameProject}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        aria-label="Project name"
        className="w-48 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-neutral-200 hover:border-neutral-700 focus:border-neutral-600 focus:bg-neutral-800 focus:outline-none"
      />

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

      {/* Snapping (CLR-004) — guides and grid are mutually exclusive; clicking
          the active one again turns snapping off. */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setSnapMode(snapMode === 'guides' ? 'none' : 'guides')}
          title="Alignment guides"
          aria-pressed={snapMode === 'guides'}
          className={`rounded-md p-1.5 hover:bg-neutral-800 ${
            snapMode === 'guides' ? 'bg-neutral-800 text-indigo-400' : 'text-neutral-400'
          }`}
        >
          <Magnet size={16} />
        </button>
        <button
          onClick={() => setSnapMode(snapMode === 'grid' ? 'none' : 'grid')}
          title="Snap to grid"
          aria-pressed={snapMode === 'grid'}
          className={`rounded-md p-1.5 hover:bg-neutral-800 ${
            snapMode === 'grid' ? 'bg-neutral-800 text-indigo-400' : 'text-neutral-400'
          }`}
        >
          <Grid3x3 size={16} />
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
