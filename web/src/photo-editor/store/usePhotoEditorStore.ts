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

const HISTORY_DEBOUNCE_MS = 300
// Module-level like useHistoryStore's own debounceTimer (Canvas) — a drag
// gesture fires many onChange calls; only the settled value after a pause
// becomes one undo step, not one step per pixel of drag.
let historyDebounceTimer: ReturnType<typeof setTimeout> | null = null

function sameAdjustments(a: PhotoAdjustments, b: PhotoAdjustments): boolean {
  return a.brightness === b.brightness && a.contrast === b.contrast
}

/**
 * Photo Editor session state (PHOTO-001). Deliberately its own store, not a
 * slice of useCanvasStore — Canvas and Photo Editor are separate workspaces
 * with no shared toolbars or state (three-workspace model), and this
 * session is explicitly ephemeral (flattened + discarded on exit per
 * PHOTO-006), unlike a Canvas project which persists to localStorage.
 *
 * Holds the loaded image, PHOTO-003's source reference, PHOTO-004's
 * adjustment values, and PHOTO-005's undo/redo stack for them — a simple
 * linear stack of adjustment snapshots, session-scoped only (reset whenever
 * a new image loads, same as the adjustments themselves).
 */
interface PhotoEditorState {
  /** The loaded image, as a data URL — null means the empty state shows. */
  image: string | null
  /** Set only when the image arrived via Edit-from-Canvas; null for a direct upload (PHOTO-002). */
  sourceRef: PhotoEditorSourceRef | null
  /** Live adjustment values for the current image — reset whenever a new image loads (PHOTO-004). */
  adjustments: PhotoAdjustments
  /** Committed adjustment snapshots (PHOTO-005); historyIndex points at the current one. */
  historyStack: PhotoAdjustments[]
  historyIndex: number
  setImage: (image: string | null) => void
  /** PHOTO-003: entry point from a Canvas image's "Edit in Photo Editor" action. */
  openFromCanvas: (image: string, sourceRef: PhotoEditorSourceRef) => void
  /** Set one adjustment value, clamped to -100..100. Debounced into one undo step per settled change. */
  setAdjustment: (key: keyof PhotoAdjustments, value: number) => void
  /** Reset one adjustment back to 0 (neutral) — itself undoable. */
  resetAdjustment: (key: keyof PhotoAdjustments) => void
  undo: () => void
  redo: () => void
}

function resetHistory(): { historyStack: PhotoAdjustments[]; historyIndex: number } {
  if (historyDebounceTimer) {
    clearTimeout(historyDebounceTimer)
    historyDebounceTimer = null
  }
  return { historyStack: [DEFAULT_ADJUSTMENTS], historyIndex: 0 }
}

export const usePhotoEditorStore = create<PhotoEditorState>((set, get) => ({
  image: null,
  sourceRef: null,
  adjustments: DEFAULT_ADJUSTMENTS,
  historyStack: [DEFAULT_ADJUSTMENTS],
  historyIndex: 0,

  setImage: (image) => set({ image, sourceRef: null, adjustments: DEFAULT_ADJUSTMENTS, ...resetHistory() }),
  openFromCanvas: (image, sourceRef) =>
    set({ image, sourceRef, adjustments: DEFAULT_ADJUSTMENTS, ...resetHistory() }),

  setAdjustment: (key, value) => {
    const adjustments = { ...get().adjustments, [key]: clampAdjustment(value) }
    set({ adjustments })
    if (historyDebounceTimer) clearTimeout(historyDebounceTimer)
    historyDebounceTimer = setTimeout(() => {
      historyDebounceTimer = null
      const { historyStack, historyIndex, adjustments: current } = get()
      if (sameAdjustments(historyStack[historyIndex], current)) return
      const nextStack = [...historyStack.slice(0, historyIndex + 1), current]
      set({ historyStack: nextStack, historyIndex: nextStack.length - 1 })
    }, HISTORY_DEBOUNCE_MS)
  },

  resetAdjustment: (key) => get().setAdjustment(key, 0),

  undo: () => {
    if (historyDebounceTimer) {
      clearTimeout(historyDebounceTimer)
      historyDebounceTimer = null
    }
    const { historyStack, historyIndex } = get()
    if (historyIndex <= 0) return
    const newIndex = historyIndex - 1
    set({ historyIndex: newIndex, adjustments: historyStack[newIndex] })
  },

  redo: () => {
    if (historyDebounceTimer) {
      clearTimeout(historyDebounceTimer)
      historyDebounceTimer = null
    }
    const { historyStack, historyIndex } = get()
    if (historyIndex >= historyStack.length - 1) return
    const newIndex = historyIndex + 1
    set({ historyIndex: newIndex, adjustments: historyStack[newIndex] })
  },
}))
