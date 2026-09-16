import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { useAdjustedPreviewCanvas } from './useAdjustedPreviewCanvas'
import { DEFAULT_ADJUSTMENTS } from '../store/usePhotoEditorStore'
import { renderAdjustedImage } from '../utils/renderAdjustedImage'

vi.mock('../utils/renderAdjustedImage', () => ({ renderAdjustedImage: vi.fn(() => true) }))

const renderMock = vi.mocked(renderAdjustedImage)

function image(naturalWidth: number, naturalHeight: number) {
  return { naturalWidth, naturalHeight } as HTMLImageElement
}

/** Mounts the hook onto a real canvas the way PhotoEditor does — the ref has
 *  to be attached to an element before the effect runs, which is the whole
 *  reason this is a component rather than a bare renderHook. */
function Harness({ source }: { source: HTMLImageElement }) {
  const ref = useAdjustedPreviewCanvas(source, DEFAULT_ADJUSTMENTS)
  return <canvas ref={ref} />
}

/** The (width, height) the preview render was asked for. */
async function renderedSizeFor(source: HTMLImageElement): Promise<[number, number]> {
  render(<Harness source={source} />)
  await waitFor(() => expect(renderMock).toHaveBeenCalled())
  const call = renderMock.mock.calls.at(-1)
  if (!call) throw new Error('render was never called')
  return [call[2], call[3]]
}

describe('useAdjustedPreviewCanvas', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    renderMock.mockClear()
  })

  it('renders a modest image at its own size', async () => {
    expect(await renderedSizeFor(image(800, 600))).toEqual([800, 600])
  })

  it('caps a large image on its longest edge, keeping the aspect ratio', async () => {
    // PHOTO-008's blur and unsharp mask walk the image several times over, so
    // a full-size render put a slider drag into seconds per frame. The cap is
    // safe because every spatial radius is a fraction of the render's own
    // shorter edge, so the proxy shows the look the full-size bake produces.
    const [width, height] = await renderedSizeFor(image(4000, 3000))
    expect(Math.max(width, height)).toBe(1400)
    expect(width / height).toBeCloseTo(4000 / 3000, 2)
  })

  it('caps on the long edge for a portrait image too', async () => {
    const [width, height] = await renderedSizeFor(image(2000, 5000))
    expect(Math.max(width, height)).toBe(1400)
    expect(width / height).toBeCloseTo(2000 / 5000, 2)
  })

  it('never renders a zero-sized canvas for an extreme aspect ratio', async () => {
    const [width, height] = await renderedSizeFor(image(9000, 3))
    expect(width).toBeGreaterThan(0)
    expect(height).toBeGreaterThan(0)
  })
})
