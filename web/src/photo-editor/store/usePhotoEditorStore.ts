import { create } from 'zustand'

/**
 * Photo Editor session state (PHOTO-001). Deliberately its own store, not a
 * slice of useCanvasStore — Canvas and Photo Editor are separate workspaces
 * with no shared toolbars or state (three-workspace model), and this
 * session is explicitly ephemeral (flattened + discarded on exit per
 * PHOTO-006), unlike a Canvas project which persists to localStorage.
 *
 * Only holds the loaded image for now; PHOTO-003 (source element reference),
 * PHOTO-004 (adjustment values), and PHOTO-005 (undo/redo stack) extend this
 * as their own tickets land rather than being stubbed out ahead of time here.
 */
interface PhotoEditorState {
  /** The loaded image, as a data URL — null means the empty state shows. */
  image: string | null
  setImage: (image: string | null) => void
}

export const usePhotoEditorStore = create<PhotoEditorState>((set) => ({
  image: null,
  setImage: (image) => set({ image }),
}))
