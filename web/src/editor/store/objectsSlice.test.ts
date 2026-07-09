import { describe, it, expect, beforeEach } from 'vitest'
import * as fabric from 'fabric'
import { useCanvasStore } from './useCanvasStore'
import { isEffectClone } from '../effectsEngine'
import { DROP_SHADOW_DEFAULT } from '../utils'

function matrixOf(obj: fabric.FabricObject): number[] {
  return obj.calcTransformMatrix()
}

describe('moveLayerObject (UX-018)', () => {
  let canvas: fabric.Canvas

  beforeEach(() => {
    canvas = new fabric.Canvas(document.createElement('canvas'), { width: 400, height: 400 })
    useCanvasStore.setState({ canvas })
  })

  it('reorders objects at the root without changing their world position', () => {
    const a = new fabric.Rect({ left: 0, top: 0, width: 10, height: 10 })
    const b = new fabric.Rect({ left: 20, top: 0, width: 10, height: 10 })
    canvas.add(a, b)
    expect(canvas.getObjects()).toEqual([a, b])

    useCanvasStore.getState().moveLayerObject(a, null, 1)

    expect(canvas.getObjects()).toEqual([b, a])
    expect(a.left).toBe(0) // unmoved visually — only stacking order changed
  })

  it('moving a root object into a group preserves its world position', () => {
    const group = new fabric.Group([new fabric.Rect({ left: 100, top: 100, width: 10, height: 10 })])
    const loose = new fabric.Rect({ left: 5, top: 5, width: 10, height: 10 })
    canvas.add(group, loose)
    const worldMatrixBefore = matrixOf(loose)

    useCanvasStore.getState().moveLayerObject(loose, group, 0)

    expect(canvas.getObjects()).toEqual([group])
    expect(group.getObjects()).toContain(loose)
    expect(loose.group).toBe(group)
    const worldMatrixAfter = matrixOf(loose)
    worldMatrixAfter.forEach((v, i) => expect(v).toBeCloseTo(worldMatrixBefore[i], 5))
  })

  it('moving a child out of a group to root preserves its world position', () => {
    const child = new fabric.Rect({ left: 3, top: 3, width: 10, height: 10 })
    const group = new fabric.Group([child, new fabric.Rect({ left: 30, top: 30, width: 10, height: 10 })], {
      left: 50,
      top: 50,
    })
    canvas.add(group)
    const worldMatrixBefore = matrixOf(child)

    useCanvasStore.getState().moveLayerObject(child, null, 0)

    expect(child.group).toBeUndefined()
    expect(canvas.getObjects()).toContain(child)
    expect(group.getObjects()).not.toContain(child)
    const worldMatrixAfter = matrixOf(child)
    worldMatrixAfter.forEach((v, i) => expect(v).toBeCloseTo(worldMatrixBefore[i], 5))
  })

  it('reorders children within the same group', () => {
    const a = new fabric.Rect({ left: 0, top: 0, width: 10, height: 10 })
    const b = new fabric.Rect({ left: 20, top: 0, width: 10, height: 10 })
    const group = new fabric.Group([a, b])
    canvas.add(group)

    useCanvasStore.getState().moveLayerObject(a, group, 1)

    expect(group.getObjects()).toEqual([b, a])
  })
})

describe('removeImageBackground preserves an existing crop window', () => {
  // removeImageBackground itself can't be exercised end-to-end here: it loads
  // the source through a plain `new Image()` + onload, and jsdom never
  // decodes real image bytes, so onload never fires (confirmed by hand — a
  // fabric.FabricImage.fromURL()/img.setSrc() call on a real data URL just
  // hangs). setElement() is the synchronous piece of that same code path
  // (setSrc calls it once the new element loads) and reproduces the exact
  // bug: it resets width/height to the new element's full size without
  // touching cropX/cropY, which is what made a cropped image "un-crop" when
  // its background was removed. This pins that fabric behaviour, and that
  // re-applying the pre-setSrc crop values (removeImageBackground's fix)
  // actually restores the crop window.
  const canvasEl = (w: number, h: number) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    return c
  }

  it('fabric setElement resets width/height but leaves cropX/cropY stale', () => {
    const img = new fabric.FabricImage(canvasEl(100, 100))
    img.set({ cropX: 20, cropY: 10, width: 50, height: 50 })

    img.setElement(canvasEl(100, 100))

    expect(img.width).toBe(100) // reset to the new element's full size
    expect(img.height).toBe(100)
    expect(img.cropX).toBe(20) // untouched — now stale relative to width/height
    expect(img.cropY).toBe(10)
  })

  it('re-applying the captured crop after setElement restores the crop window', () => {
    const img = new fabric.FabricImage(canvasEl(100, 100))
    img.set({ cropX: 20, cropY: 10, width: 50, height: 50 })
    const cropBefore = { cropX: img.cropX, cropY: img.cropY, width: img.width, height: img.height }

    img.setElement(canvasEl(100, 100))
    img.set(cropBefore)

    expect(img.cropX).toBe(20)
    expect(img.cropY).toBe(10)
    expect(img.width).toBe(50)
    expect(img.height).toBe(50)
  })
})

describe('enterCrop / applyCrop on a rotated image (UX-021)', () => {
  let canvas: fabric.Canvas
  // enterCrop reads the *natural* (full, uncropped) size off the element via
  // `el.naturalWidth || image.width` — a real <img> reports that regardless
  // of the fabric object's current crop, but a plain <canvas> element (jsdom
  // can't decode real image bytes, so this is what stands in for one) has no
  // naturalWidth at all, so the fallback would silently pick up the already-
  // cropped `image.width` instead. Stamping naturalWidth/Height on it here
  // makes the fixture behave like the real element type enterCrop expects.
  const canvasEl = (w: number, h: number) => {
    const c = document.createElement('canvas') as HTMLCanvasElement & { naturalWidth: number; naturalHeight: number }
    c.width = w
    c.height = h
    c.naturalWidth = w
    c.naturalHeight = h
    return c
  }

  beforeEach(() => {
    canvas = new fabric.Canvas(document.createElement('canvas'), { width: 400, height: 400 })
    useCanvasStore.setState({ canvas })
  })

  // 100x100 natural image, currently showing a 60x100 crop (cropX 10, cropY
  // 5) at scale 1, rotated 90 degrees, centred at scene (200, 200). Origin
  // 'center' so left/top *are* the scene centre regardless of angle, keeping
  // the fixture's own numbers easy to reason about by hand.
  function rotatedCroppedImage() {
    const img = new fabric.FabricImage(canvasEl(100, 100), {
      originX: 'center',
      originY: 'center',
      left: 200,
      top: 200,
      angle: 90,
      cropX: 10,
      cropY: 5,
      width: 60,
      height: 100,
    })
    canvas.add(img)
    canvas.setActiveObject(img)
    return img
  }

  it('enterCrop captures angle + a fixed centre, and expands along the rotated axis (not the screen axis)', () => {
    const img = rotatedCroppedImage()

    useCanvasStore.getState().enterCrop()

    const s = useCanvasStore.getState()
    expect(s.cropAngle).toBeCloseTo(90, 5)
    expect(s.cropCenter.x).toBeCloseTo(200, 5)
    expect(s.cropCenter.y).toBeCloseTo(200, 5)
    // dispLeft/Top = -30/-50 (half of 60x100); fullLeft/Top subtract off
    // cropX/cropY (10, 5) on top of that.
    expect(s.cropFull).toEqual({ left: -40, top: -55, width: 100, height: 100 })
    expect(s.cropInitial).toEqual({ left: -30, top: -50, width: 60, height: 100 })

    expect(img.cropX).toBe(0)
    expect(img.cropY).toBe(0)
    expect(img.width).toBe(100)
    expect(img.height).toBe(100)
    // Full bounds' local-frame centre is (10, -5) relative to cropCenter.
    // Rotated 90 degrees ((x,y) -> (-y,x) direction, matching fabric's own
    // convention — see cropGeometry.test.ts), that lands at (205, 210), not
    // the naive unrotated (210, 195) an angle-blind implementation would give.
    const d = fabric.util.qrDecompose(img.calcTransformMatrix())
    expect(d.translateX).toBeCloseTo(205, 5)
    expect(d.translateY).toBeCloseTo(210, 5)
  })

  it('applyCrop commits a new selection along the rotated axis and preserves the angle', () => {
    const img = rotatedCroppedImage()
    useCanvasStore.getState().enterCrop()

    useCanvasStore.getState().applyCrop({ left: -20, top: -30, width: 50, height: 60 })

    expect(img.cropX).toBeCloseTo(20, 5) // (-20) - (-40)
    expect(img.cropY).toBeCloseTo(25, 5) // (-30) - (-55)
    expect(img.width).toBeCloseTo(50, 5)
    expect(img.height).toBeCloseTo(60, 5)
    const d = fabric.util.qrDecompose(img.calcTransformMatrix())
    expect(d.angle).toBeCloseTo(90, 5)
    // New selection's local-frame centre is (5, 0) relative to cropCenter —
    // rotated 90 degrees that's (0, 5) added onto (200, 200).
    expect(d.translateX).toBeCloseTo(200, 5)
    expect(d.translateY).toBeCloseTo(205, 5)

    const s = useCanvasStore.getState()
    expect(s.cropImage).toBeNull()
    expect(s.cropAngle).toBe(0)
  })

  it('cancelCrop restores the exact pre-crop state regardless of rotation', () => {
    const img = rotatedCroppedImage()
    const centreBefore = img.getCenterPoint()
    useCanvasStore.getState().enterCrop()

    useCanvasStore.getState().cancelCrop()

    expect(img.cropX).toBe(10)
    expect(img.cropY).toBe(5)
    expect(img.width).toBe(60)
    expect(img.height).toBe(100)
    const centreAfter = img.getCenterPoint()
    expect(centreAfter.x).toBeCloseTo(centreBefore.x, 5)
    expect(centreAfter.y).toBeCloseTo(centreBefore.y, 5)
  })

  it("picks up a parent group's rotation, not just the image's own angle", () => {
    // Image itself is axis-aligned (angle 0); all the effective rotation
    // comes from the group it's nested in. calcTransformMatrix() composes
    // through ancestors, so enterCrop should report the group's angle.
    const img = new fabric.FabricImage(canvasEl(100, 100), {
      angle: 0,
      cropX: 0,
      cropY: 0,
      width: 100,
      height: 100,
    })
    const group = new fabric.Group([img], { left: 300, top: 300, angle: 60 })
    canvas.add(group)
    canvas.setActiveObject(img)

    useCanvasStore.getState().enterCrop()

    expect(useCanvasStore.getState().cropAngle).toBeCloseTo(60, 5)
  })
})

describe('duplicateActive / copyObjects / pasteObjects (UX-022)', () => {
  let canvas: fabric.Canvas

  beforeEach(() => {
    canvas = new fabric.Canvas(document.createElement('canvas'), { width: 400, height: 400 })
    useCanvasStore.setState({ canvas, objectClipboard: null, pasteCount: 0 })
  })

  it('duplicateActive adds an offset copy with a fresh id, and selects it', async () => {
    const rect = new fabric.Rect({ left: 50, top: 50, width: 100, height: 60, fill: '#f00' }) as fabric.Rect & {
      id?: string
    }
    rect.id = 'original-1'
    canvas.add(rect)
    canvas.setActiveObject(rect)

    await useCanvasStore.getState().duplicateActive()

    expect(canvas.getObjects()).toHaveLength(2)
    const clone = canvas.getObjects()[1] as fabric.Rect & { id?: string }
    expect(clone.id).toBeDefined()
    expect(clone.id).not.toBe('original-1')
    expect(clone.left).toBe(62) // 50 + DUPLICATE_OFFSET (12)
    expect(clone.top).toBe(62)
    expect(canvas.getActiveObject()).toBe(clone)
    // The original is untouched.
    expect(rect.left).toBe(50)
  })

  it('duplicateActive on a multi-selection duplicates every object and reselects the copies', async () => {
    const a = new fabric.Rect({ left: 0, top: 0, width: 10, height: 10 })
    const b = new fabric.Rect({ left: 20, top: 0, width: 10, height: 10 })
    canvas.add(a, b)
    canvas.setActiveObject(new fabric.ActiveSelection([a, b], { canvas }))

    await useCanvasStore.getState().duplicateActive()

    expect(canvas.getObjects()).toHaveLength(4)
    const active = canvas.getActiveObject()
    expect(active?.type).toBe('activeselection')
    expect((active as fabric.ActiveSelection).getObjects()).toHaveLength(2)
  })

  it('duplicateActive carries over a drop-shadow effect (the native shadow slot survives a plain clone)', async () => {
    const rect = new fabric.Rect({ left: 0, top: 0, width: 10, height: 10 }) as fabric.Rect & {
      id?: string
      effects?: unknown
    }
    rect.id = 'host-1'
    rect.effects = [DROP_SHADOW_DEFAULT]
    rect.set('shadow', new fabric.Shadow({ color: DROP_SHADOW_DEFAULT.color, blur: DROP_SHADOW_DEFAULT.blur }))
    canvas.add(rect)
    canvas.setActiveObject(rect)

    await useCanvasStore.getState().duplicateActive()

    const clone = canvas.getObjects()[1] as fabric.Rect
    expect((clone.shadow as fabric.Shadow)?.color).toBe(DROP_SHADOW_DEFAULT.color)
    expect((clone.shadow as fabric.Shadow)?.blur).toBe(DROP_SHADOW_DEFAULT.blur)
  })

  it('duplicateActive rebuilds a second effect as a fresh clone tagged to the new object, not the original', async () => {
    const rect = new fabric.Rect({ left: 0, top: 0, width: 10, height: 10 }) as fabric.Rect & {
      id?: string
      effects?: unknown
    }
    rect.id = 'host-1'
    rect.effects = [DROP_SHADOW_DEFAULT, { ...DROP_SHADOW_DEFAULT, kind: 'glow', color: 'rgba(255,255,255,0.6)' }]
    canvas.add(rect)
    canvas.setActiveObject(rect)

    await useCanvasStore.getState().duplicateActive()

    const objs = canvas.getObjects()
    const clone = objs.find((o) => (o as { id?: string }).id !== 'host-1' && !isEffectClone(o)) as fabric.Rect & {
      id?: string
    }
    const effectClones = objs.filter(isEffectClone)
    expect(effectClones).toHaveLength(1) // only the duplicate's own — the original never had one to begin with
    expect((effectClones[0] as unknown as { effectHostId?: string }).effectHostId).toBe(clone.id)
  })

  it('copyObjects + pasteObjects adds an offset copy; empty clipboard paste is a no-op', async () => {
    const rect = new fabric.Rect({ left: 0, top: 0, width: 10, height: 10 })
    canvas.add(rect)
    canvas.setActiveObject(rect)

    // Nothing copied yet — paste is a no-op.
    await useCanvasStore.getState().pasteObjects()
    expect(canvas.getObjects()).toHaveLength(1)

    await useCanvasStore.getState().copyObjects()
    await useCanvasStore.getState().pasteObjects()

    expect(canvas.getObjects()).toHaveLength(2)
    const pasted = canvas.getObjects()[1] as fabric.Rect
    expect(pasted.left).toBe(16) // 0 + PASTE_OFFSET (16) * 1st paste
    expect(canvas.getActiveObject()).toBe(pasted)
  })

  it('repeated pasteObjects cascades the offset further each time, from the original copied position', async () => {
    const rect = new fabric.Rect({ left: 100, top: 100, width: 10, height: 10 })
    canvas.add(rect)
    canvas.setActiveObject(rect)
    await useCanvasStore.getState().copyObjects()

    await useCanvasStore.getState().pasteObjects()
    await useCanvasStore.getState().pasteObjects()

    const objs = canvas.getObjects()
    expect(objs).toHaveLength(3)
    expect((objs[1] as fabric.Rect).left).toBe(116) // 100 + 16*1
    expect((objs[2] as fabric.Rect).left).toBe(132) // 100 + 16*2 — from the original, not stacked off the 1st paste
  })

  it('copyObjects with no selection is a no-op (clipboard stays empty)', async () => {
    await useCanvasStore.getState().copyObjects()
    expect(useCanvasStore.getState().objectClipboard).toBeNull()
  })
})
