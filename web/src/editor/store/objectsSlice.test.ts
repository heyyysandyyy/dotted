import { describe, it, expect, beforeEach } from 'vitest'
import * as fabric from 'fabric'
import { useCanvasStore } from './useCanvasStore'

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
