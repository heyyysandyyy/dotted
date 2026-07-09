import type { StateCreator } from 'zustand'
import * as fabric from 'fabric'
import { getLastFont, loadGoogleFont } from '../fonts'
import { kindName, alignDelta, readShadowEffects, shadowOptions, type ShadowEffect } from '../utils'
import { removeSolidBackground, DEFAULT_TOLERANCE } from '../imageBackground'
import { syncEffectClones, syncInnerShadow } from '../effectsEngine'
import { localToScene } from '../cropGeometry'
import { EXTRA_PROPS } from '../storage'
import {
  SHAPE_FILL,
  SHAPE_STROKE,
  fireModified,
  labelForProps,
  readStyle,
  applyStyle,
  reselect,
  distributeStarts,
  setImageSceneCenter,
} from './storeHelpers'
import type { CanvasState, ObjectsSlice } from './storeTypes'

const DUPLICATE_OFFSET = 12
const PASTE_OFFSET = 16

/**
 * Clone `source` (carrying effects/lock/name/id via EXTRA_PROPS — the same
 * property list project save/load and the effects engine already rely on),
 * give the clone a fresh id, offset it by (dx, dy), add it to the canvas, and
 * rebuild any shadow effects it carries. A duplicated/pasted object's
 * `effects` metadata survives the clone (EXTRA_PROPS includes it), but the
 * *rendered* effect — the host's native shadow, any outer-effect clone, the
 * inner-shadow overlay — are separate real objects/props that setShadowEffect
 * builds from that metadata on every live edit; a straight clone doesn't
 * recreate them on its own, so this does the same rebuild here (UX-022).
 */
async function cloneOnto(
  canvas: fabric.Canvas,
  source: fabric.FabricObject,
  dx: number,
  dy: number,
): Promise<fabric.FabricObject> {
  const clone = await source.clone(EXTRA_PROPS)
  const tagged = clone as fabric.FabricObject & { id?: string }
  tagged.id = crypto.randomUUID()
  clone.set({ left: (clone.left ?? 0) + dx, top: (clone.top ?? 0) + dy })
  clone.setCoords()
  canvas.add(clone)
  const effects = readShadowEffects(clone)
  if (effects.length > 0) {
    await syncEffectClones(canvas, clone, effects.filter((e) => e.kind !== 'inner'))
    await syncInnerShadow(canvas, clone, effects.find((e) => e.kind === 'inner') ?? null)
  }
  return clone
}

export const createObjectsSlice: StateCreator<CanvasState, [], [], ObjectsSlice> = (set, get) => ({
  canvas: null,
  selection: [],
  tick: 0,
  clipboardStyle: null,
  objectClipboard: null,
  pasteCount: 0,
  painterMode: 'off',
  bgRemoving: false,
  cropImage: null,
  cropFull: null,
  cropInitial: null,
  cropAngle: 0,
  cropCenter: { x: 0, y: 0 },

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

  duplicateActive: async () => {
    const { canvas } = get()
    if (!canvas) return
    const objs = canvas.getActiveObjects()
    if (objs.length === 0) return
    const clones = await Promise.all(objs.map((o) => cloneOnto(canvas, o, DUPLICATE_OFFSET, DUPLICATE_OFFSET)))
    reselect(canvas, clones)
    canvas.requestRenderAll()
    fireModified(canvas, clones[0], clones.length > 1 ? 'Duplicated objects' : `Duplicated ${kindName(clones[0])}`)
  },

  copyObjects: async () => {
    const { canvas } = get()
    if (!canvas) return
    const objs = canvas.getActiveObjects()
    if (objs.length === 0) return
    const templates = await Promise.all(objs.map((o) => o.clone(EXTRA_PROPS)))
    set({ objectClipboard: templates, pasteCount: 0 })
  },

  pasteObjects: async () => {
    const { canvas, objectClipboard, pasteCount } = get()
    if (!canvas || !objectClipboard || objectClipboard.length === 0) return
    const nextCount = pasteCount + 1
    const offset = nextCount * PASTE_OFFSET
    const clones = await Promise.all(objectClipboard.map((t) => cloneOnto(canvas, t, offset, offset)))
    reselect(canvas, clones)
    canvas.requestRenderAll()
    fireModified(canvas, clones[0], clones.length > 1 ? 'Pasted objects' : `Pasted ${kindName(clones[0])}`)
    set({ pasteCount: nextCount })
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
    // setSrc() replaces the underlying image element, and fabric resets
    // width/height to the new element's full natural size when it does (it
    // has no way to know a crop window was in effect) — cropX/cropY are left
    // stale, pointing a window sized to the whole image partway into it, so
    // the object suddenly displays uncropped. The processed image is the
    // same full dimensions as the original (removeSolidBackground doesn't
    // resize), so the existing crop window is still valid — just needs
    // reapplying once the new element is in.
    const cropBefore = { cropX: img.cropX, cropY: img.cropY, width: img.width, height: img.height }
    const el = new Image()
    el.onload = () => {
      try {
        const url = removeSolidBackground(el, el.naturalWidth, el.naturalHeight, tolerance)
        // History keeps the previous state for undo (fireModified records it).
        img
          .setSrc(url)
          .then(() => {
            img.set(cropBefore)
            img.setCoords()
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

  setShadowEffect: (kind, effect) => {
    const { canvas } = get()
    if (!canvas) return
    const obj = canvas.getActiveObject() as (fabric.FabricObject & { id?: string }) | null
    if (!obj) return

    // Replace (or remove) just this kind's slot, keeping the other kinds'
    // effects untouched — up to all three can be active at once (UX-020).
    const current = readShadowEffects(obj)
    const withoutKind = current.filter((e) => e.kind !== kind)
    const next = effect ? [...withoutKind, effect] : withoutKind
    // Keep drop before glow before inner, deterministic regardless of toggle
    // order: drop/glow compete for the host's own native shadow slot (the
    // first of the two present gets it, see below); inner can never use it
    // at all (canvas 2D shadows are physically incapable of casting inward —
    // see effectsEngine.ts's syncInnerShadow), so it's sorted last purely
    // for stable storage/display order, not slot assignment.
    const rank: Record<ShadowEffect['kind'], number> = { drop: 0, glow: 1, inner: 2 }
    next.sort((a, b) => rank[a.kind] - rank[b.kind])

    const tagged = obj as unknown as {
      effects?: ShadowEffect[]
      shadowKind?: 'drop' | 'glow'
      shadowSpread?: number
    }
    tagged.effects = next
    // Legacy phase-1 props are no longer written — readShadowEffects only
    // falls back to them for an object saved before this array existed.
    tagged.shadowKind = undefined
    tagged.shadowSpread = undefined

    const outer = next.filter((e) => e.kind !== 'inner')
    const inner = next.find((e) => e.kind === 'inner') ?? null
    // The first outer effect (if any) still gets the host's own native
    // shadow — cheap, and correct on its own for the common case.
    obj.set('shadow', outer[0] ? new fabric.Shadow(shadowOptions(outer[0])) : null)
    obj.setCoords()
    // Every outer effect past the first (and any with spread) needs a
    // synthetic clone; inner shadow is raster-composited separately — see
    // effectsEngine.ts.
    syncEffectClones(canvas, obj, outer)
    syncInnerShadow(canvas, obj, inner)
    canvas.requestRenderAll()
    fireModified(canvas, obj, effect ? 'Changed effects' : 'Removed effect')
  },

  groupSelection: () => {
    const { canvas } = get()
    if (!canvas) return
    const objects = canvas.getActiveObjects()
    if (objects.length < 2) return
    // Discard the selection so children carry absolute coords, remove them from
    // the canvas, then build the group from those loose objects (fabric 7 has no
    // toGroup(); the Group layout preserves world positions).
    canvas.discardActiveObject()
    canvas.remove(...objects)
    const group = new fabric.Group(objects)
    // Allow entering the group to edit a child in place (UX-016 double-click).
    group.subTargetCheck = true
    // Render children directly (not via a bbox-sized cache) so their shadows/
    // glows aren't clipped at the group's bounding box (UX-011 effects).
    group.objectCaching = false
    const withId = group as fabric.FabricObject & { id?: string }
    if (!withId.id) withId.id = crypto.randomUUID()
    canvas.add(group)
    canvas.setActiveObject(group)
    canvas.requestRenderAll()
    set({ selection: [group] })
    fireModified(canvas, group, 'Grouped objects')
  },

  ungroupSelection: () => {
    const { canvas } = get()
    if (!canvas) return
    const group = canvas.getActiveObject()
    if (!group || group.type !== 'group') return
    const items = (group as fabric.Group).getObjects().slice()
    // remove() applies the group transform back to each child (world coords).
    ;(group as fabric.Group).remove(...items)
    canvas.remove(group)
    items.forEach((o) => canvas.add(o))
    reselect(canvas, items)
    canvas.requestRenderAll()
    set({ selection: items })
    if (items[0]) fireModified(canvas, items[0], 'Ungrouped')
  },

  moveLayerObject: (obj, toParent, toIndex) => {
    const { canvas } = get()
    if (!canvas) return
    const fromParent = (obj.group as fabric.Group | undefined) ?? null
    if (fromParent === toParent) {
      // Same parent — just reorder within it.
      const target = toParent ?? canvas
      target.moveObjectTo(obj, toIndex)
    } else {
      // Leaving a group's remove() re-expresses the object's transform in its
      // parent's coordinates (world, if leaving to root); entering a group's
      // add()/insertAt() does the inverse — same primitives ungroupSelection
      // and groupSelection already rely on, just for one object instead of all.
      if (fromParent) fromParent.remove(obj)
      else canvas.remove(obj)
      if (toParent) toParent.insertAt(toIndex, obj)
      else canvas.insertAt(toIndex, obj)
    }
    canvas.requestRenderAll()
    fireModified(canvas, obj, 'Moved layer')
    set((s) => ({ tick: s.tick + 1 }))
  },

  enterCrop: () => {
    const { canvas } = get()
    if (!canvas) return
    const obj = canvas.getActiveObject()
    if (!obj || obj.type !== 'image') return
    const image = obj as fabric.FabricImage
    const el = image.getElement() as HTMLImageElement
    const nW = el.naturalWidth || image.width || 1
    const nH = el.naturalHeight || image.height || 1
    // Effective scene scale/centre/angle (includes any parent group's
    // transform), so the same math works for top-level and grouped, rotated
    // images alike (UX-009 / UX-016 / UX-021).
    const d = fabric.util.qrDecompose(image.calcTransformMatrix())
    const esx = Math.abs(d.scaleX) || 1
    const esy = Math.abs(d.scaleY) || 1
    // cropFull/cropInitial live in the image's own local (unrotated) axes,
    // relative to its own centre — see localToScene below for converting a
    // local-frame point back to an absolute scene position for positioning
    // the actual fabric object. Centre-relative (rather than the pre-UX-021
    // absolute-scene convention) because rotation happens around the centre,
    // so this is the one frame where the crop math and CropOverlay's
    // handle/aspect logic don't need to know about rotation at all.
    const dispW = (image.width ?? 0) * esx
    const dispH = (image.height ?? 0) * esy
    const dispLeft = -dispW / 2
    const dispTop = -dispH / 2
    const fullLeft = dispLeft - (image.cropX ?? 0) * esx
    const fullTop = dispTop - (image.cropY ?? 0) * esy
    const fullW = nW * esx
    const fullH = nH * esy
    // Stash the pre-crop state (centre is in the object's own/parent space).
    ;(image as unknown as { __cropOrig?: object }).__cropOrig = {
      cropX: image.cropX ?? 0,
      cropY: image.cropY ?? 0,
      width: image.width,
      height: image.height,
      center: image.getCenterPoint(),
    }
    image.set({ cropX: 0, cropY: 0, width: nW, height: nH })
    const fullCentre = localToScene(fullLeft + fullW / 2, fullTop + fullH / 2, d)
    setImageSceneCenter(image, fullCentre.x, fullCentre.y)
    canvas.setActiveObject(image)
    canvas.requestRenderAll()
    set({
      cropImage: image,
      cropFull: { left: fullLeft, top: fullTop, width: fullW, height: fullH },
      cropInitial: { left: dispLeft, top: dispTop, width: dispW, height: dispH },
      cropAngle: d.angle,
      cropCenter: { x: d.translateX, y: d.translateY },
    })
  },

  applyCrop: (rect) => {
    const { canvas, cropImage, cropFull, cropAngle, cropCenter } = get()
    if (!canvas || !cropImage || !cropFull) return
    // Scale only — translate/angle must come from the frozen cropCenter/
    // cropAngle, not a fresh decompose: enterCrop already repositioned the
    // image to its full-bounds centre, so the image's *current* position is
    // no longer the origin rect/cropFull's coordinates are relative to.
    const d = fabric.util.qrDecompose(cropImage.calcTransformMatrix())
    const esx = Math.abs(d.scaleX) || 1
    const esy = Math.abs(d.scaleY) || 1
    cropImage.set({
      cropX: Math.max(0, (rect.left - cropFull.left) / esx),
      cropY: Math.max(0, (rect.top - cropFull.top) / esy),
      width: rect.width / esx,
      height: rect.height / esy,
    })
    const centre = localToScene(rect.left + rect.width / 2, rect.top + rect.height / 2, {
      translateX: cropCenter.x,
      translateY: cropCenter.y,
      angle: cropAngle,
    })
    setImageSceneCenter(cropImage, centre.x, centre.y)
    delete (cropImage as unknown as { __cropOrig?: object }).__cropOrig
    canvas.requestRenderAll()
    fireModified(canvas, cropImage, 'Cropped image')
    set({ cropImage: null, cropFull: null, cropInitial: null, cropAngle: 0, cropCenter: { x: 0, y: 0 } })
  },

  cancelCrop: () => {
    const { canvas, cropImage } = get()
    if (!canvas || !cropImage) return
    const holder = cropImage as unknown as {
      __cropOrig?: { cropX: number; cropY: number; width: number; height: number; center: fabric.Point }
    }
    const orig = holder.__cropOrig
    if (orig) {
      cropImage.set({ cropX: orig.cropX, cropY: orig.cropY, width: orig.width, height: orig.height })
      cropImage.setPositionByOrigin(orig.center, 'center', 'center')
      cropImage.setCoords()
      delete holder.__cropOrig
    }
    canvas.requestRenderAll()
    set({ cropImage: null, cropFull: null, cropInitial: null, cropAngle: 0, cropCenter: { x: 0, y: 0 } })
  },
})
