import { create } from 'zustand'
import { fabric } from 'fabric'
import { DEFAULT_WIDTH, DEFAULT_HEIGHT } from '../constants'

interface CanvasState {
  /** The live Fabric.js canvas instance. Components must never mutate it directly. */
  canvas: fabric.Canvas | null
  width: number
  height: number
  /** Display scale applied to the artboard so it fits the viewport. */
  zoom: number
  /** Currently selected objects (mirror of fabric's active selection). */
  selection: fabric.Object[]
  /** Bumped whenever a selected object is transformed, to refresh read-outs. */
  tick: number

  setCanvas: (c: fabric.Canvas | null) => void
  setZoom: (z: number) => void
  setSelection: (objs: fabric.Object[]) => void
  bump: () => void

  /** Resize the artboard, preserving existing objects. */
  setDimensions: (w: number, h: number) => void
  /** Wipe the canvas and start a fresh blank design at the given size. */
  newDesign: (w: number, h: number) => void

  /** Canonical way to add an object: every tool routes through here. */
  addObject: (obj: fabric.Object) => void
  /** Quick-add a default rectangle (used to test selection/transform). */
  addBox: () => void
  /** Add an editable, wrapping text box. */
  addText: () => void
  /** Apply property changes to the single active object, live.
   *  Typed against Textbox so text + shape props are both accepted. */
  updateActive: (props: Partial<fabric.Textbox>) => void
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

  setCanvas: (canvas) => set({ canvas }),
  setZoom: (zoom) => set({ zoom }),
  setSelection: (selection) => set({ selection }),
  bump: () => set((s) => ({ tick: s.tick + 1 })),

  setDimensions: (width, height) => {
    const { canvas } = get()
    if (canvas) {
      canvas.setWidth(width)
      canvas.setHeight(height)
      canvas.requestRenderAll()
    }
    set({ width, height })
  },

  newDesign: (width, height) => {
    const { canvas } = get()
    if (canvas) {
      canvas.clear()
      canvas.backgroundColor = '#ffffff'
      canvas.setWidth(width)
      canvas.setHeight(height)
      canvas.requestRenderAll()
    }
    set({ width, height, selection: [] })
  },

  addObject: (obj) => {
    const { canvas } = get()
    if (!canvas) return
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

  addText: () => {
    const { canvas, addObject } = get()
    if (!canvas) return
    const text = new fabric.Textbox('Add a heading', {
      left: canvas.getWidth() / 2,
      top: canvas.getHeight() / 2,
      originX: 'center',
      originY: 'center',
      width: 400,
      fontSize: 48,
      fontFamily: 'Arial',
      fill: '#111111',
      textAlign: 'left',
    })
    addObject(text)
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
