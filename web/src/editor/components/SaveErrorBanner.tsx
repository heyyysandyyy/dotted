import { AlertTriangle, X } from 'lucide-react'
import { useCanvasStore } from '../store/useCanvasStore'

/**
 * Surfaces a failed autosave (storage.ts's saveProject "fails soft" on a
 * localStorage quota error) instead of letting it fail silently — the exact
 * gap that made a large image upload look like it worked, then vanish on
 * the next reload with no explanation.
 */
export function SaveErrorBanner() {
  const saveError = useCanvasStore((s) => s.saveError)
  const setSaveError = useCanvasStore((s) => s.setSaveError)

  if (!saveError) return null

  return (
    <div className="flex items-center gap-2 border-b border-red-700 bg-red-600 px-4 py-2 text-sm text-white">
      <AlertTriangle size={15} className="shrink-0" />
      <span className="flex-1">{saveError}</span>
      <button
        onClick={() => setSaveError(null)}
        title="Dismiss"
        className="rounded p-1 hover:bg-red-700"
      >
        <X size={14} />
      </button>
    </div>
  )
}
