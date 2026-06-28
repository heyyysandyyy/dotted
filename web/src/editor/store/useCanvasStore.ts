import { create } from 'zustand'
import * as fabric from 'fabric'
import { DEFAULT_WIDTH, DEFAULT_HEIGHT } from '../constants'
import { getLastFont, loadGoogleFont } from '../fonts'
import { saveProject, loadProject, deleteProject, listProjects, setCurrentProjectId } from '../storage'
import { useHistoryStore } from './useHistoryStore'

const DEFAULT_NAME = 'Untitled design'

export type ShapeKind =
  | 'rect'
  | 'roundedRect'
  | 'ellipse'
  | 'triangle'
  | 'line'
  | 'arrow'

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

  setCanvas: (c: fabric.Canvas | null) => void
  setZoom: (z: number) => void
  setDesignName: (name: string) => void
  setSelection: (objs: fabric.FabricObject[]) => void
  bump: () => void

  /** Resize the artboard, preserving existing objects. */
  setDimensions: (w: number, h: number) => void
  /** Start a fresh blank project at the given size and switch to it. */
  newProject: (w: number, h: number) => void
  /** Load a saved project by id, replacing the canvas contents. */
  openProject: (id: string) => void
  /** Persist the current project's name (after the user edits it). */
  renameProject: () => void
  /** Delete a project; if it's the current one, switch to another (or a new one). */
  deleteProjectById: (id: string) => void

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
    if (canvas) {
      canvas.clear()
      canvas.backgroundColor = '#ffffff'
      canvas.setDimensions({ width, height })
      canvas.requestRenderAll()
    }
    set({ width, height, selection: [], designName: DEFAULT_NAME, currentProjectId: id })
    setCurrentProjectId(id)
    // Persist the fresh blank project immediately so it appears in the list.
    if (canvas) saveProject(id, DEFAULT_NAME, canvas, width, height)
    useHistoryStore.getState().reset()
  },

  openProject: (id) => {
    const { canvas } = get()
    const proj = loadProject(id)
    if (!canvas || !proj) return
    set({
      width: proj.width,
      height: proj.height,
      selection: [],
      designName: proj.name,
      currentProjectId: id,
    })
    canvas.setDimensions({ width: proj.width, height: proj.height })
    setCurrentProjectId(id)
    canvas.loadFromJSON(proj.canvas).then(() => {
      canvas.requestRenderAll()
      // A loaded project is a fresh history baseline.
      useHistoryStore.getState().reset()
    })
  },

  renameProject: () => {
    const { canvas, currentProjectId, designName, width, height } = get()
    if (!canvas || !currentProjectId) return
    // Re-persist so the project index reflects the new name.
    saveProject(currentProjectId, designName, canvas, width, height)
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
