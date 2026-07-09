import { useRef } from 'react'
import { Copy, ClipboardPaste, Paintbrush } from 'lucide-react'
import { useCanvasStore } from '../store/useCanvasStore'

/**
 * UX-007: copy/paste style + format painter, shown when objects are selected.
 * Painter: single-click = paste on the next clicked object then exit;
 * double-click = sticky (Escape exits).
 */
export function StyleTools() {
  const selection = useCanvasStore((s) => s.selection)
  const clipboardStyle = useCanvasStore((s) => s.clipboardStyle)
  const painterMode = useCanvasStore((s) => s.painterMode)
  const copyStyle = useCanvasStore((s) => s.copyStyle)
  const pasteStyle = useCanvasStore((s) => s.pasteStyle)
  const startPainter = useCanvasStore((s) => s.startPainter)
  const exitPainter = useCanvasStore((s) => s.exitPainter)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  if (selection.length === 0) return null

  const btn =
    'flex items-center gap-1 rounded px-2 py-1 text-xs text-editor-text-secondary hover:bg-editor-surface'

  const onPainterClick = () => {
    if (painterMode !== 'off') {
      exitPainter()
      return
    }
    if (clickTimer.current) return // second click of a double-click — let dblclick handle it
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null
      startPainter(false)
    }, 220)
  }
  const onPainterDblClick = () => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
    }
    if (painterMode !== 'off') exitPainter()
    else startPainter(true)
  }

  return (
    <div className="space-y-2 border-t border-editor p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-editor-text-subtle">Style</div>
      <div className="flex flex-wrap gap-1">
        <button onClick={copyStyle} title="Copy style (Cmd/Ctrl+Alt+C)" className={btn}>
          <Copy size={14} /> Copy
        </button>
        <button
          onClick={pasteStyle}
          disabled={!clipboardStyle}
          title="Paste style (Cmd/Ctrl+Alt+V)"
          className={`${btn} disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent`}
        >
          <ClipboardPaste size={14} /> Paste
        </button>
        <button
          onClick={onPainterClick}
          onDoubleClick={onPainterDblClick}
          title="Format painter — click: paste once, double-click: sticky (Esc to exit)"
          aria-pressed={painterMode !== 'off'}
          className={`${btn} ${painterMode !== 'off' ? 'bg-editor-surface text-indigo-400' : ''}`}
        >
          <Paintbrush size={14} />
          {painterMode === 'sticky' ? 'Painter (sticky)' : 'Painter'}
        </button>
      </div>
    </div>
  )
}
