import { Plus, X } from 'lucide-react'
import { useCanvasStore } from '../store/useCanvasStore'

/** Bottom strip for multi-page designs: switch, add, and delete pages (TPL-001). */
export function PageBar() {
  const pages = useCanvasStore((s) => s.pages)
  const activePageId = useCanvasStore((s) => s.activePageId)
  const selectPage = useCanvasStore((s) => s.selectPage)
  const addPage = useCanvasStore((s) => s.addPage)
  const deletePage = useCanvasStore((s) => s.deletePage)

  // Nothing to show until a project is loaded.
  if (pages.length === 0) return null

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-t border-neutral-800 bg-neutral-900 px-2">
      {pages.map((p, i) => {
        const active = p.id === activePageId
        return (
          <div
            key={p.id}
            className={`group flex items-center gap-1 rounded px-2 py-1 text-xs ${
              active ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:bg-neutral-800'
            }`}
          >
            <button onClick={() => selectPage(p.id)}>Page {i + 1}</button>
            {pages.length > 1 && (
              <button
                onClick={() => deletePage(p.id)}
                title="Delete page"
                className="text-neutral-500 opacity-0 transition group-hover:opacity-100 hover:text-red-400"
              >
                <X size={12} />
              </button>
            )}
          </div>
        )
      })}
      <button
        onClick={addPage}
        title="Add page"
        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
      >
        <Plus size={14} />
        Add page
      </button>
    </div>
  )
}
