import { create } from 'zustand'
import { useCanvasStore } from './useCanvasStore'
import { EXTRA_PROPS, type PageData } from '../storage'

const MAX_STATES = 50
const DEBOUNCE_MS = 300

let debounceTimer: ReturnType<typeof setTimeout> | null = null

/** A history entry: the whole multi-page project state, so page add/delete/
 *  duplicate are undoable alongside in-page edits (TPL-001). */
interface ProjectSnapshot {
  pages: PageData[]
  activePageId: string
}

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
  const { canvas, pages, activePageId, currentProjectId } = useCanvasStore.getState()
  if (!canvas || !currentProjectId || pages.length === 0) return null
  // Sync the active page from the live canvas, then capture all pages.
  const synced = pages.map((p) =>
    p.id === activePageId ? { ...p, canvas: canvas.toObject(EXTRA_PROPS) } : p,
  )
  return JSON.stringify({ pages: synced, activePageId } satisfies ProjectSnapshot)
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
  const { pages, activePageId } = JSON.parse(json) as ProjectSnapshot
  // Restore the whole project state (pages + active page) onto the canvas.
  useCanvasStore
    .getState()
    .applyHistorySnapshot(pages, activePageId)
    .then(() => {
      const stackLen = useHistoryStore.getState().stack.length
      set({
        isRestoring: false,
        index: newIndex,
        canUndo: newIndex > 0,
        canRedo: newIndex < stackLen - 1,
      })
      useCanvasStore.getState().setSelection([])
      // Persist the post-undo/redo state so a reload restores what's on screen.
      persist()
    })
}
