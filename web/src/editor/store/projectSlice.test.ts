import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fabric from 'fabric'
import { useCanvasStore } from './useCanvasStore'

describe('saveCurrentProject — saveError surfacing (data-loss fix)', () => {
  let canvas: fabric.Canvas

  beforeEach(() => {
    localStorage.clear()
    canvas = new fabric.Canvas(document.createElement('canvas'), { width: 100, height: 100 })
    useCanvasStore.setState({
      canvas,
      currentProjectId: 'proj-1',
      designName: 'Test',
      width: 100,
      height: 100,
      pages: [{ id: 'page-1', canvas: canvas.toObject() }],
      activePageId: 'page-1',
      saveError: null,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sets saveError when the underlying localStorage write throws (e.g. quota exceeded)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })

    useCanvasStore.getState().saveCurrentProject()

    expect(useCanvasStore.getState().saveError).toMatch(/storage is full/)
  })

  it('leaves saveError null on a normal successful save', () => {
    useCanvasStore.getState().saveCurrentProject()
    expect(useCanvasStore.getState().saveError).toBeNull()
  })

  it('clears a previous saveError once a save succeeds again', () => {
    useCanvasStore.setState({ saveError: 'stale error from before' })
    useCanvasStore.getState().saveCurrentProject()
    expect(useCanvasStore.getState().saveError).toBeNull()
  })

  it('setSaveError lets the UI dismiss the banner directly', () => {
    useCanvasStore.setState({ saveError: 'something failed' })
    useCanvasStore.getState().setSaveError(null)
    expect(useCanvasStore.getState().saveError).toBeNull()
  })
})
