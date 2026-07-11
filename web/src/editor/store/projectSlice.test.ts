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

describe('portBackFromPhotoEditor (PHOTO-006)', () => {
  const SOURCE_REF = { pageId: 'page-1', objectId: 'img-1', left: 5, top: 6, scaleX: 1, scaleY: 1, angle: 0, zIndex: 0 }
  const IMAGE_OBJ = {
    id: 'img-1',
    type: 'image',
    src: 'data:image/png;base64,original',
    left: 5,
    top: 6,
    width: 200,
    height: 150,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
    cropX: 10,
    cropY: 12,
  }

  beforeEach(() => {
    localStorage.clear()
    useCanvasStore.setState({
      canvas: null, // no live canvas — CanvasStage is unmounted for the whole Photo Editor session
      currentProjectId: 'proj-1',
      designName: 'Test',
      width: 800,
      height: 600,
      activePageId: 'page-1',
      pages: [
        { id: 'page-1', canvas: { objects: [IMAGE_OBJ, { id: 'rect-1', type: 'rect' }] } },
        { id: 'page-2', canvas: { objects: [] } },
      ],
      saveError: null,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('replaces src and adds edits on the matching object, leaving its geometry untouched', () => {
    const ok = useCanvasStore
      .getState()
      .portBackFromPhotoEditor(SOURCE_REF, 'data:image/png;base64,flattened', { brightness: 20, contrast: -10 })

    expect(ok).toBe(true)
    const page = useCanvasStore.getState().pages.find((p) => p.id === 'page-1')!
    const objects = (page.canvas as { objects: Array<Record<string, unknown>> }).objects
    const img = objects.find((o) => o.id === 'img-1')!
    expect(img.src).toBe('data:image/png;base64,flattened')
    expect(img.edits).toEqual({ brightness: 20, contrast: -10 })
    // Everything about its placement on the page is exactly as it was.
    expect(img).toMatchObject({ left: 5, top: 6, width: 200, height: 150, scaleX: 1, scaleY: 1, angle: 0, cropX: 10, cropY: 12 })
  })

  it('leaves other objects and other pages completely untouched', () => {
    useCanvasStore.getState().portBackFromPhotoEditor(SOURCE_REF, 'data:image/png;base64,flattened', { brightness: 0, contrast: 0 })

    const pages = useCanvasStore.getState().pages
    const page1Objects = (pages[0].canvas as { objects: Array<Record<string, unknown>> }).objects
    expect(page1Objects.find((o) => o.id === 'rect-1')).toEqual({ id: 'rect-1', type: 'rect' })
    expect(pages[1]).toEqual({ id: 'page-2', canvas: { objects: [] } })
  })

  it('persists the change to localStorage', () => {
    useCanvasStore.getState().portBackFromPhotoEditor(SOURCE_REF, 'data:image/png;base64,flattened', { brightness: 0, contrast: 0 })
    const raw = localStorage.getItem('dotted:project:proj-1')
    expect(raw).toContain('data:image/png;base64,flattened')
  })

  it('returns false and changes nothing when the page id no longer exists', () => {
    const before = useCanvasStore.getState().pages
    const ok = useCanvasStore
      .getState()
      .portBackFromPhotoEditor({ ...SOURCE_REF, pageId: 'gone' }, 'data:image/png;base64,flattened', { brightness: 0, contrast: 0 })
    expect(ok).toBe(false)
    expect(useCanvasStore.getState().pages).toBe(before)
  })

  it('returns false and changes nothing when the object id no longer exists on that page', () => {
    const before = useCanvasStore.getState().pages
    const ok = useCanvasStore
      .getState()
      .portBackFromPhotoEditor({ ...SOURCE_REF, objectId: 'gone' }, 'data:image/png;base64,flattened', { brightness: 0, contrast: 0 })
    expect(ok).toBe(false)
    expect(useCanvasStore.getState().pages).toBe(before)
  })

  it('returns false when there is no open project', () => {
    useCanvasStore.setState({ currentProjectId: null })
    const ok = useCanvasStore
      .getState()
      .portBackFromPhotoEditor(SOURCE_REF, 'data:image/png;base64,flattened', { brightness: 0, contrast: 0 })
    expect(ok).toBe(false)
  })

  it('sets saveError if the underlying persist fails, but still reports the port-back itself as successful', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })

    const ok = useCanvasStore
      .getState()
      .portBackFromPhotoEditor(SOURCE_REF, 'data:image/png;base64,flattened', { brightness: 0, contrast: 0 })

    expect(ok).toBe(true)
    expect(useCanvasStore.getState().saveError).toMatch(/storage is full/)
  })
})
