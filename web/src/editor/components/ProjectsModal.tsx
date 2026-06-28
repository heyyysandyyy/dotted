import { useRef, useState } from 'react'
import { Copy, Trash2, Download, Upload } from 'lucide-react'
import { useCanvasStore } from '../store/useCanvasStore'
import { exportBackup, importBackup, listProjects } from '../storage'
import { downloadUrl } from '../utils'

interface Props {
  open: boolean
  onClose: () => void
}

export function ProjectsModal({ open, onClose }: Props) {
  const currentProjectId = useCanvasStore((s) => s.currentProjectId)
  const openProject = useCanvasStore((s) => s.openProject)
  const deleteProjectById = useCanvasStore((s) => s.deleteProjectById)
  const duplicateProjectById = useCanvasStore((s) => s.duplicateProjectById)
  // Bump to re-read the project list after a delete / duplicate / restore.
  const [, forceRefresh] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const handleDuplicate = (id: string) => {
    duplicateProjectById(id)
    forceRefresh((n) => n + 1)
  }

  const handleBackup = () => {
    const blob = new Blob([JSON.stringify(exportBackup(), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    downloadUrl(url, `dotted-backup-${new Date().toISOString().slice(0, 10)}.json`)
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const handleRestoreFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      try {
        const count = importBackup(reader.result)
        setMessage(`Imported ${count} project${count === 1 ? '' : 's'}`)
        forceRefresh((n) => n + 1)
      } catch {
        setMessage('Could not read that backup file')
      }
    }
    reader.readAsText(file)
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
                  onClick={() => handleDuplicate(p.id)}
                  title="Duplicate project"
                  className="shrink-0 rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                >
                  <Copy size={16} />
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

        {message && <div className="mt-3 text-xs text-neutral-500">{message}</div>}

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={handleBackup}
            title="Download a JSON backup of all projects"
            className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-neutral-500"
          >
            <Download size={15} />
            Backup
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Restore projects from a JSON backup"
            className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-neutral-500"
          >
            <Upload size={15} />
            Restore
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleRestoreFile(file)
              // Reset so re-selecting the same file fires onChange again.
              e.target.value = ''
            }}
          />
          <button
            onClick={onClose}
            className="ml-auto rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:text-neutral-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
