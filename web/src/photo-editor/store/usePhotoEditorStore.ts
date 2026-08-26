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

/**
 * Tonal and colour adjustment values for the loaded image.
 *
 * Numeric fields are all -100..100 with 0 = no change, deliberately on one
 * shared scale so a single clamp and a single slider component cover every
 * one of them — `hue` is the only field whose unit isn't really "percent":
 * its ±100 maps to a ±180° rotation of the colour wheel (see colorPass.ts).
 *
 * Grouped by the phase that added them: brightness/contrast (PHOTO-004);
 * exposure/highlights/shadows (PHOTO-007 tone-controls phase); everything
 * from `saturation` down (PHOTO-007 colour-controls phase).
 */
export interface PhotoAdjustments {
  brightness: number
  contrast: number
  exposure: number
  highlights: number
  shadows: number
  saturation: number
  vibrance: number
  hue: number
  temperature: number
  tint: number
  redBalance: number
  greenBalance: number
  blueBalance: number
  blackAndWhite: boolean
  invert: boolean
}

/** The -100..100 slider-backed fields, split off the on/off ones so
 *  setAdjustment/AdjustmentSlider can't be pointed at a boolean (and
 *  setToggle can't be pointed at a number) by mistake. */
export type NumericAdjustmentKey = {
  [K in keyof PhotoAdjustments]: PhotoAdjustments[K] extends number ? K : never
}[keyof PhotoAdjustments]

/** The on/off fields — full black & white conversion and invert. */
export type ToggleAdjustmentKey = {
  [K in keyof PhotoAdjustments]: PhotoAdjustments[K] extends boolean ? K : never
}[keyof PhotoAdjustments]

export const DEFAULT_ADJUSTMENTS: PhotoAdjustments = {
  brightness: 0,
  contrast: 0,
  exposure: 0,
  highlights: 0,
  shadows: 0,
  saturation: 0,
  vibrance: 0,
  hue: 0,
  temperature: 0,
  tint: 0,
  redBalance: 0,
  greenBalance: 0,
  blueBalance: 0,
  blackAndWhite: false,
  invert: false,
}

const clampAdjustment = (v: number) => Math.max(-100, Math.min(100, v))

const HISTORY_DEBOUNCE_MS = 300
// Module-level like useHistoryStore's own debounceTimer (Canvas) — a drag
// gesture fires many onChange calls; only the settled value after a pause
// becomes one undo step, not one step per pixel of drag.
let historyDebounceTimer: ReturnType<typeof setTimeout> | null = null

function sameAdjustments(a: PhotoAdjustments, b: PhotoAdjustments): boolean {
  return (Object.keys(DEFAULT_ADJUSTMENTS) as (keyof PhotoAdjustments)[]).every((key) => a[key] === b[key])
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
  /** Set one slider-backed adjustment, clamped to -100..100. Debounced into one undo step per settled change. */
  setAdjustment: (key: NumericAdjustmentKey, value: number) => void
  /** Set one on/off adjustment (black & white, invert) — undoable on the same debounced path. */
  setToggle: (key: ToggleAdjustmentKey, value: boolean) => void
  /** Reset one adjustment back to its neutral default — itself undoable. */
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

export const usePhotoEditorStore = create<PhotoEditorState>((set, get) => {
  /** Applies one field change live and schedules the debounced history push —
   *  the single write path every setter below funnels through, so a slider
   *  drag, a checkbox click and a reset all coalesce the same way. */
  const commit = <K extends keyof PhotoAdjustments>(key: K, value: PhotoAdjustments[K]) => {
    const adjustments = { ...get().adjustments, [key]: value }
    set({ adjustments })
    if (historyDebounceTimer) clearTimeout(historyDebounceTimer)
    historyDebounceTimer = setTimeout(() => {
      historyDebounceTimer = null
      const { historyStack, historyIndex, adjustments: current } = get()
      if (sameAdjustments(historyStack[historyIndex], current)) return
      const nextStack = [...historyStack.slice(0, historyIndex + 1), current]
      set({ historyStack: nextStack, historyIndex: nextStack.length - 1 })
    }, HISTORY_DEBOUNCE_MS)
  }

  return {
    image: null,
    sourceRef: null,
    adjustments: DEFAULT_ADJUSTMENTS,
    historyStack: [DEFAULT_ADJUSTMENTS],
    historyIndex: 0,

    setImage: (image) => set({ image, sourceRef: null, adjustments: DEFAULT_ADJUSTMENTS, ...resetHistory() }),
    openFromCanvas: (image, sourceRef) =>
      set({ image, sourceRef, adjustments: DEFAULT_ADJUSTMENTS, ...resetHistory() }),

    setAdjustment: (key, value) => commit(key, clampAdjustment(value)),

    setToggle: (key, value) => commit(key, value),

    resetAdjustment: (key) => commit(key, DEFAULT_ADJUSTMENTS[key]),

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
  }
})
