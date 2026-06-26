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

  setCanvas: (c: fabric.Canvas | null) => void
  setZoom: (z: number) => void
  /** Resize the artboard, preserving existing objects. */
  setDimensions: (w: number, h: number) => void
  /** Wipe the canvas and start a fresh blank design at the given size. */
  newDesign: (w: number, h: number) => void
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  canvas: null,
  width: DEFAULT_WIDTH,
  height: DEFAULT_HEIGHT,
  zoom: 1,

  setCanvas: (canvas) => set({ canvas }),

  setZoom: (zoom) => set({ zoom }),

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
    set({ width, height })
  },
}))
