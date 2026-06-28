import { create } from 'zustand'
import { useCanvasStore } from './useCanvasStore'

const MAX_STATES = 50
const DEBOUNCE_MS = 300

/** Extra fabric props to persist in snapshots (custom ids, names, etc.). */
const SNAPSHOT_PROPS = ['selectable', 'name', 'id']

let debounceTimer: ReturnType<typeof setTimeout> | null = null

interface HistoryState {
  stack: string[]
  index: number
  isRestoring: boolean
  canUndo: boolean
  canRedo: boolean

  /** Reset history with the current canvas as the baseline snapshot. */
  reset: () => void
  /** Capture the current canvas state immediately. */
  record: () => void
  /** Capture after 300ms of quiescence (per the debounce rule). */
  scheduleRecord: () => void
  undo: () => void
  redo: () => void
}

function snapshot(): string | null {
  const canvas = useCanvasStore.getState().canvas
  if (!canvas) return null
  // fabric 7: toJSON() no longer takes propertiesToInclude; toObject() does.
  return JSON.stringify(canvas.toObject(SNAPSHOT_PROPS))
}

/** Auto-save the current project to localStorage (SAV-001 / SAV-002 / TPL-001). */
function persist(): void {
  useCanvasStore.getState().saveCurrentProject()
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  stack: [],
  index: -1,
  isRestoring: false,
  canUndo: false,
  canRedo: false,

  reset: () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    const snap = snapshot()
    set({
      stack: snap ? [snap] : [],
      index: snap ? 0 : -1,
      canUndo: false,
      canRedo: false,
    })
  },

  record: () => {
    const { isRestoring, stack, index } = get()
    if (isRestoring) return
    const snap = snapshot()
    if (snap == null) return
    if (stack[index] === snap) return // no real change

    // Drop any redo branch, then append.
    let next = stack.slice(0, index + 1)
    next.push(snap)
    // Cap at MAX_STATES, dropping the oldest.
    if (next.length > MAX_STATES) next = next.slice(next.length - MAX_STATES)
    const newIndex = next.length - 1
    set({
      stack: next,
      index: newIndex,
      canUndo: newIndex > 0,
      canRedo: false,
    })
    // Every committed change is auto-saved (debounced via scheduleRecord).
    persist()
  },

  scheduleRecord: () => {
    if (get().isRestoring) return
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => get().record(), DEBOUNCE_MS)
  },

  undo: () => {
    const { index, stack } = get()
    if (index <= 0) return
    restore(stack[index - 1], index - 1, set)
  },

  redo: () => {
    const { index, stack } = get()
    if (index >= stack.length - 1) return
    restore(stack[index + 1], index + 1, set)
  },
}))

function restore(
  json: string,
  newIndex: number,
  set: (partial: Partial<HistoryState>) => void,
) {
  const canvas = useCanvasStore.getState().canvas
  if (!canvas) return
  if (debounceTimer) clearTimeout(debounceTimer)
  set({ isRestoring: true })
  // fabric 7: loadFromJSON returns a Promise; the second arg is now a
  // per-object reviver, so completion logic moves to .then().
  canvas.loadFromJSON(JSON.parse(json)).then(() => {
    canvas.renderAll()
    const stackLen = useHistoryStore.getState().stack.length
    set({
      isRestoring: false,
      index: newIndex,
      canUndo: newIndex > 0,
      canRedo: newIndex < stackLen - 1,
    })
    // Selection is cleared by loadFromJSON; reflect that.
    useCanvasStore.getState().setSelection([])
    // Keep the background-colour read-out in sync with the restored canvas.
    useCanvasStore.getState().syncBackgroundFromCanvas()
    // Persist the post-undo/redo state so a reload restores what's on screen.
    persist()
  })
}
