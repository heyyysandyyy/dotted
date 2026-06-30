import type { StateCreator } from 'zustand'
import * as fabric from 'fabric'
import { DEFAULT_WIDTH, DEFAULT_HEIGHT } from '../constants'
import {
  saveProject,
  loadProject,
  deleteProject,
  duplicateProject,
  listProjects,
  setCurrentProjectId,
  saveTemplate,
  loadTemplate,
  EMPTY_GUIDES,
  type PageData,
} from '../storage'
import { useHistoryStore } from './useHistoryStore'
import { DEFAULT_NAME, serializeCanvas, loadCanvasFonts } from './storeHelpers'
import type { CanvasState, ProjectSlice } from './storeTypes'

export const createProjectSlice: StateCreator<CanvasState, [], [], ProjectSlice> = (set, get) => ({
  width: DEFAULT_WIDTH,
  height: DEFAULT_HEIGHT,
  designName: DEFAULT_NAME,
  currentProjectId: null,
  pages: [],
  activePageId: '',
  viewMode: 'single',
  backgroundColor: '#ffffff',

  setDesignName: (designName) => set({ designName }),

  setDimensions: (width, height) => {
    const { canvas } = get()
    if (canvas) {
      canvas.setDimensions({ width, height })
      canvas.requestRenderAll()
    }
    set({ width, height })
  },

  newProject: (width, height) => {
    const { canvas } = get()
    const id = crypto.randomUUID()
    const pageId = crypto.randomUUID()
    if (canvas) {
      canvas.clear()
      canvas.backgroundColor = '#ffffff'
      canvas.setDimensions({ width, height })
      canvas.requestRenderAll()
    }
    const pages: PageData[] = [{ id: pageId, canvas: canvas ? serializeCanvas(canvas) : { objects: [] } }]
    set({
      width,
      height,
      selection: [],
      designName: DEFAULT_NAME,
      currentProjectId: id,
      pages,
      activePageId: pageId,
      backgroundColor: '#ffffff',
      guides: { horizontal: [], vertical: [] },
    })
    setCurrentProjectId(id)
    // Persist the fresh blank project immediately so it appears in the list.
    saveProject({ id, name: DEFAULT_NAME, width, height, pages, activePageId: pageId, guides: EMPTY_GUIDES })
    useHistoryStore.getState().reset()
  },

  newProjectFromTemplate: (tpl) => {
    // Start a blank project at the template's size, then drop in its objects.
    get().newProject(tpl.width, tpl.height)
    const { canvas } = get()
    if (!canvas) return
    canvas.backgroundColor = tpl.background
    tpl.build().forEach((obj) => canvas.add(obj))
    canvas.requestRenderAll()
    set({ designName: tpl.name, backgroundColor: tpl.background })
    get().syncBackgroundFromCanvas()
    // Template content is the starting point, so reset history to it.
    useHistoryStore.getState().reset()
    get().saveCurrentProject()
  },

  saveAsTemplate: (name) => {
    const { canvas, designName, width, height, pages, activePageId } = get()
    if (!canvas) return false
    // Snapshot all pages (active synced from the live canvas), independent of
    // the project so later edits don't mutate the template.
    const snapPages = pages.map((p) => ({
      id: p.id,
      canvas: structuredClone(p.id === activePageId ? serializeCanvas(canvas) : p.canvas),
    }))
    return saveTemplate({
      id: crypto.randomUUID(),
      name: name.trim() || designName,
      width,
      height,
      pages: snapPages,
    })
  },

  newProjectFromSavedTemplate: (templateId) => {
    const { canvas } = get()
    const tpl = loadTemplate(templateId)
    if (!canvas || !tpl) return
    const id = crypto.randomUUID()
    // Fresh page ids so the new project is fully independent of the template.
    const pages: PageData[] = tpl.pages.map((p) => ({
      id: crypto.randomUUID(),
      canvas: structuredClone(p.canvas),
    }))
    const active = pages[0]
    set({
      width: tpl.width,
      height: tpl.height,
      selection: [],
      designName: tpl.name,
      currentProjectId: id,
      pages,
      activePageId: active.id,
    })
    canvas.setDimensions({ width: tpl.width, height: tpl.height })
    setCurrentProjectId(id)
    saveProject({ id, name: tpl.name, width: tpl.width, height: tpl.height, pages, activePageId: active.id })
    canvas.loadFromJSON(active.canvas).then(() => {
      canvas.requestRenderAll()
      loadCanvasFonts(canvas)
      get().syncBackgroundFromCanvas()
      useHistoryStore.getState().reset()
    })
  },

  openProject: (id) => {
    const { canvas } = get()
    const proj = loadProject(id)
    if (!canvas || !proj) return
    const active = proj.pages.find((p) => p.id === proj.activePageId) ?? proj.pages[0]
    set({
      width: proj.width,
      height: proj.height,
      selection: [],
      designName: proj.name,
      currentProjectId: id,
      pages: proj.pages,
      activePageId: active.id,
      guides: proj.guides ?? { horizontal: [], vertical: [] },
    })
    canvas.setDimensions({ width: proj.width, height: proj.height })
    setCurrentProjectId(id)
    canvas.loadFromJSON(active.canvas).then(() => {
      canvas.requestRenderAll()
      // Re-fetch the Google fonts the design uses, then repaint (BUG-001).
      loadCanvasFonts(canvas)
      // Mirror the restored background colour for the controls.
      get().syncBackgroundFromCanvas()
      // A loaded project is a fresh history baseline.
      useHistoryStore.getState().reset()
    })
  },

  renameProject: () => {
    if (!get().currentProjectId) return
    // Re-persist so the project index reflects the new name.
    get().saveCurrentProject()
  },

  deleteProjectById: (id) => {
    deleteProject(id)
    if (id !== get().currentProjectId) return
    // The open project was deleted — switch to the most recent remaining one,
    // or start a fresh project if none are left.
    const remaining = listProjects()
    if (remaining[0]) get().openProject(remaining[0].id)
    else get().newProject(DEFAULT_WIDTH, DEFAULT_HEIGHT)
  },

  duplicateProjectById: (id) => {
    // If duplicating the open project, flush its latest edits first so the
    // copy captures the on-screen state, not just the last debounced save.
    if (id === get().currentProjectId) get().saveCurrentProject()
    return duplicateProject(id, crypto.randomUUID())
  },

  saveCurrentProject: () => {
    const { canvas, currentProjectId, designName, width, height, pages, activePageId, guides } = get()
    if (!canvas || !currentProjectId) return
    // Sync the active page from the live canvas, then persist all pages.
    const synced = pages.map((p) =>
      p.id === activePageId ? { ...p, canvas: serializeCanvas(canvas) } : p,
    )
    set({ pages: synced })
    saveProject({ id: currentProjectId, name: designName, width, height, pages: synced, activePageId, guides })
  },

  addPage: () => {
    const { canvas, pages, activePageId } = get()
    if (!canvas) return
    // Capture the current page, then start a blank one after it.
    const synced = pages.map((p) =>
      p.id === activePageId ? { ...p, canvas: serializeCanvas(canvas) } : p,
    )
    const newPageId = crypto.randomUUID()
    canvas.clear()
    canvas.backgroundColor = '#ffffff'
    canvas.requestRenderAll()
    const idx = synced.findIndex((p) => p.id === activePageId)
    const next = [
      ...synced.slice(0, idx + 1),
      { id: newPageId, canvas: serializeCanvas(canvas) },
      ...synced.slice(idx + 1),
    ]
    set({ pages: next, activePageId: newPageId, selection: [], backgroundColor: '#ffffff' })
    // Record so adding a page is undoable (record() also auto-saves).
    useHistoryStore.getState().record('Added page')
  },

  selectPage: (pageId) => {
    const { canvas, pages, activePageId } = get()
    if (!canvas || pageId === activePageId) return
    const synced = pages.map((p) =>
      p.id === activePageId ? { ...p, canvas: serializeCanvas(canvas) } : p,
    )
    const target = synced.find((p) => p.id === pageId)
    if (!target) return
    set({ pages: synced, activePageId: pageId, selection: [] })
    canvas.loadFromJSON(target.canvas).then(() => {
      canvas.requestRenderAll()
      loadCanvasFonts(canvas)
      get().syncBackgroundFromCanvas()
      useHistoryStore.getState().record('Switched page')
    })
  },

  duplicatePage: (pageId) => {
    const { canvas, pages, activePageId } = get()
    // Sync the active page from the live canvas first so a duplicate of it
    // captures the latest edits.
    const synced = canvas
      ? pages.map((p) => (p.id === activePageId ? { ...p, canvas: serializeCanvas(canvas) } : p))
      : pages
    const idx = synced.findIndex((p) => p.id === pageId)
    if (idx < 0) return
    const copy: PageData = { id: crypto.randomUUID(), canvas: structuredClone(synced[idx].canvas) }
    const next = [...synced.slice(0, idx + 1), copy, ...synced.slice(idx + 1)]
    set({ pages: next })
    // Record so duplicating a page is undoable (record() also auto-saves).
    useHistoryStore.getState().record('Duplicated page')
  },

  setViewMode: (mode) => {
    // Flush the live canvas into the active page so previews are current.
    if (mode === 'stack') get().saveCurrentProject()
    set({ viewMode: mode })
  },

  applyHistorySnapshot: (pages, activePageId) => {
    const { canvas } = get()
    if (!canvas) return Promise.resolve()
    const active = pages.find((p) => p.id === activePageId) ?? pages[0]
    set({ pages, activePageId: active.id, selection: [] })
    return canvas.loadFromJSON(active.canvas).then(() => {
      canvas.requestRenderAll()
      loadCanvasFonts(canvas)
      get().syncBackgroundFromCanvas()
    })
  },

  deletePage: (pageId) => {
    const { canvas, pages, activePageId } = get()
    if (!canvas || pages.length <= 1) return
    const idx = pages.findIndex((p) => p.id === pageId)
    if (idx < 0) return
    const remaining = pages.filter((p) => p.id !== pageId)

    if (pageId !== activePageId) {
      set({ pages: remaining })
      // Record so deleting a page is undoable (record() also auto-saves).
      useHistoryStore.getState().record('Deleted page')
      return
    }
    // Deleting the active page → switch to a neighbour.
    const neighbour = remaining[Math.min(idx, remaining.length - 1)]
    set({ pages: remaining, activePageId: neighbour.id, selection: [] })
    canvas.loadFromJSON(neighbour.canvas).then(() => {
      canvas.requestRenderAll()
      loadCanvasFonts(canvas)
      get().syncBackgroundFromCanvas()
      useHistoryStore.getState().record('Deleted page')
    })
  },

  setBackgroundColor: (color) => {
    const { canvas } = get()
    if (!canvas) return
    canvas.backgroundColor = color
    canvas.requestRenderAll()
    set({ backgroundColor: color })
    // Background isn't an object, so trigger a history snapshot + auto-save.
    useHistoryStore.getState().scheduleRecord('Changed background')
  },

  setBackgroundImageFromFile: (file) => {
    // Defence-in-depth: the file picker's accept list is only a hint.
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      if (typeof dataUrl !== 'string') return
      fabric.FabricImage.fromURL(dataUrl).then((img) => {
        const { canvas, width, height } = get()
        if (!canvas) return
        // Scale to cover the artboard, centred.
        const scale = Math.max(width / (img.width || 1), height / (img.height || 1))
        img.set({ originX: 'center', originY: 'center', left: width / 2, top: height / 2, scaleX: scale, scaleY: scale })
        canvas.backgroundImage = img
        canvas.requestRenderAll()
        useHistoryStore.getState().scheduleRecord('Set background image')
      })
    }
    reader.readAsDataURL(file)
  },

  clearBackground: () => {
    const { canvas } = get()
    if (!canvas) return
    canvas.backgroundColor = ''
    canvas.backgroundImage = undefined
    canvas.requestRenderAll()
    set({ backgroundColor: '' })
    useHistoryStore.getState().scheduleRecord('Cleared background')
  },

  syncBackgroundFromCanvas: () => {
    const { canvas } = get()
    if (!canvas) return
    set({ backgroundColor: typeof canvas.backgroundColor === 'string' ? canvas.backgroundColor : '' })
  },
})
