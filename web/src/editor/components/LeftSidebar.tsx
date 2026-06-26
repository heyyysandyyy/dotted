import { Square } from 'lucide-react'
import { useCanvasStore } from '../store/useCanvasStore'

export function LeftSidebar() {
  const addBox = useCanvasStore((s) => s.addBox)

  return (
    <aside className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-neutral-800 bg-neutral-900 py-2">
      <button
        onClick={addBox}
        title="Add box"
        className="flex h-12 w-12 flex-col items-center justify-center gap-1 rounded-lg text-[10px] text-neutral-300 hover:bg-neutral-800"
      >
        <Square size={18} />
        Box
      </button>
    </aside>
  )
}
