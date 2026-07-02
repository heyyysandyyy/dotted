import type { StateCreator } from 'zustand'
import { GRID_SIZE, MIN_ZOOM, MAX_ZOOM } from '../constants'
import type { CanvasState, ViewSlice } from './storeTypes'

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

export const createViewSlice: StateCreator<CanvasState, [], [], ViewSlice> = (set, get) => ({
  zoom: 1,
  pan: { x: 0, y: 0 },
  fitMode: true,
  snapMode: 'guides',
  grid: { visible: false, size: GRID_SIZE, style: 'lines', snap: false },
  showRulers: true,
  rulerUnit: 'px',
  guides: { horizontal: [], vertical: [] },
  showGuides: true,
  snapGuides: true,
  activeGuides: { horizontal: [], vertical: [] },
  spreadView: 'sideBySide',

  // Manual zoom leaves fit-mode; a manual zoom recenters (pan reset) unless the
  // caller pans afterwards (scroll-wheel zoom sets pan itself).
  setZoom: (zoom) => set({ zoom: clampZoom(zoom), fitMode: false }),
  setZoomRaw: (zoom) => set({ zoom: clampZoom(zoom) }),
  fitToView: () => set({ fitMode: true }),
  setPan: (x, y) => set({ pan: { x, y } }),

  // Grid snap and alignment guides both control the drag, so they're mutually
  // exclusive — enabling one disables the other (UX-005).
  setSnapMode: (snapMode) =>
    set((s) => ({ snapMode, grid: snapMode === 'guides' ? { ...s.grid, snap: false } : s.grid })),

  toggleGrid: () => set((s) => ({ grid: { ...s.grid, visible: !s.grid.visible } })),
  setGridSize: (size) => set((s) => ({ grid: { ...s.grid, size: Math.max(1, Math.round(size)) } })),
  setGridStyle: (style) => set((s) => ({ grid: { ...s.grid, style } })),
  toggleGridSnap: () =>
    set((s) => {
      const snap = !s.grid.snap
      return { grid: { ...s.grid, snap }, snapMode: snap ? 'none' : s.snapMode }
    }),

  toggleRulers: () => set((s) => ({ showRulers: !s.showRulers })),

  setRulerUnit: (rulerUnit) => set({ rulerUnit }),

  addGuide: (orientation, pos) => {
    set((s) => ({ guides: { ...s.guides, [orientation]: [...s.guides[orientation], pos] } }))
    get().saveCurrentProject()
  },

  updateGuide: (orientation, index, pos) => {
    set((s) => {
      const next = s.guides[orientation].slice()
      if (index < 0 || index >= next.length) return s
      next[index] = pos
      return { guides: { ...s.guides, [orientation]: next } }
    })
    get().saveCurrentProject()
  },

  removeGuide: (orientation, index) => {
    set((s) => ({
      guides: { ...s.guides, [orientation]: s.guides[orientation].filter((_, i) => i !== index) },
    }))
    get().saveCurrentProject()
  },

  clearGuides: () => {
    set({ guides: { horizontal: [], vertical: [] } })
    get().saveCurrentProject()
  },

  toggleGuides: () => set((s) => ({ showGuides: !s.showGuides })),

  toggleSnapGuides: () => set((s) => ({ snapGuides: !s.snapGuides })),

  setActiveGuides: (activeGuides) => set({ activeGuides }),

  // Re-enable fit-mode so the new framing (whole spread vs. one page) takes
  // effect immediately, even if the user had previously zoomed manually.
  setSpreadView: (spreadView) => set({ spreadView, fitMode: true }),
})
