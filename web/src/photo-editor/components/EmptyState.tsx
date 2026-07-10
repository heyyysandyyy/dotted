import { useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { usePhotoEditorStore } from '../store/usePhotoEditorStore'
import { validateImageFile } from '../utils/validateImageFile'
import { readImageFile } from '../utils/readImageFile'
import { downscaleDataUrl } from '../../lib/downscaleImage'

const ACCEPT = 'image/jpeg,image/png'

/**
 * Shown when no image is loaded into the session (PHOTO-001) — either a
 * fresh visit to the workspace, or after PHOTO-006 flattens and exits back
 * to Canvas. No existing component in the Canvas workspace matches this
 * shape (a full centered call-to-action) — its own "empty" states, e.g.
 * LayersPanel's "No layers yet", are small inline list placeholders, not
 * this. Built new rather than force-fitting one of those.
 *
 * PHOTO-002 (issue #164): file picker + native OS drag-and-drop, both
 * funnelled through the same handleFile so validation/error display is one
 * code path. JPG/PNG only for v1 — Canvas's own upload (LeftSidebar.tsx)
 * accepts a wider set, but this ticket deliberately doesn't touch that path.
 */
export function EmptyState() {
  const setImage = usePhotoEditorStore((s) => s.setImage)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    const validationError = validateImageFile(file)
    if (validationError) {
      setError(validationError)
      return
    }
    try {
      const dataUrl = await readImageFile(file)
      // Reasonable max size handling (issue #164's own AC) — also keeps this
      // image within budget for the eventual port-back into Canvas's
      // localStorage-only persistence (PHOTO-006).
      const finalUrl = await downscaleDataUrl(dataUrl, file.type).catch(() => dataUrl)
      setError(null)
      setImage(finalUrl)
    } catch {
      setError('Could not read that file — please try again.')
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragActive(true)
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragActive(false)
        void handleFile(e.dataTransfer.files?.[0])
      }}
      className={`flex h-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed text-center transition-colors ${
        dragActive ? 'border-indigo-400 bg-editor-surface' : 'border-transparent'
      }`}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-editor-surface text-editor-text-muted">
        <ImagePlus size={24} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-editor-text">No image loaded</p>
        <p className="max-w-xs text-xs text-editor-text-muted">
          Drag and drop a JPG or PNG here, upload one, or choose "Edit" on an
          image in Canvas.
        </p>
      </div>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="mt-2 flex items-center gap-1.5 rounded-md bg-editor-surface-2 px-3 py-1.5 text-sm font-medium text-editor-text hover:bg-editor-surface-3"
      >
        <ImagePlus size={15} />
        Upload image
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {error && <p className="max-w-xs text-xs text-red-400">{error}</p>}
    </div>
  )
}
