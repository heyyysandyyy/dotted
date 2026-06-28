import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useCanvasStore } from '../store/useCanvasStore'
import { listProjects } from '../storage'

interface Props {
  open: boolean
  onClose: () => void
}

export function ProjectsModal({ open, onClose }: Props) {
  const currentProjectId = useCanvasStore((s) => s.currentProjectId)
  const openProject = useCanvasStore((s) => s.openProject)
  const deleteProjectById = useCanvasStore((s) => s.deleteProjectById)
  // Bump to re-read the project list after a delete.
  const [, forceRefresh] = useState(0)

  if (!open) return null

  // Read straight from storage each render while open, so the list is fresh.
  const projects = listProjects()

  const handleOpen = (id: string) => {
    openProject(id)
    onClose()
  }

  const handleDelete = (id: string) => {
    deleteProjectById(id)
    forceRefresh((n) => n + 1)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-[480px] rounded-xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-neutral-900">Projects</h2>

        {projects.length === 0 ? (
          <div className="py-8 text-center text-sm text-neutral-500">No saved projects yet</div>
        ) : (
          <ul className="max-h-[60vh] divide-y divide-neutral-100 overflow-y-auto">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <button onClick={() => handleOpen(p.id)} className="flex-1 overflow-hidden text-left">
                  <div className="flex items-center gap-2 text-sm font-medium text-neutral-900">
                    <span className="truncate">{p.name || 'Untitled design'}</span>
                    {p.id === currentProjectId && (
                      <span className="shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-indigo-700">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {p.width} × {p.height} · {new Date(p.updatedAt).toLocaleString()}
                  </div>
                </button>
                <button
                  onClick={() => handleDelete(p.id)}
                  title="Delete project"
                  className="shrink-0 rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:text-neutral-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
