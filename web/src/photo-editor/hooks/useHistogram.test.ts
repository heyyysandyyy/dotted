import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useHistogram } from './useHistogram'
import { DEFAULT_ADJUSTMENTS } from '../store/usePhotoEditorStore'
import { renderAdjustedImage } from '../utils/renderAdjustedImage'

vi.mock('../utils/renderAdjustedImage', () => ({ renderAdjustedImage: vi.fn(() => true) }))

const renderMock = vi.mocked(renderAdjustedImage)

/** A canvas whose readback is a single mid-grey pixel — enough for the hook
 *  to count, with no real 2d context involved. */
function fakeCanvasContext() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    getImageData: () => ({ data: new Uint8ClampedArray([128, 128, 128, 255]) }),
  } as unknown as CanvasRenderingContext2D)
}

function image(naturalWidth: number, naturalHeight: number) {
  return { naturalWidth, naturalHeight } as HTMLImageElement
}

describe('useHistogram (PHOTO-007 levels/curves)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    renderMock.mockClear()
  })

  it('counts the adjusted image once it has been rendered', async () => {
    fakeCanvasContext()
    // Hoisted out of the render callback: the hook holds its count against
    // the element it came from, so a fresh object per render would look
    // like a new image every time (in the app it's a decoded element that
    // only changes when the image does).
    const source = image(10, 10)
    const { result } = renderHook(() => useHistogram(source, DEFAULT_ADJUSTMENTS))

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current?.rgb[128]).toBe(1)
  })

  it('counts a downscaled copy, capped on the longest edge and keeping the aspect ratio', async () => {
    fakeCanvasContext()
    const source = image(1000, 500)
    renderHook(() => useHistogram(source, DEFAULT_ADJUSTMENTS))

    await waitFor(() => expect(renderMock).toHaveBeenCalled())
    const [, , width, height] = renderMock.mock.calls[0]
    expect(width).toBe(256)
    expect(height).toBe(128)
  })

  it('leaves a small image at its own size rather than scaling it up', async () => {
    fakeCanvasContext()
    const source = image(40, 30)
    renderHook(() => useHistogram(source, DEFAULT_ADJUSTMENTS))

    await waitFor(() => expect(renderMock).toHaveBeenCalled())
    const [, , width, height] = renderMock.mock.calls[0]
    expect(width).toBe(40)
    expect(height).toBe(30)
  })

  it('renders through the same pipeline as the preview, with the live adjustments', async () => {
    fakeCanvasContext()
    const adjustments = { ...DEFAULT_ADJUSTMENTS, levels: { black: 20, white: 255, gamma: 1 } }
    const source = image(10, 10)
    renderHook(() => useHistogram(source, adjustments))

    await waitFor(() => expect(renderMock).toHaveBeenCalled())
    expect(renderMock.mock.calls[0][4]).toBe(adjustments)
  })

  it('has nothing to count without an image', () => {
    const { result } = renderHook(() => useHistogram(null, DEFAULT_ADJUSTMENTS))
    expect(result.current).toBeNull()
    expect(renderMock).not.toHaveBeenCalled()
  })
})
