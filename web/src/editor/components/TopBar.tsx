import {
  Undo2,
  Redo2,
  Download,
  FolderOpen,
  Magnet,
  LayoutTemplate,
  Ruler,
  Crosshair,
  Trash2,
  Sun,
  Moon,
} from 'lucide-react'
import { SIZE_UNITS, type UnitId } from '../constants'
import { useCanvasStore } from '../store/useCanvasStore'
import { GridControls } from './GridControls'
import { useHistoryStore } from '../store/useHistoryStore'
import { useThemeStore } from '../store/useThemeStore'

interface Props {
  onNewDesign: () => void
  onTemplates: () => void
  onProjects: () => void
  onExport: () => void
}

export function TopBar({ onNewDesign, onTemplates, onProjects, onExport }: Props) {
  const zoom = useCanvasStore((s) => s.zoom)
  const width = useCanvasStore((s) => s.width)
  const height = useCanvasStore((s) => s.height)
  const designName = useCanvasStore((s) => s.designName)
  const setDesignName = useCanvasStore((s) => s.setDesignName)
  const renameProject = useCanvasStore((s) => s.renameProject)
  const snapMode = useCanvasStore((s) => s.snapMode)
  const setSnapMode = useCanvasStore((s) => s.setSnapMode)
  const showRulers = useCanvasStore((s) => s.showRulers)
  const toggleRulers = useCanvasStore((s) => s.toggleRulers)
  const rulerUnit = useCanvasStore((s) => s.rulerUnit)
  const setRulerUnit = useCanvasStore((s) => s.setRulerUnit)
  const snapGuides = useCanvasStore((s) => s.snapGuides)
  const toggleSnapGuides = useCanvasStore((s) => s.toggleSnapGuides)
  const clearGuides = useCanvasStore((s) => s.clearGuides)
  const hasGuides = useCanvasStore((s) => s.guides.horizontal.length + s.guides.vertical.length > 0)
  const spreadView = useCanvasStore((s) => s.spreadView)
  const setSpreadView = useCanvasStore((s) => s.setSpreadView)
  const isSpreadPage = useCanvasStore((s) => s.pages.find((p) => p.id === s.activePageId)?.type === 'spread')

  const canUndo = useHistoryStore((s) => s.canUndo)
  const canRedo = useHistoryStore((s) => s.canRedo)
  const undo = useHistoryStore((s) => s.undo)
  const redo = useHistoryStore((s) => s.redo)

  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)

  return (
    <header className="flex h-12 items-center gap-3 border-b border-editor bg-editor-bg px-3 text-editor-text">
      <span className="font-semibold tracking-tight">dotted</span>

      <button
        onClick={onNewDesign}
        className="rounded-md bg-editor-surface-2 px-3 py-1.5 text-sm font-medium hover:bg-editor-surface-3"
      >
        New design
      </button>

      <button
        onClick={onTemplates}
        title="Templates"
        className="flex items-center gap-1.5 rounded-md bg-editor-surface-2 px-3 py-1.5 text-sm font-medium hover:bg-editor-surface-3"
      >
        <LayoutTemplate size={15} />
        Templates
      </button>

      <button
        onClick={onProjects}
        title="Projects"
        className="flex items-center gap-1.5 rounded-md bg-editor-surface-2 px-3 py-1.5 text-sm font-medium hover:bg-editor-surface-3"
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
        className="w-48 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-editor-text hover:border-editor-strong focus:border-editor-input focus:bg-editor-surface focus:outline-none"
      />

      <div className="flex items-center gap-1">
        <button
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Cmd/Ctrl+Z)"
          className="rounded-md p-1.5 hover:bg-editor-surface disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Undo2 size={16} />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Cmd/Ctrl+Shift+Z)"
          className="rounded-md p-1.5 hover:bg-editor-surface disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Redo2 size={16} />
        </button>
      </div>

      {/* Snapping: alignment guides (CLR-004) and the grid overlay/snap (UX-005)
          are independent. */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setSnapMode(snapMode === 'guides' ? 'none' : 'guides')}
          title="Alignment guides"
          aria-pressed={snapMode === 'guides'}
          className={`rounded-md p-1.5 hover:bg-editor-surface ${
            snapMode === 'guides' ? 'bg-editor-surface text-indigo-400' : 'text-editor-text-muted'
          }`}
        >
          <Magnet size={16} />
        </button>
        <GridControls />
        <button
          onClick={toggleRulers}
          title="Rulers (Cmd/Ctrl+R)"
          aria-pressed={showRulers}
          className={`rounded-md p-1.5 hover:bg-editor-surface ${
            showRulers ? 'bg-editor-surface text-indigo-400' : 'text-editor-text-muted'
          }`}
        >
          <Ruler size={16} />
        </button>
        <select
          value={rulerUnit}
          onChange={(e) => setRulerUnit(e.target.value as UnitId)}
          title="Ruler units"
          aria-label="Ruler units"
          className="rounded-md bg-editor-surface px-1.5 py-1 text-xs text-editor-text-secondary hover:bg-editor-surface-2"
        >
          {SIZE_UNITS.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </select>
        <button
          onClick={toggleSnapGuides}
          title="Snap to guides"
          aria-pressed={snapGuides}
          className={`rounded-md p-1.5 hover:bg-editor-surface ${
            snapGuides ? 'bg-editor-surface text-indigo-400' : 'text-editor-text-muted'
          }`}
        >
          <Crosshair size={16} />
        </button>
        <button
          onClick={clearGuides}
          disabled={!hasGuides}
          title="Clear all guides"
          className="rounded-md p-1.5 text-editor-text-muted hover:bg-editor-surface disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="ml-auto flex items-center gap-3 text-xs text-editor-text-muted">
        {isSpreadPage && (
          <div className="flex items-center rounded-md bg-editor-surface p-0.5 text-xs">
            <button
              onClick={() => setSpreadView('sideBySide')}
              aria-pressed={spreadView === 'sideBySide'}
              className={`rounded px-2 py-1 font-medium ${
                spreadView === 'sideBySide' ? 'bg-editor-surface-2 text-editor-text-strong' : 'text-editor-text-muted'
              }`}
            >
              Side by side
            </button>
            <button
              onClick={() => setSpreadView('single')}
              aria-pressed={spreadView === 'single'}
              className={`rounded px-2 py-1 font-medium ${
                spreadView === 'single' ? 'bg-editor-surface-2 text-editor-text-strong' : 'text-editor-text-muted'
              }`}
            >
              Single page
            </button>
          </div>
        )}
        <button
          onClick={() => window.dispatchEvent(new Event('dotted:resize-canvas'))}
          title="Resize canvas (Cmd/Ctrl+Shift+R)"
          className="rounded px-1.5 py-0.5 hover:bg-editor-surface hover:text-editor-text"
        >
          {width} × {height}
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="rounded-md p-1.5 text-editor-text-muted hover:bg-editor-surface hover:text-editor-text"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
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
