import { describe, it, expect, afterEach, vi } from 'vitest'
import { downscaleDataUrl } from './downscaleImage'

const ORIGINAL_URL = 'data:image/png;base64,original'

/**
 * jsdom doesn't actually decode image bytes (a real `new Image()` load never
 * fires `onload` here) and its canvas 2D context rejects non-native
 * drawImage sources, so both Image and the canvas context are faked here —
 * this tests downscaleDataUrl's own branching (threshold, mime selection),
 * not the browser's real image/canvas pipeline (covered by manual/live
 * verification instead).
 */
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
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (
    this: HTMLCanvasElement,
    type?: string,
  ) {
    return `data:${type ?? 'image/png'};base64,downscaled`
  })
}

describe('downscaleDataUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns SVG unchanged without touching Image at all', async () => {
    const result = await downscaleDataUrl(ORIGINAL_URL, 'image/svg+xml')
    expect(result).toBe(ORIGINAL_URL)
  })

  it('returns the original unchanged when already within the max dimension', async () => {
    fakeImage(800, 600)
    const result = await downscaleDataUrl(ORIGINAL_URL, 'image/jpeg', 2000)
    expect(result).toBe(ORIGINAL_URL)
  })

  it('downscales and re-encodes as PNG when the source is PNG (preserves transparency)', async () => {
    fakeImage(4000, 2000)
    fakeCanvasContext()
    const result = await downscaleDataUrl(ORIGINAL_URL, 'image/png', 2000)
    expect(result).not.toBe(ORIGINAL_URL)
    expect(result.startsWith('data:image/png')).toBe(true)
  })

  it('downscales and re-encodes as JPEG for a non-PNG source', async () => {
    fakeImage(4000, 2000)
    fakeCanvasContext()
    const result = await downscaleDataUrl(ORIGINAL_URL, 'image/jpeg', 2000)
    expect(result).not.toBe(ORIGINAL_URL)
    expect(result.startsWith('data:image/jpeg')).toBe(true)
  })

  it('scales to fit the longest edge, preserving aspect ratio', async () => {
    fakeImage(4000, 1000)
    fakeCanvasContext()
    let created: HTMLCanvasElement | undefined
    const realCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreateElement(tag)
      if (tag === 'canvas') created = el as HTMLCanvasElement
      return el
    })

    await downscaleDataUrl(ORIGINAL_URL, 'image/jpeg', 2000)

    expect(created?.width).toBe(2000)
    expect(created?.height).toBe(500)
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
    await expect(downscaleDataUrl(ORIGINAL_URL, 'image/jpeg')).rejects.toThrow()
  })
})
