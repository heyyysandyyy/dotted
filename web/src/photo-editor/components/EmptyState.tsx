import { ImagePlus } from 'lucide-react'

/**
 * Shown when no image is loaded into the session (PHOTO-001) — either a
 * fresh visit to the workspace, or after PHOTO-006 flattens and exits back
 * to Canvas. No existing component in the Canvas workspace matches this
 * shape (a full centered call-to-action) — its own "empty" states, e.g.
 * LayersPanel's "No layers yet", are small inline list placeholders, not
 * this. Built new rather than force-fitting one of those.
 *
 * The "Upload image" button is intentionally inert here — file-picker and
 * drag-and-drop wiring is PHOTO-002's own scope (issue #164), not
 * duplicated ahead of that ticket. It's still rendered now so the empty
 * state reads correctly and PHOTO-002 has a real element to attach behaviour
 * to, rather than building this same layout twice.
 */
export function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-editor-surface text-editor-text-muted">
        <ImagePlus size={24} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-editor-text">No image loaded</p>
        <p className="max-w-xs text-xs text-editor-text-muted">
          Upload an image to start editing, or choose "Edit" on an image in Canvas.
        </p>
      </div>
      <button
        type="button"
        className="mt-2 flex items-center gap-1.5 rounded-md bg-editor-surface-2 px-3 py-1.5 text-sm font-medium text-editor-text hover:bg-editor-surface-3"
      >
        <ImagePlus size={15} />
        Upload image
      </button>
    </div>
  )
}
