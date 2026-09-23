import { describe, it, expect, vi } from 'vitest'
import * as fabric from 'fabric'
import { renderPreview } from './preview'

describe('renderPreview (BUG-010)', () => {
  it('aborts the page load when the thumbnail unmounts, rather than letting it clear a disposed canvas', async () => {
    const loadSpy = vi.spyOn(fabric.StaticCanvas.prototype, 'loadFromJSON')
    const dispose = renderPreview(document.createElement('canvas'), { objects: [] }, 100, 100)

    const signal = loadSpy.mock.calls[0][2]?.signal
    expect(signal?.aborted).toBe(false)
    dispose()
    expect(signal?.aborted).toBe(true)

    // The aborted load must settle quietly — an unhandled rejection here is
    // the same class of noise the abort exists to remove.
    await new Promise((r) => setTimeout(r, 20))
    loadSpy.mockRestore()
  })

  it('renders the page at the requested size when it is left alone', async () => {
    const el = document.createElement('canvas')
    const dispose = renderPreview(el, { objects: [] }, 50, 40)
    await new Promise((r) => setTimeout(r, 50))
    expect([el.width, el.height]).toEqual([50, 40])
    dispose()
  })
})
