import { useCanvasStore } from '../store/useCanvasStore'

interface Props {
  onNewDesign: () => void
}

export function TopBar({ onNewDesign }: Props) {
  const zoom = useCanvasStore((s) => s.zoom)
  const width = useCanvasStore((s) => s.width)
  const height = useCanvasStore((s) => s.height)

  return (
    <header className="flex h-12 items-center gap-3 border-b border-neutral-800 bg-neutral-900 px-3 text-neutral-200">
      <span className="font-semibold tracking-tight">dotted</span>

      <button
        onClick={onNewDesign}
        className="rounded-md bg-neutral-700 px-3 py-1.5 text-sm font-medium hover:bg-neutral-600"
      >
        New design
      </button>

      <div className="ml-auto flex items-center gap-3 text-xs text-neutral-400">
        <span>
          {width} × {height}
        </span>
        <span>{Math.round(zoom * 100)}%</span>
      </div>
    </header>
  )
}
