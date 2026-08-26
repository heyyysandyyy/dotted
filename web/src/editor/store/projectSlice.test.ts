import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fabric from 'fabric'
import { useCanvasStore } from './useCanvasStore'
import { DEFAULT_ADJUSTMENTS } from '../../photo-editor/store/usePhotoEditorStore'
import { findProductTemplate, productCanvasSize, productGuideSpec } from '../products'
import { listTemplates, loadProject } from '../storage'

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
    const edits = { ...DEFAULT_ADJUSTMENTS, brightness: 20, contrast: -10 }
    const ok = useCanvasStore.getState().portBackFromPhotoEditor(SOURCE_REF, 'data:image/png;base64,flattened', edits)

    expect(ok).toBe(true)
    const page = useCanvasStore.getState().pages.find((p) => p.id === 'page-1')!
    const objects = (page.canvas as { objects: Array<Record<string, unknown>> }).objects
    const img = objects.find((o) => o.id === 'img-1')!
    expect(img.src).toBe('data:image/png;base64,flattened')
    expect(img.edits).toEqual(edits)
    // Everything about its placement on the page is exactly as it was.
    expect(img).toMatchObject({ left: 5, top: 6, width: 200, height: 150, scaleX: 1, scaleY: 1, angle: 0, cropX: 10, cropY: 12 })
  })

  it('leaves other objects and other pages completely untouched', () => {
    useCanvasStore.getState().portBackFromPhotoEditor(SOURCE_REF, 'data:image/png;base64,flattened', DEFAULT_ADJUSTMENTS)

    const pages = useCanvasStore.getState().pages
    const page1Objects = (pages[0].canvas as { objects: Array<Record<string, unknown>> }).objects
    expect(page1Objects.find((o) => o.id === 'rect-1')).toEqual({ id: 'rect-1', type: 'rect' })
    expect(pages[1]).toEqual({ id: 'page-2', canvas: { objects: [] } })
  })

  it('persists the change to localStorage', () => {
    useCanvasStore.getState().portBackFromPhotoEditor(SOURCE_REF, 'data:image/png;base64,flattened', DEFAULT_ADJUSTMENTS)
    const raw = localStorage.getItem('dotted:project:proj-1')
    expect(raw).toContain('data:image/png;base64,flattened')
  })

  it('returns false and changes nothing when the page id no longer exists', () => {
    const before = useCanvasStore.getState().pages
    const ok = useCanvasStore
      .getState()
      .portBackFromPhotoEditor({ ...SOURCE_REF, pageId: 'gone' }, 'data:image/png;base64,flattened', DEFAULT_ADJUSTMENTS)
    expect(ok).toBe(false)
    expect(useCanvasStore.getState().pages).toBe(before)
  })

  it('returns false and changes nothing when the object id no longer exists on that page', () => {
    const before = useCanvasStore.getState().pages
    const ok = useCanvasStore
      .getState()
      .portBackFromPhotoEditor({ ...SOURCE_REF, objectId: 'gone' }, 'data:image/png;base64,flattened', DEFAULT_ADJUSTMENTS)
    expect(ok).toBe(false)
    expect(useCanvasStore.getState().pages).toBe(before)
  })

  it('returns false when there is no open project', () => {
    useCanvasStore.setState({ currentProjectId: null })
    const ok = useCanvasStore
      .getState()
      .portBackFromPhotoEditor(SOURCE_REF, 'data:image/png;base64,flattened', DEFAULT_ADJUSTMENTS)
    expect(ok).toBe(false)
  })

  it('sets saveError if the underlying persist fails, but still reports the port-back itself as successful', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })

    const ok = useCanvasStore
      .getState()
      .portBackFromPhotoEditor(SOURCE_REF, 'data:image/png;base64,flattened', DEFAULT_ADJUSTMENTS)

    expect(ok).toBe(true)
    expect(useCanvasStore.getState().saveError).toMatch(/storage is full/)
  })
})

describe('newProductProject (PROD-001)', () => {
  let canvas: fabric.Canvas

  beforeEach(() => {
    localStorage.clear()
    canvas = new fabric.Canvas(document.createElement('canvas'), { width: 100, height: 100 })
    useCanvasStore.setState({ canvas, pages: [], selection: [] })
  })

  const pin = findProductTemplate('pin-2-25')!

  it('creates one page sized at trim + bleed, carrying that product’s guide geometry', () => {
    useCanvasStore.getState().newProductProject(pin)

    const { pages, width, height } = useCanvasStore.getState()
    expect(pages).toHaveLength(1)
    expect({ width, height }).toEqual(productCanvasSize(pin))
    expect(pages[0].width).toBe(825)
    expect(pages[0].height).toBe(825)
    expect(pages[0].product).toEqual(productGuideSpec(pin))
  })

  it('resizes the live canvas to the artboard, on a white background', () => {
    useCanvasStore.getState().newProductProject(pin)

    expect(canvas.getWidth()).toBe(825)
    expect(canvas.getHeight()).toBe(825)
    expect(useCanvasStore.getState().backgroundColor).toBe('#ffffff')
  })

  it('persists the page immediately, so the guides survive a reload', () => {
    useCanvasStore.getState().newProductProject(pin)
    const id = useCanvasStore.getState().currentProjectId!

    const stored = loadProject(id)
    expect(stored?.pages[0].product).toEqual(productGuideSpec(pin))
  })

  it('starts a fresh project each time rather than adding to the open one', () => {
    useCanvasStore.getState().newProductProject(pin)
    const first = useCanvasStore.getState().currentProjectId

    useCanvasStore.getState().newProductProject(findProductTemplate('magnet-3')!)

    expect(useCanvasStore.getState().currentProjectId).not.toBe(first)
    expect(useCanvasStore.getState().pages).toHaveLength(1)
    expect(useCanvasStore.getState().pages[0].product?.templateId).toBe('magnet-3')
  })

  it('a second page of a product design inherits its size and guides', () => {
    useCanvasStore.getState().newProductProject(pin)

    useCanvasStore.getState().addPage()

    const { pages, activePageId } = useCanvasStore.getState()
    expect(pages).toHaveLength(2)
    const added = pages.find((p) => p.id === activePageId)!
    expect(added.width).toBe(825)
    expect(added.height).toBe(825)
    expect(added.product).toEqual(productGuideSpec(pin))
  })

  it('a duplicated product page keeps its guides', () => {
    useCanvasStore.getState().newProductProject(pin)
    const sourceId = useCanvasStore.getState().pages[0].id

    useCanvasStore.getState().duplicatePage(sourceId)

    const { pages } = useCanvasStore.getState()
    expect(pages).toHaveLength(2)
    expect(pages[1].product).toEqual(productGuideSpec(pin))
    expect(pages[1].id).not.toBe(sourceId)
  })

  it('leaves plain projects without any product metadata', () => {
    useCanvasStore.getState().newProject(400, 300)
    expect(useCanvasStore.getState().pages[0].product).toBeUndefined()

    useCanvasStore.getState().addPage()
    expect(useCanvasStore.getState().pages[1].product).toBeUndefined()
    expect(useCanvasStore.getState().pages[1].width).toBeUndefined()
  })
})

describe('saveAsTemplate — product pages (PROD-001)', () => {
  let canvas: fabric.Canvas

  beforeEach(() => {
    localStorage.clear()
    canvas = new fabric.Canvas(document.createElement('canvas'), { width: 100, height: 100 })
    useCanvasStore.setState({ canvas, pages: [], selection: [] })
  })

  it('keeps the guide geometry through save-as-template and back out again', () => {
    const pin = findProductTemplate('pin-3')!
    useCanvasStore.getState().newProductProject(pin)

    expect(useCanvasStore.getState().saveAsTemplate('Pin starter')).toBe(true)
    const template = listTemplates()[0]
    useCanvasStore.getState().newProjectFromSavedTemplate(template.id)

    const { pages, width } = useCanvasStore.getState()
    expect(width).toBe(1050)
    expect(pages[0].product).toEqual(productGuideSpec(pin))
  })
})
