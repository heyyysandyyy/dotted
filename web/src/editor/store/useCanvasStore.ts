import { create } from 'zustand'
import * as fabric from 'fabric'
import { DEFAULT_WIDTH, DEFAULT_HEIGHT } from '../constants'
import { getLastFont, loadGoogleFont } from '../fonts'
import {
  saveProject,
  loadProject,
  deleteProject,
  duplicateProject,
  listProjects,
  setCurrentProjectId,
  EXTRA_PROPS,
  type PageData,
} from '../storage'
import type { StarterTemplate } from '../templates'

/** Serialize the live canvas into a page payload. */
function serializeCanvas(canvas: fabric.Canvas): object {
  return canvas.toObject(EXTRA_PROPS)
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

/** Drag-time snapping mode (CLR-004): off, alignment guides, or grid. */
export type SnapMode = 'none' | 'guides' | 'grid'

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
  /** Drag-time snapping mode: off, alignment guides, or grid (CLR-004). */
  snapMode: SnapMode

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
  /** Set the drag-time snapping mode. */
  setSnapMode: (mode: SnapMode) => void

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
    })
    setCurrentProjectId(id)
    // Persist the fresh blank project immediately so it appears in the list.
    saveProject({ id, name: DEFAULT_NAME, width, height, pages, activePageId: pageId })
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
    })
    canvas.setDimensions({ width: proj.width, height: proj.height })
    setCurrentProjectId(id)
    canvas.loadFromJSON(active.canvas).then(() => {
      canvas.requestRenderAll()
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
    const { canvas, currentProjectId, designName, width, height, pages, activePageId } = get()
    if (!canvas || !currentProjectId) return
    // Sync the active page from the live canvas, then persist all pages.
    const synced = pages.map((p) =>
      p.id === activePageId ? { ...p, canvas: serializeCanvas(canvas) } : p,
    )
    set({ pages: synced })
    saveProject({ id: currentProjectId, name: designName, width, height, pages: synced, activePageId })
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
    useHistoryStore.getState().record()
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
      get().syncBackgroundFromCanvas()
      useHistoryStore.getState().record()
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
    useHistoryStore.getState().record()
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
      useHistoryStore.getState().record()
      return
    }
    // Deleting the active page → switch to a neighbour.
    const neighbour = remaining[Math.min(idx, remaining.length - 1)]
    set({ pages: remaining, activePageId: neighbour.id, selection: [] })
    canvas.loadFromJSON(neighbour.canvas).then(() => {
      canvas.requestRenderAll()
      get().syncBackgroundFromCanvas()
      useHistoryStore.getState().record()
    })
  },

  setBackgroundColor: (color) => {
    const { canvas } = get()
    if (!canvas) return
    canvas.backgroundColor = color
    canvas.requestRenderAll()
    set({ backgroundColor: color })
    // Background isn't an object, so trigger a history snapshot + auto-save.
    useHistoryStore.getState().scheduleRecord()
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
        useHistoryStore.getState().scheduleRecord()
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
    useHistoryStore.getState().scheduleRecord()
  },

  syncBackgroundFromCanvas: () => {
    const { canvas } = get()
    if (!canvas) return
    set({ backgroundColor: typeof canvas.backgroundColor === 'string' ? canvas.backgroundColor : '' })
  },

  setSnapMode: (snapMode) => set({ snapMode }),

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
    canvas.fire('object:modified', { target: obj })
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

  applyStackingOrder: (bottomFirst) => {
    const { canvas } = get()
    if (!canvas) return
    bottomFirst.forEach((o, i) => canvas.moveObjectTo(o, i))
    canvas.requestRenderAll()
    canvas.fire('object:modified', { target: bottomFirst[0] })
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
    canvas.fire('object:modified', { target: obj })
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
