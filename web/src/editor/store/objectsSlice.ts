import type { StateCreator } from 'zustand'
import * as fabric from 'fabric'
import { getLastFont, loadGoogleFont } from '../fonts'
import { kindName, alignDelta } from '../utils'
import { removeSolidBackground, DEFAULT_TOLERANCE } from '../imageBackground'
import {
  SHAPE_FILL,
  SHAPE_STROKE,
  fireModified,
  labelForProps,
  readStyle,
  applyStyle,
  reselect,
  distributeStarts,
} from './storeHelpers'
import type { CanvasState, ObjectsSlice } from './storeTypes'

export const createObjectsSlice: StateCreator<CanvasState, [], [], ObjectsSlice> = (set, get) => ({
  canvas: null,
  selection: [],
  tick: 0,
  clipboardStyle: null,
  painterMode: 'off',
  bgRemoving: false,

  setCanvas: (canvas) => set({ canvas }),
  setSelection: (selection) => set({ selection }),
  bump: () => set((s) => ({ tick: s.tick + 1 })),

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

  alignObjects: (mode) => {
    const { canvas, width, height } = get()
    if (!canvas) return
    const objs = canvas.getActiveObjects()
    if (objs.length === 0) return
    // Work in absolute coords (objects in an active selection are group-relative).
    canvas.discardActiveObject()
    const rects = objs.map((o) => o.getBoundingRect())
    // One object aligns to the canvas; multiple align to their shared bounding box.
    let target: { left: number; top: number; width: number; height: number }
    if (objs.length > 1) {
      const left = Math.min(...rects.map((r) => r.left))
      const top = Math.min(...rects.map((r) => r.top))
      const right = Math.max(...rects.map((r) => r.left + r.width))
      const bottom = Math.max(...rects.map((r) => r.top + r.height))
      target = { left, top, width: right - left, height: bottom - top }
    } else {
      target = { left: 0, top: 0, width, height }
    }
    objs.forEach((o, i) => {
      const { dx, dy } = alignDelta(rects[i], target, mode)
      o.set({ left: (o.left ?? 0) + dx, top: (o.top ?? 0) + dy })
      o.setCoords()
    })
    reselect(canvas, objs)
    canvas.requestRenderAll()
    fireModified(canvas, objs[0], 'Aligned objects')
  },

  distributeObjects: (axis) => {
    const { canvas } = get()
    if (!canvas) return
    const objs = canvas.getActiveObjects()
    if (objs.length < 3) return
    canvas.discardActiveObject()
    const horizontal = axis === 'horizontal'
    const startKey = horizontal ? 'left' : 'top'
    const sizeKey = horizontal ? 'width' : 'height'
    const items = objs.map((o) => ({ o, r: o.getBoundingRect() }))
    items.sort((a, b) => a.r[startKey] - b.r[startKey])
    // Equal gaps: keep the outer edges fixed, space the rest evenly between them.
    const starts = distributeStarts(items.map((it) => ({ start: it.r[startKey], size: it.r[sizeKey] })))
    items.forEach((it, i) => {
      const delta = starts[i] - it.r[startKey]
      if (horizontal) it.o.set({ left: (it.o.left ?? 0) + delta })
      else it.o.set({ top: (it.o.top ?? 0) + delta })
      it.o.setCoords()
    })
    reselect(canvas, objs)
    canvas.requestRenderAll()
    fireModified(canvas, objs[0], `Distributed ${horizontal ? 'horizontally' : 'vertically'}`)
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

  copyStyle: () => {
    const { canvas } = get()
    if (!canvas) return
    const obj = canvas.getActiveObjects()[0]
    if (!obj) return
    set({ clipboardStyle: readStyle(obj) })
  },

  pasteStyle: () => {
    const { canvas, clipboardStyle } = get()
    if (!canvas || !clipboardStyle) return
    const objs = canvas.getActiveObjects()
    if (objs.length === 0) return
    objs.forEach((o) => applyStyle(o, clipboardStyle))
    canvas.requestRenderAll()
    fireModified(canvas, objs[0], 'Pasted style')
  },

  startPainter: (sticky) => {
    const { canvas } = get()
    if (!canvas) return
    get().copyStyle()
    if (!get().clipboardStyle) return
    canvas.defaultCursor = 'crosshair'
    set({ painterMode: sticky ? 'sticky' : 'once' })
  },

  exitPainter: () => {
    const { canvas } = get()
    if (canvas) canvas.defaultCursor = 'default'
    set({ painterMode: 'off' })
  },

  pasteStyleOnTarget: (obj) => {
    const { canvas, clipboardStyle, painterMode } = get()
    if (!canvas || !clipboardStyle) return
    applyStyle(obj, clipboardStyle)
    canvas.requestRenderAll()
    fireModified(canvas, obj, 'Pasted style')
    if (painterMode === 'once') get().exitPainter()
  },

  removeImageBackground: (tolerance = DEFAULT_TOLERANCE) => {
    const { canvas } = get()
    if (!canvas) return
    const obj = canvas.getActiveObject()
    if (!obj || obj.type !== 'image') return
    const img = obj as fabric.FabricImage
    // Remember the pristine source on first run so re-runs (at other tolerances)
    // always start from the original, not the already-cut result.
    const withOrig = img as unknown as { originalSrc?: string }
    const source = withOrig.originalSrc ?? img.getSrc()
    if (!withOrig.originalSrc) withOrig.originalSrc = source
    set({ bgRemoving: true })
    const done = () => set({ bgRemoving: false })
    const el = new Image()
    el.onload = () => {
      try {
        const url = removeSolidBackground(el, el.naturalWidth, el.naturalHeight, tolerance)
        // History keeps the previous state for undo (fireModified records it).
        img
          .setSrc(url)
          .then(() => {
            canvas.requestRenderAll()
            fireModified(canvas, img, 'Removed background')
            done()
          })
          .catch(done)
      } catch {
        done()
      }
    }
    el.onerror = () => done()
    el.src = source
  },

  setShadowEffect: (effect) => {
    const { canvas } = get()
    if (!canvas) return
    const obj = canvas.getActiveObject()
    if (!obj) return
    const withKind = obj as unknown as { shadowKind?: 'drop' | 'glow' }
    if (!effect) {
      obj.set('shadow', null)
      withKind.shadowKind = undefined
    } else {
      // Glow is just a zero-offset shadow; colour carries the effect opacity.
      obj.set(
        'shadow',
        new fabric.Shadow({
          color: effect.color,
          blur: effect.blur,
          offsetX: effect.x,
          offsetY: effect.y,
        }),
      )
      withKind.shadowKind = effect.kind
    }
    obj.setCoords()
    canvas.requestRenderAll()
    fireModified(canvas, obj, effect ? 'Changed effects' : 'Removed effect')
  },
})
