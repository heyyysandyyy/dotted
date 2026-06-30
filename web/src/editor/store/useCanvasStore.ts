import { create } from 'zustand'
import * as fabric from 'fabric'
import { DEFAULT_WIDTH, DEFAULT_HEIGHT, GRID_SIZE, type UnitId } from '../constants'
import { getLastFont, loadGoogleFont, GOOGLE_FONTS } from '../fonts'
import {
  saveProject,
  loadProject,
  deleteProject,
  duplicateProject,
  listProjects,
  setCurrentProjectId,
  saveTemplate,
  loadTemplate,
  EXTRA_PROPS,
  EMPTY_GUIDES,
  type PageData,
  type Guides,
} from '../storage'
import type { StarterTemplate } from '../templates'
import { kindName } from '../utils'

/**
 * Lazy-load every Google font used by the canvas's text and repaint once each
 * is ready. A loaded project stores only font *names*; without this the canvas
 * paints them with the fallback font until the font is fetched (BUG-001 on load).
 */
function loadCanvasFonts(canvas: fabric.Canvas): void {
  const families = new Set<string>()
  for (const o of canvas.getObjects()) {
    const family = (o as unknown as { fontFamily?: string }).fontFamily
    if (typeof family === 'string' && GOOGLE_FONTS.includes(family)) families.add(family)
  }
  families.forEach((family) => loadGoogleFont(family).then(() => canvas.requestRenderAll()))
}

/** Serialize the live canvas into a page payload. */
function serializeCanvas(canvas: fabric.Canvas): object {
  return canvas.toObject(EXTRA_PROPS)
}

const TEXT_PROP_KEYS = [
  'text',
  'fontSize',
  'fontFamily',
  'fontWeight',
  'fontStyle',
  'textAlign',
  'lineHeight',
  'underline',
]

/**
 * Fire `object:modified` carrying a history label. Fabric's typed event map
 * doesn't allow extra fields, so the label is attached via a cast; it rides
 * along at runtime for the history-panel handler in CanvasStage.
 */
function fireModified(canvas: fabric.Canvas, target: fabric.FabricObject, historyLabel: string) {
  canvas.fire('object:modified', { target, historyLabel } as unknown as never)
}

/** History label for an `updateActive` change, inferred from which props moved. */
function labelForProps(props: object): string {
  const keys = Object.keys(props)
  if (keys.includes('fill')) return 'Changed fill color'
  if (keys.includes('stroke') || keys.includes('strokeWidth')) return 'Changed stroke'
  if (keys.includes('opacity')) return 'Changed opacity'
  if (keys.some((k) => TEXT_PROP_KEYS.includes(k))) return 'Edited text'
  return 'Changed style'
}

import { useHistoryStore } from './useHistoryStore'

const DEFAULT_NAME = 'Untitled design'

export type ShapeKind =
  | 'rect'
  | 'roundedRect'
  | 'ellipse'
  | 'triangle'
  | 'line'
  | 'arrow'

/** Drag-time alignment-guide snapping (CLR-004): off, or smart guides. */
export type SnapMode = 'none' | 'guides'

/** Grid overlay rendering style (UX-005). */
export type GridStyle = 'lines' | 'dots'

/** Grid overlay + snap settings (UX-005). */
export interface GridSettings {
  visible: boolean
  size: number
  style: GridStyle
  snap: boolean
}

/** Canvas view: edit one page, or see all pages stacked (TPL-001). */
export type ViewMode = 'single' | 'stack'

const SHAPE_FILL = '#4f46e5'
const SHAPE_STROKE = '#111111'

interface CanvasState {
  /** The live Fabric.js canvas instance. Components must never mutate it directly. */
  canvas: fabric.Canvas | null
  width: number
  height: number
  /** Display scale applied to the artboard so it fits the viewport. */
  zoom: number
  /** Currently selected objects (mirror of fabric's active selection). */
  selection: fabric.FabricObject[]
  /** Bumped whenever a selected object is transformed, to refresh read-outs. */
  tick: number
  /** Editable name of the open project (used for filenames and the project list). */
  designName: string
  /** Id of the project currently open in the editor (null before first load). */
  currentProjectId: string | null
  /** Pages of the open design; the active page's content lives in the canvas. */
  pages: PageData[]
  /** Id of the page currently shown on the canvas. */
  activePageId: string
  /** Whether the editor shows one page or all pages stacked. */
  viewMode: ViewMode
  /** Mirror of the artboard's solid background colour ('' when transparent). */
  backgroundColor: string
  /** Drag-time alignment-guide snapping (CLR-004). */
  snapMode: SnapMode
  /** Grid overlay + snap settings (UX-005). */
  grid: GridSettings
  /** Whether the measurement rulers are shown around the canvas (UX-004). */
  showRulers: boolean
  /** Unit the rulers display in (UX-004). */
  rulerUnit: UnitId
  /** Manual ruler guides, in canvas px (UX-004). */
  guides: Guides
  /** Whether guides are visible/active (UX-004). */
  showGuides: boolean
  /** Whether objects snap to guides while dragging (UX-004). */
  snapGuides: boolean
  /** Guides the dragging object is currently snapped to (transient highlight). */
  activeGuides: Guides

  setCanvas: (c: fabric.Canvas | null) => void
  setZoom: (z: number) => void
  setDesignName: (name: string) => void
  setSelection: (objs: fabric.FabricObject[]) => void
  bump: () => void

  /** Resize the artboard, preserving existing objects. */
  setDimensions: (w: number, h: number) => void
  /** Start a fresh blank project at the given size and switch to it. */
  newProject: (w: number, h: number) => void
  /** Start a new project pre-filled from a starter template (TPL-003). */
  newProjectFromTemplate: (tpl: StarterTemplate) => void
  /** Save the current design as a reusable template (TPL-004). */
  saveAsTemplate: (name: string) => boolean
  /** Start a new project from a user-saved template by id (TPL-004). */
  newProjectFromSavedTemplate: (templateId: string) => void
  /** Load a saved project by id, replacing the canvas contents. */
  openProject: (id: string) => void
  /** Persist the current project's name (after the user edits it). */
  renameProject: () => void
  /** Delete a project; if it's the current one, switch to another (or a new one). */
  deleteProjectById: (id: string) => void
  /** Duplicate a project; returns the copy's id (or null on failure). */
  duplicateProjectById: (id: string) => string | null

  /** Serialize the live canvas into the active page and persist the project. */
  saveCurrentProject: () => void
  /** Add a blank page after the active one and switch to it. */
  addPage: () => void
  /** Switch to a page by id, persisting the current page first. */
  selectPage: (id: string) => void
  /** Delete a page (no-op when it's the only page). */
  deletePage: (id: string) => void
  /** Duplicate a page, inserting the copy right after it. */
  duplicatePage: (id: string) => void
  /** Switch between single-page editing and the all-pages stack view. */
  setViewMode: (mode: ViewMode) => void
  /** Restore a project state (pages + active page) for undo/redo. */
  applyHistorySnapshot: (pages: PageData[], activePageId: string) => Promise<void>

  /** Set the artboard's solid background colour. */
  setBackgroundColor: (color: string) => void
  /** Set an image (covering the artboard) as the background. */
  setBackgroundImageFromFile: (file: File) => void
  /** Clear the background colour and image (transparent artboard). */
  clearBackground: () => void
  /** Refresh the backgroundColor mirror from the live canvas (after load/undo). */
  syncBackgroundFromCanvas: () => void
  /** Set the drag-time alignment-guide snapping mode. */
  setSnapMode: (mode: SnapMode) => void
  /** Show/hide the grid overlay (UX-005). */
  toggleGrid: () => void
  /** Set the grid size in px (UX-005). */
  setGridSize: (size: number) => void
  /** Set the grid rendering style (UX-005). */
  setGridStyle: (style: GridStyle) => void
  /** Enable/disable snapping objects to the grid (UX-005). */
  toggleGridSnap: () => void
  /** Show/hide the measurement rulers (UX-004). */
  toggleRulers: () => void
  /** Change the ruler display unit (UX-004). */
  setRulerUnit: (unit: UnitId) => void
  /** Add a guide; orientation 'horizontal' (y) or 'vertical' (x), in canvas px. */
  addGuide: (orientation: 'horizontal' | 'vertical', pos: number) => void
  /** Move guide at `index` to a new position (persisted; call on drag end). */
  updateGuide: (orientation: 'horizontal' | 'vertical', index: number, pos: number) => void
  /** Remove guide at `index` (e.g. dragged back onto the ruler). */
  removeGuide: (orientation: 'horizontal' | 'vertical', index: number) => void
  /** Remove every guide. */
  clearGuides: () => void
  /** Show/hide all guides (UX-004). */
  toggleGuides: () => void
  /** Enable/disable snapping objects to guides (UX-004). */
  toggleSnapGuides: () => void
  /** Set the guides currently being snapped to (highlight; not persisted). */
  setActiveGuides: (g: Guides) => void

  /** Canonical way to add an object: every tool routes through here. */
  addObject: (obj: fabric.FabricObject) => void
  /** Quick-add a default rectangle (used to test selection/transform). */
  addBox: () => void
  /** Add a shape from the shape library. */
  addShape: (kind: ShapeKind) => void
  /** Add an editable, wrapping text box. */
  addText: () => void
  /** Read an image file, place it centred (base64), and persist it. */
  addImageFromFile: (file: File) => void
  /** Apply property changes to the single active object, live.
   *  Typed against Textbox so text + shape props are both accepted. */
  updateActive: (props: Partial<fabric.Textbox>) => void
  /** Programmatically select a single object (e.g. from the layers panel). */
  selectObject: (obj: fabric.FabricObject) => void
  /** Show or hide an object. */
  setObjectVisible: (obj: fabric.FabricObject, visible: boolean) => void
  /** Lock/unlock an object: locked objects can't be selected or edited on the
   *  canvas, but stay visible and exportable. */
  setObjectLocked: (obj: fabric.FabricObject, locked: boolean) => void
  /** Rename an object (layers panel); empty name clears back to the default. */
  setObjectName: (obj: fabric.FabricObject, name: string) => void
  /** Restack objects given the desired bottom-to-top order. */
  applyStackingOrder: (bottomFirst: fabric.FabricObject[]) => void
  /** Move the active selection by a pixel delta (arrow-key nudge). */
  nudge: (dx: number, dy: number) => void
  /** Delete the active selection. */
  deleteActive: () => void
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  canvas: null,
  width: DEFAULT_WIDTH,
  height: DEFAULT_HEIGHT,
  zoom: 1,
  selection: [],
  tick: 0,
  designName: DEFAULT_NAME,
  currentProjectId: null,
  pages: [],
  activePageId: '',
  viewMode: 'single',
  backgroundColor: '#ffffff',
  snapMode: 'guides',
  grid: { visible: false, size: GRID_SIZE, style: 'lines', snap: false },
  showRulers: true,
  rulerUnit: 'px',
  guides: { horizontal: [], vertical: [] },
  showGuides: true,
  snapGuides: true,
  activeGuides: { horizontal: [], vertical: [] },

  setCanvas: (canvas) => set({ canvas }),
  setZoom: (zoom) => set({ zoom }),
  setDesignName: (designName) => set({ designName }),
  setSelection: (selection) => set({ selection }),
  bump: () => set((s) => ({ tick: s.tick + 1 })),

  setDimensions: (width, height) => {
    const { canvas } = get()
    if (canvas) {
      canvas.setDimensions({ width, height })
      canvas.requestRenderAll()
    }
    set({ width, height })
  },

  newProject: (width, height) => {
    const { canvas } = get()
    const id = crypto.randomUUID()
    const pageId = crypto.randomUUID()
    if (canvas) {
      canvas.clear()
      canvas.backgroundColor = '#ffffff'
      canvas.setDimensions({ width, height })
      canvas.requestRenderAll()
    }
    const pages: PageData[] = [{ id: pageId, canvas: canvas ? serializeCanvas(canvas) : { objects: [] } }]
    set({
      width,
      height,
      selection: [],
      designName: DEFAULT_NAME,
      currentProjectId: id,
      pages,
      activePageId: pageId,
      backgroundColor: '#ffffff',
      guides: { horizontal: [], vertical: [] },
    })
    setCurrentProjectId(id)
    // Persist the fresh blank project immediately so it appears in the list.
    saveProject({ id, name: DEFAULT_NAME, width, height, pages, activePageId: pageId, guides: EMPTY_GUIDES })
    useHistoryStore.getState().reset()
  },

  newProjectFromTemplate: (tpl) => {
    // Start a blank project at the template's size, then drop in its objects.
    get().newProject(tpl.width, tpl.height)
    const { canvas } = get()
    if (!canvas) return
    canvas.backgroundColor = tpl.background
    tpl.build().forEach((obj) => canvas.add(obj))
    canvas.requestRenderAll()
    set({ designName: tpl.name, backgroundColor: tpl.background })
    get().syncBackgroundFromCanvas()
    // Template content is the starting point, so reset history to it.
    useHistoryStore.getState().reset()
    get().saveCurrentProject()
  },

  saveAsTemplate: (name) => {
    const { canvas, designName, width, height, pages, activePageId } = get()
    if (!canvas) return false
    // Snapshot all pages (active synced from the live canvas), independent of
    // the project so later edits don't mutate the template.
    const snapPages = pages.map((p) => ({
      id: p.id,
      canvas: structuredClone(p.id === activePageId ? serializeCanvas(canvas) : p.canvas),
    }))
    return saveTemplate({
      id: crypto.randomUUID(),
      name: name.trim() || designName,
      width,
      height,
      pages: snapPages,
    })
  },

  newProjectFromSavedTemplate: (templateId) => {
    const { canvas } = get()
    const tpl = loadTemplate(templateId)
    if (!canvas || !tpl) return
    const id = crypto.randomUUID()
    // Fresh page ids so the new project is fully independent of the template.
    const pages: PageData[] = tpl.pages.map((p) => ({
      id: crypto.randomUUID(),
      canvas: structuredClone(p.canvas),
    }))
    const active = pages[0]
    set({
      width: tpl.width,
      height: tpl.height,
      selection: [],
      designName: tpl.name,
      currentProjectId: id,
      pages,
      activePageId: active.id,
    })
    canvas.setDimensions({ width: tpl.width, height: tpl.height })
    setCurrentProjectId(id)
    saveProject({ id, name: tpl.name, width: tpl.width, height: tpl.height, pages, activePageId: active.id })
    canvas.loadFromJSON(active.canvas).then(() => {
      canvas.requestRenderAll()
      loadCanvasFonts(canvas)
      get().syncBackgroundFromCanvas()
      useHistoryStore.getState().reset()
    })
  },

  openProject: (id) => {
    const { canvas } = get()
    const proj = loadProject(id)
    if (!canvas || !proj) return
    const active = proj.pages.find((p) => p.id === proj.activePageId) ?? proj.pages[0]
    set({
      width: proj.width,
      height: proj.height,
      selection: [],
      designName: proj.name,
      currentProjectId: id,
      pages: proj.pages,
      activePageId: active.id,
      guides: proj.guides ?? { horizontal: [], vertical: [] },
    })
    canvas.setDimensions({ width: proj.width, height: proj.height })
    setCurrentProjectId(id)
    canvas.loadFromJSON(active.canvas).then(() => {
      canvas.requestRenderAll()
      // Re-fetch the Google fonts the design uses, then repaint (BUG-001).
      loadCanvasFonts(canvas)
      // Mirror the restored background colour for the controls.
      get().syncBackgroundFromCanvas()
      // A loaded project is a fresh history baseline.
      useHistoryStore.getState().reset()
    })
  },

  renameProject: () => {
    if (!get().currentProjectId) return
    // Re-persist so the project index reflects the new name.
    get().saveCurrentProject()
  },

  deleteProjectById: (id) => {
    deleteProject(id)
    if (id !== get().currentProjectId) return
    // The open project was deleted — switch to the most recent remaining one,
    // or start a fresh project if none are left.
    const remaining = listProjects()
    if (remaining[0]) get().openProject(remaining[0].id)
    else get().newProject(DEFAULT_WIDTH, DEFAULT_HEIGHT)
  },

  duplicateProjectById: (id) => {
    // If duplicating the open project, flush its latest edits first so the
    // copy captures the on-screen state, not just the last debounced save.
    if (id === get().currentProjectId) get().saveCurrentProject()
    return duplicateProject(id, crypto.randomUUID())
  },

  saveCurrentProject: () => {
    const { canvas, currentProjectId, designName, width, height, pages, activePageId, guides } = get()
    if (!canvas || !currentProjectId) return
    // Sync the active page from the live canvas, then persist all pages.
    const synced = pages.map((p) =>
      p.id === activePageId ? { ...p, canvas: serializeCanvas(canvas) } : p,
    )
    set({ pages: synced })
    saveProject({ id: currentProjectId, name: designName, width, height, pages: synced, activePageId, guides })
  },

  addPage: () => {
    const { canvas, pages, activePageId } = get()
    if (!canvas) return
    // Capture the current page, then start a blank one after it.
    const synced = pages.map((p) =>
      p.id === activePageId ? { ...p, canvas: serializeCanvas(canvas) } : p,
    )
    const newPageId = crypto.randomUUID()
    canvas.clear()
    canvas.backgroundColor = '#ffffff'
    canvas.requestRenderAll()
    const idx = synced.findIndex((p) => p.id === activePageId)
    const next = [
      ...synced.slice(0, idx + 1),
      { id: newPageId, canvas: serializeCanvas(canvas) },
      ...synced.slice(idx + 1),
    ]
    set({ pages: next, activePageId: newPageId, selection: [], backgroundColor: '#ffffff' })
    // Record so adding a page is undoable (record() also auto-saves).
    useHistoryStore.getState().record('Added page')
  },

  selectPage: (pageId) => {
    const { canvas, pages, activePageId } = get()
    if (!canvas || pageId === activePageId) return
    const synced = pages.map((p) =>
      p.id === activePageId ? { ...p, canvas: serializeCanvas(canvas) } : p,
    )
    const target = synced.find((p) => p.id === pageId)
    if (!target) return
    set({ pages: synced, activePageId: pageId, selection: [] })
    canvas.loadFromJSON(target.canvas).then(() => {
      canvas.requestRenderAll()
      loadCanvasFonts(canvas)
      get().syncBackgroundFromCanvas()
      useHistoryStore.getState().record('Switched page')
    })
  },

  duplicatePage: (pageId) => {
    const { canvas, pages, activePageId } = get()
    // Sync the active page from the live canvas first so a duplicate of it
    // captures the latest edits.
    const synced = canvas
      ? pages.map((p) => (p.id === activePageId ? { ...p, canvas: serializeCanvas(canvas) } : p))
      : pages
    const idx = synced.findIndex((p) => p.id === pageId)
    if (idx < 0) return
    const copy: PageData = { id: crypto.randomUUID(), canvas: structuredClone(synced[idx].canvas) }
    const next = [...synced.slice(0, idx + 1), copy, ...synced.slice(idx + 1)]
    set({ pages: next })
    // Record so duplicating a page is undoable (record() also auto-saves).
    useHistoryStore.getState().record('Duplicated page')
  },

  setViewMode: (mode) => {
    // Flush the live canvas into the active page so previews are current.
    if (mode === 'stack') get().saveCurrentProject()
    set({ viewMode: mode })
  },

  applyHistorySnapshot: (pages, activePageId) => {
    const { canvas } = get()
    if (!canvas) return Promise.resolve()
    const active = pages.find((p) => p.id === activePageId) ?? pages[0]
    set({ pages, activePageId: active.id, selection: [] })
    return canvas.loadFromJSON(active.canvas).then(() => {
      canvas.requestRenderAll()
      loadCanvasFonts(canvas)
      get().syncBackgroundFromCanvas()
    })
  },

  deletePage: (pageId) => {
    const { canvas, pages, activePageId } = get()
    if (!canvas || pages.length <= 1) return
    const idx = pages.findIndex((p) => p.id === pageId)
    if (idx < 0) return
    const remaining = pages.filter((p) => p.id !== pageId)

    if (pageId !== activePageId) {
      set({ pages: remaining })
      // Record so deleting a page is undoable (record() also auto-saves).
      useHistoryStore.getState().record('Deleted page')
      return
    }
    // Deleting the active page → switch to a neighbour.
    const neighbour = remaining[Math.min(idx, remaining.length - 1)]
    set({ pages: remaining, activePageId: neighbour.id, selection: [] })
    canvas.loadFromJSON(neighbour.canvas).then(() => {
      canvas.requestRenderAll()
      loadCanvasFonts(canvas)
      get().syncBackgroundFromCanvas()
      useHistoryStore.getState().record('Deleted page')
    })
  },

  setBackgroundColor: (color) => {
    const { canvas } = get()
    if (!canvas) return
    canvas.backgroundColor = color
    canvas.requestRenderAll()
    set({ backgroundColor: color })
    // Background isn't an object, so trigger a history snapshot + auto-save.
    useHistoryStore.getState().scheduleRecord('Changed background')
  },

  setBackgroundImageFromFile: (file) => {
    // Defence-in-depth: the file picker's accept list is only a hint.
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      if (typeof dataUrl !== 'string') return
      fabric.FabricImage.fromURL(dataUrl).then((img) => {
        const { canvas, width, height } = get()
        if (!canvas) return
        // Scale to cover the artboard, centred.
        const scale = Math.max(width / (img.width || 1), height / (img.height || 1))
        img.set({ originX: 'center', originY: 'center', left: width / 2, top: height / 2, scaleX: scale, scaleY: scale })
        canvas.backgroundImage = img
        canvas.requestRenderAll()
        useHistoryStore.getState().scheduleRecord('Set background image')
      })
    }
    reader.readAsDataURL(file)
  },

  clearBackground: () => {
    const { canvas } = get()
    if (!canvas) return
    canvas.backgroundColor = ''
    canvas.backgroundImage = undefined
    canvas.requestRenderAll()
    set({ backgroundColor: '' })
    useHistoryStore.getState().scheduleRecord('Cleared background')
  },

  syncBackgroundFromCanvas: () => {
    const { canvas } = get()
    if (!canvas) return
    set({ backgroundColor: typeof canvas.backgroundColor === 'string' ? canvas.backgroundColor : '' })
  },

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

  addObject: (obj) => {
    const { canvas } = get()
    if (!canvas) return
    // Assign a stable id so the layers panel can track/reorder objects.
    const withId = obj as fabric.FabricObject & { id?: string }
    if (!withId.id) withId.id = crypto.randomUUID()
    canvas.add(obj)
    canvas.setActiveObject(obj)
    canvas.requestRenderAll()
  },

  addBox: () => {
    const { canvas, addObject } = get()
    if (!canvas) return
    const rect = new fabric.Rect({
      left: canvas.getWidth() / 2,
      top: canvas.getHeight() / 2,
      originX: 'center',
      originY: 'center',
      width: 200,
      height: 200,
      fill: '#4f46e5',
    })
    addObject(rect)
  },

  addShape: (kind) => {
    const { canvas, addObject } = get()
    if (!canvas) return
    const cx = canvas.getWidth() / 2
    const cy = canvas.getHeight() / 2
    const base = {
      left: cx,
      top: cy,
      originX: 'center' as const,
      originY: 'center' as const,
      fill: SHAPE_FILL,
      stroke: SHAPE_STROKE,
      strokeWidth: 0,
    }

    let obj: fabric.FabricObject
    switch (kind) {
      case 'rect':
        obj = new fabric.Rect({ ...base, width: 200, height: 140 })
        break
      case 'roundedRect':
        obj = new fabric.Rect({ ...base, width: 200, height: 140, rx: 24, ry: 24 })
        break
      case 'ellipse':
        obj = new fabric.Ellipse({ ...base, rx: 100, ry: 100 })
        break
      case 'triangle':
        obj = new fabric.Triangle({ ...base, width: 180, height: 160 })
        break
      case 'line':
        obj = new fabric.Line([0, 0, 220, 0], {
          left: cx,
          top: cy,
          originX: 'center',
          originY: 'center',
          stroke: SHAPE_STROKE,
          strokeWidth: 6,
        })
        break
      case 'arrow': {
        // Filled block arrow so fill, stroke and stroke width all apply.
        const path = 'M 0 12 L 60 12 L 60 0 L 100 22 L 60 44 L 60 32 L 0 32 Z'
        obj = new fabric.Path(path, { ...base, strokeWidth: 0 })
        break
      }
    }
    addObject(obj)
  },

  addText: () => {
    const { canvas, addObject } = get()
    if (!canvas) return
    const lastFont = getLastFont()
    const text = new fabric.Textbox('Add a heading', {
      left: canvas.getWidth() / 2,
      top: canvas.getHeight() / 2,
      originX: 'center',
      originY: 'center',
      width: 400,
      fontSize: 48,
      fontFamily: lastFont ?? 'Arial',
      fill: '#111111',
      textAlign: 'left',
    })
    // If reusing a remembered Google Font, make sure its glyphs are loaded.
    if (lastFont) {
      loadGoogleFont(lastFont).then(() => canvas.requestRenderAll())
    }
    addObject(text)
  },

  addImageFromFile: (file) => {
    // Defence-in-depth: the file picker's accept list is only a hint.
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      if (typeof dataUrl !== 'string') return
      // Always a base64 data URL, so the image persists in localStorage via
      // the auto-save that addObject triggers (object:added -> history record).
      // fabric 7: Image is FabricImage and fromURL returns a Promise.
      fabric.FabricImage.fromURL(dataUrl).then((img) => {
        const { canvas, width, height } = get()
        if (!canvas) return
        const imgW = img.width || 1
        const imgH = img.height || 1
        // Fit within 80% of the artboard, preserving aspect ratio.
        const scale = Math.min((width * 0.8) / imgW, (height * 0.8) / imgH, 1)
        img.set({
          originX: 'center',
          originY: 'center',
          left: width / 2,
          top: height / 2,
          scaleX: scale,
          scaleY: scale,
        })
        get().addObject(img)
      })
    }
    reader.readAsDataURL(file)
  },

  updateActive: (props) => {
    const { canvas } = get()
    if (!canvas) return
    const obj = canvas.getActiveObject()
    if (!obj) return
    obj.set(props)
    obj.setCoords()
    canvas.requestRenderAll()
    fireModified(canvas, obj, labelForProps(props))
  },

  selectObject: (obj) => {
    const { canvas } = get()
    if (!canvas) return
    canvas.setActiveObject(obj)
    canvas.requestRenderAll()
    set({ selection: [obj] })
  },

  setObjectVisible: (obj, visible) => {
    const { canvas } = get()
    if (!canvas) return
    obj.visible = visible
    canvas.requestRenderAll()
    set((s) => ({ tick: s.tick + 1 }))
  },

  setObjectLocked: (obj, locked) => {
    const { canvas } = get()
    if (!canvas) return
    obj.set({ selectable: !locked, evented: !locked, locked })
    // Drop the selection if we just locked the active object.
    if (locked && canvas.getActiveObject() === obj) {
      canvas.discardActiveObject()
      set({ selection: [] })
    }
    canvas.requestRenderAll()
    // Route through object:modified so the change is recorded + autosaved.
    fireModified(canvas, obj, locked ? 'Locked layer' : 'Unlocked layer')
    set((s) => ({ tick: s.tick + 1 }))
  },

  setObjectName: (obj, name) => {
    const { canvas } = get()
    if (!canvas) return
    obj.set('name', name.trim())
    fireModified(canvas, obj, 'Renamed layer')
    set((s) => ({ tick: s.tick + 1 }))
  },

  applyStackingOrder: (bottomFirst) => {
    const { canvas } = get()
    if (!canvas) return
    bottomFirst.forEach((o, i) => canvas.moveObjectTo(o, i))
    canvas.requestRenderAll()
    fireModified(canvas, bottomFirst[0], 'Reordered layers')
    set((s) => ({ tick: s.tick + 1 }))
  },

  nudge: (dx, dy) => {
    const { canvas } = get()
    if (!canvas) return
    const obj = canvas.getActiveObject()
    if (!obj) return
    obj.set({ left: (obj.left ?? 0) + dx, top: (obj.top ?? 0) + dy })
    obj.setCoords()
    canvas.requestRenderAll()
    fireModified(canvas, obj, `Moved ${kindName(obj)}`)
  },

  deleteActive: () => {
    const { canvas } = get()
    if (!canvas) return
    const objs = canvas.getActiveObjects()
    objs.forEach((o) => canvas.remove(o))
    canvas.discardActiveObject()
    canvas.requestRenderAll()
    set({ selection: [] })
  },
}))
