import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderAdjustedImage } from './renderAdjustedImage'
import { DEFAULT_ADJUSTMENTS } from '../store/usePhotoEditorStore'

function fakeCanvasContext() {
  const imageData = { data: new Uint8ClampedArray(16), width: 2, height: 2 }
  const ctx = {
    filter: '',
    drawImage: vi.fn(),
    getImageData: vi.fn().mockReturnValue(imageData),
    putImageData: vi.fn(),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  return ctx
}

describe('renderAdjustedImage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sizes the canvas and draws the source with the brightness/contrast CSS filter', () => {
    const canvas = document.createElement('canvas')
    const ctx = fakeCanvasContext()
    const source = {} as CanvasImageSource

    const ok = renderAdjustedImage(canvas, source, 100, 50, { ...DEFAULT_ADJUSTMENTS, brightness: 40 })

    expect(ok).toBe(true)
    expect(canvas.width).toBe(100)
    expect(canvas.height).toBe(50)
    expect(ctx.filter).toBe('brightness(1.4) contrast(1)')
    expect(ctx.drawImage).toHaveBeenCalledWith(source, 0, 0, 100, 50)
  })

  it('does not reset the canvas backing bitmap by reassigning width/height when they already match', () => {
    const canvas = document.createElement('canvas')
    canvas.width = 100
    canvas.height = 50
    fakeCanvasContext()
    let widthSets = 0
    Object.defineProperty(canvas, 'width', {
      get: () => 100,
      set: () => {
        widthSets++
      },
    })

    renderAdjustedImage(canvas, {} as CanvasImageSource, 100, 50, DEFAULT_ADJUSTMENTS)

    expect(widthSets).toBe(0)
  })

  it('skips the getImageData/putImageData tone pass when exposure/highlights/shadows are all neutral', () => {
    const canvas = document.createElement('canvas')
    const ctx = fakeCanvasContext()

    renderAdjustedImage(canvas, {} as CanvasImageSource, 10, 10, DEFAULT_ADJUSTMENTS)

    expect(ctx.getImageData).not.toHaveBeenCalled()
    expect(ctx.putImageData).not.toHaveBeenCalled()
  })

  it('runs the tone pass when exposure/highlights/shadows are touched', () => {
    const canvas = document.createElement('canvas')
    const ctx = fakeCanvasContext()

    renderAdjustedImage(canvas, {} as CanvasImageSource, 10, 10, { ...DEFAULT_ADJUSTMENTS, shadows: 30 })

    expect(ctx.getImageData).toHaveBeenCalledWith(0, 0, 10, 10)
    expect(ctx.putImageData).toHaveBeenCalled()
  })

  it('runs the pixel pass for a levels or curves edit, which no CSS filter can express', () => {
    const canvas = document.createElement('canvas')
    const ctx = fakeCanvasContext()

    renderAdjustedImage(canvas, {} as CanvasImageSource, 10, 10, {
      ...DEFAULT_ADJUSTMENTS,
      levels: { black: 24, white: 255, gamma: 1 },
    })

    expect(ctx.getImageData).toHaveBeenCalledWith(0, 0, 10, 10)
    expect(ctx.putImageData).toHaveBeenCalled()
  })

  it('runs the pixel pass for a PHOTO-008 detail edit, which no CSS filter can express', () => {
    const canvas = document.createElement('canvas')
    const ctx = fakeCanvasContext()

    renderAdjustedImage(canvas, {} as CanvasImageSource, 10, 10, { ...DEFAULT_ADJUSTMENTS, blur: 40 })

    expect(ctx.getImageData).toHaveBeenCalledWith(0, 0, 10, 10)
    expect(ctx.putImageData).toHaveBeenCalled()
  })

  it('still skips the pixel pass when only the sharpen radius moved, since that sharpens nothing', () => {
    const canvas = document.createElement('canvas')
    const ctx = fakeCanvasContext()

    renderAdjustedImage(canvas, {} as CanvasImageSource, 10, 10, { ...DEFAULT_ADJUSTMENTS, sharpenRadius: 100 })

    expect(ctx.getImageData).not.toHaveBeenCalled()
    expect(ctx.putImageData).not.toHaveBeenCalled()
  })

  it('returns false (no throw) when 2d context is unavailable, so callers can report the failure', () => {
    const canvas = document.createElement('canvas')
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

    let ok: boolean | undefined
    expect(() => {
      ok = renderAdjustedImage(canvas, {} as CanvasImageSource, 10, 10, DEFAULT_ADJUSTMENTS)
    }).not.toThrow()
    expect(ok).toBe(false)
  })
})
