import { describe, it, expect, afterEach, vi } from 'vitest'
import { flattenImage } from './flattenImage'

/** Same jsdom limitation as lib/downscaleImage.test.ts — Image never fires
 *  onload for real bytes here, and drawImage rejects non-native sources, so
 *  both are faked to test flattenImage's own logic (mime selection, filter
 *  applied, dimensions matched to the source). */
function fakeImage(width: number, height: number) {
  class FakeImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    naturalWidth = width
    naturalHeight = height
    set src(_v: string) {
      queueMicrotask(() => this.onload?.())
    }
  }
  vi.stubGlobal('Image', FakeImage)
}

function fakeCanvasContext() {
  const ctx = { filter: '', drawImage: vi.fn() }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (
    this: HTMLCanvasElement,
    type?: string,
  ) {
    return `data:${type ?? 'image/png'};base64,flattened`
  })
  return ctx
}

describe('flattenImage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('matches canvas dimensions to the source image, unchanged', async () => {
    fakeImage(640, 480)
    let created: HTMLCanvasElement | undefined
    const realCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreateElement(tag)
      if (tag === 'canvas') created = el as HTMLCanvasElement
      return el
    })
    fakeCanvasContext()

    await flattenImage('data:image/png;base64,orig', { brightness: 0, contrast: 0 })

    expect(created?.width).toBe(640)
    expect(created?.height).toBe(480)
  })

  it('applies the adjustment as a canvas filter before drawing', async () => {
    fakeImage(10, 10)
    const ctx = fakeCanvasContext()

    await flattenImage('data:image/png;base64,orig', { brightness: 40, contrast: -20 })

    expect(ctx.filter).toBe('brightness(1.4) contrast(0.8)')
    expect(ctx.drawImage).toHaveBeenCalled()
  })

  it('keeps PNG output for a PNG source (preserves transparency)', async () => {
    fakeImage(10, 10)
    fakeCanvasContext()
    const result = await flattenImage('data:image/png;base64,orig', { brightness: 0, contrast: 0 })
    expect(result.startsWith('data:image/png')).toBe(true)
  })

  it('re-encodes as JPEG for a non-PNG source', async () => {
    fakeImage(10, 10)
    fakeCanvasContext()
    const result = await flattenImage('data:image/jpeg;base64,orig', { brightness: 0, contrast: 0 })
    expect(result.startsWith('data:image/jpeg')).toBe(true)
  })

  it('rejects when the image fails to load', async () => {
    class FailingImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_v: string) {
        queueMicrotask(() => this.onerror?.())
      }
    }
    vi.stubGlobal('Image', FailingImage)
    await expect(flattenImage('data:image/png;base64,orig', { brightness: 0, contrast: 0 })).rejects.toThrow()
  })
})
