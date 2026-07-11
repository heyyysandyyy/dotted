import { create } from 'zustand'

/**
 * Identifies the Canvas object an image came from, captured at the moment
 * "Edit in Photo Editor" is clicked (PHOTO-003). PHOTO-006 uses this to
 * find that same object again and replace it in place — position, size,
 * and z-order are captured now because they're only readable while the
 * Canvas route (and its live fabric objects) is actually mounted.
 */
export interface PhotoEditorSourceRef {
  pageId: string
  objectId: string
  left: number
  top: number
  scaleX: number
  scaleY: number
  angle: number
  zIndex: number
}

/** Brightness/contrast adjustment values (PHOTO-004), each -100..100, 0 = no change. */
export interface PhotoAdjustments {
  brightness: number
  contrast: number
}

export const DEFAULT_ADJUSTMENTS: PhotoAdjustments = { brightness: 0, contrast: 0 }

const clampAdjustment = (v: number) => Math.max(-100, Math.min(100, v))

/**
 * Photo Editor session state (PHOTO-001). Deliberately its own store, not a
 * slice of useCanvasStore — Canvas and Photo Editor are separate workspaces
 * with no shared toolbars or state (three-workspace model), and this
 * session is explicitly ephemeral (flattened + discarded on exit per
 * PHOTO-006), unlike a Canvas project which persists to localStorage.
 *
 * Holds the loaded image, PHOTO-003's source reference, and PHOTO-004's
 * adjustment values; PHOTO-005 (undo/redo stack) extends this as its own
 * ticket lands rather than being stubbed out ahead of time here.
 */
interface PhotoEditorState {
  /** The loaded image, as a data URL — null means the empty state shows. */
  image: string | null
  /** Set only when the image arrived via Edit-from-Canvas; null for a direct upload (PHOTO-002). */
  sourceRef: PhotoEditorSourceRef | null
  /** Live adjustment values for the current image — reset whenever a new image loads (PHOTO-004). */
  adjustments: PhotoAdjustments
  setImage: (image: string | null) => void
  /** PHOTO-003: entry point from a Canvas image's "Edit in Photo Editor" action. */
  openFromCanvas: (image: string, sourceRef: PhotoEditorSourceRef) => void
  /** Set one adjustment value, clamped to -100..100. */
  setAdjustment: (key: keyof PhotoAdjustments, value: number) => void
  /** Reset one adjustment back to 0 (neutral). */
  resetAdjustment: (key: keyof PhotoAdjustments) => void
}

export const usePhotoEditorStore = create<PhotoEditorState>((set) => ({
  image: null,
  sourceRef: null,
  adjustments: DEFAULT_ADJUSTMENTS,
  setImage: (image) => set({ image, sourceRef: null, adjustments: DEFAULT_ADJUSTMENTS }),
  openFromCanvas: (image, sourceRef) => set({ image, sourceRef, adjustments: DEFAULT_ADJUSTMENTS }),
  setAdjustment: (key, value) =>
    set((s) => ({ adjustments: { ...s.adjustments, [key]: clampAdjustment(value) } })),
  resetAdjustment: (key) => set((s) => ({ adjustments: { ...s.adjustments, [key]: 0 } })),
}))
