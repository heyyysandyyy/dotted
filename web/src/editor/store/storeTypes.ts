import type * as fabric from 'fabric'
import type { UnitId, SizePreset } from '../constants'
import type { PageData, Guides } from '../storage'
import type { StarterTemplate } from '../templates'
import type { AlignMode, ShadowEffect } from '../utils'

export type ShapeKind = 'rect' | 'roundedRect' | 'ellipse' | 'triangle' | 'line' | 'arrow'

/** Drag-time alignment-guide snapping (CLR-004): off, or smart guides. */
export type SnapMode = 'none' | 'guides'

/** Grid overlay rendering style (UX-005). */
export type GridStyle = 'lines' | 'dots'

/** A rectangle in the crop's own local (unrotated) axes (UX-009 crop; made
 *  relative to the image's own centre rather than absolute scene coordinates
 *  in UX-021, so the same box shape works whether or not the image is
 *  rotated — see cropAngle on CanvasState and cropGeometry.ts). */
export interface CropBox {
  left: number
  top: number
  width: number
  height: number
}

/** Format-painter state (UX-007): off, paste-once-then-exit, or sticky. */
export type PainterMode = 'off' | 'once' | 'sticky'

/** Grid overlay + snap settings (UX-005). */
export interface GridSettings {
  visible: boolean
  size: number
  style: GridStyle
  snap: boolean
}

/** Canvas view: edit one page, or see all pages stacked (TPL-001). */
export type ViewMode = 'single' | 'stack'

/** How a book spread page is framed in the viewport (UX-015): both pages at
 *  once, or fitted to a single page at a time. */
export type SpreadView = 'sideBySide' | 'single'

/** Project, pages, background, and persistence. */
export interface ProjectSlice {
  width: number
  height: number
  /** Editable name of the open project (used for filenames and the project list). */
  designName: string
  /** Id of the project currently open in the editor (null before first load). */
  currentProjectId: string | null
  /** Pages of the open design; the active page's content lives in the canvas. */
  pages: PageData[]
  /** Id of the page currently shown on the canvas. */
  activePageId: string
  /** Whether the editor shows one page or all pages stacked. */
  viewMode: ViewMode
  /** Mirror of the artboard's solid background colour ('' when transparent). */
  backgroundColor: string

  setDesignName: (name: string) => void
  /** Resize the artboard, preserving existing objects. */
  setDimensions: (w: number, h: number) => void
  /** Start a fresh blank project at the given size and switch to it. */
  newProject: (w: number, h: number) => void
  /** Start a new project pre-filled from a starter template (TPL-003). */
  newProjectFromTemplate: (tpl: StarterTemplate) => void
  /** Start a book project: one cover page + pageCount/2 spread pages, all
   *  book-typed with bleed baked into their size (UX-015). */
  newBookProject: (preset: SizePreset, pageCount: number) => void
  /** Save the current design as a reusable template (TPL-004). */
  saveAsTemplate: (name: string) => boolean
  /** Start a new project from a user-saved template by id (TPL-004). */
  newProjectFromSavedTemplate: (templateId: string) => void
  /** Load a saved project by id, replacing the canvas contents. */
  openProject: (id: string) => void
  /** Persist the current project's name (after the user edits it). */
  renameProject: () => void
  /** Delete a project; if it's the current one, switch to another (or a new one). */
  deleteProjectById: (id: string) => void
  /** Duplicate a project; returns the copy's id (or null on failure). */
  duplicateProjectById: (id: string) => string | null
  /** Serialize the live canvas into the active page and persist the project. */
  saveCurrentProject: () => void
  /** Add a blank page after the active one and switch to it. */
  addPage: () => void
  /** Switch to a page by id, persisting the current page first. */
  selectPage: (id: string) => void
  /** Delete a page (no-op when it's the only page). */
  deletePage: (id: string) => void
  /** Duplicate a page, inserting the copy right after it. */
  duplicatePage: (id: string) => void
  /** Move a page from one index to another; undoable as a single "Reorder
   *  pages" step (BOOK-003). No-op for an out-of-range or same-index move. */
  reorderPages: (fromIndex: number, toIndex: number) => void
  /** Switch between single-page editing and the all-pages stack view. */
  setViewMode: (mode: ViewMode) => void
  /** Resize the artboard; optionally scale all objects to fit. Undoable (UX-014). */
  resizeCanvas: (width: number, height: number, scaleContent: boolean) => void
  /** Resize the artboard to exactly wrap all objects (and shift them to 0,0). */
  fitToContent: () => void
  /** Restore a project state (pages + active page + dimensions) for undo/redo. */
  applyHistorySnapshot: (
    pages: PageData[],
    activePageId: string,
    width?: number,
    height?: number,
  ) => Promise<void>
  /** Set the artboard's solid background colour. */
  setBackgroundColor: (color: string) => void
  /** Set an image (covering the artboard) as the background. */
  setBackgroundImageFromFile: (file: File) => void
  /** Clear the background colour and image (transparent artboard). */
  clearBackground: () => void
  /** Refresh the backgroundColor mirror from the live canvas (after load/undo). */
  syncBackgroundFromCanvas: () => void
}

/** View settings: zoom, rulers, grid, guides, and alignment-guide snapping. */
export interface ViewSlice {
  /** Display scale applied to the artboard (UX-013). 1 = 100%. */
  zoom: number
  /** Artboard pan offset from centred, in screen px (UX-013). */
  pan: { x: number; y: number }
  /** When true, zoom auto-fits the artboard to the viewport on resize (UX-013). */
  fitMode: boolean
  /** Drag-time alignment-guide snapping (CLR-004). */
  snapMode: SnapMode
  /** Grid overlay + snap settings (UX-005). */
  grid: GridSettings
  /** Whether the measurement rulers are shown around the canvas (UX-004). */
  showRulers: boolean
  /** Unit the rulers display in (UX-004). */
  rulerUnit: UnitId
  /** Manual ruler guides, in canvas px (UX-004). */
  guides: Guides
  /** Whether guides are visible/active (UX-004). */
  showGuides: boolean
  /** Whether objects snap to guides while dragging (UX-004). */
  snapGuides: boolean
  /** Book spread framing (UX-015): side-by-side (both pages) or single (one at a time). */
  spreadView: SpreadView
  /** Guides the dragging object is currently snapped to (transient highlight). */
  activeGuides: Guides

  /** Set zoom manually (clamped), leaving fit-mode (user-driven zoom). */
  setZoom: (z: number) => void
  /** Set zoom without leaving fit-mode (used by the auto-fit computation). */
  setZoomRaw: (z: number) => void
  /** Re-enable auto-fit so the artboard refits the viewport. */
  fitToView: () => void
  /** Set the artboard pan offset (screen px from centred). */
  setPan: (x: number, y: number) => void
  /** Set the drag-time alignment-guide snapping mode. */
  setSnapMode: (mode: SnapMode) => void
  /** Show/hide the grid overlay (UX-005). */
  toggleGrid: () => void
  /** Set the grid size in px (UX-005). */
  setGridSize: (size: number) => void
  /** Set the grid rendering style (UX-005). */
  setGridStyle: (style: GridStyle) => void
  /** Enable/disable snapping objects to the grid (UX-005). */
  toggleGridSnap: () => void
  /** Show/hide the measurement rulers (UX-004). */
  toggleRulers: () => void
  /** Change the ruler display unit (UX-004). */
  setRulerUnit: (unit: UnitId) => void
  /** Add a guide; orientation 'horizontal' (y) or 'vertical' (x), in canvas px. */
  addGuide: (orientation: 'horizontal' | 'vertical', pos: number) => void
  /** Move guide at `index` to a new position (persisted; call on drag end). */
  updateGuide: (orientation: 'horizontal' | 'vertical', index: number, pos: number) => void
  /** Remove guide at `index` (e.g. dragged back onto the ruler). */
  removeGuide: (orientation: 'horizontal' | 'vertical', index: number) => void
  /** Remove every guide. */
  clearGuides: () => void
  /** Show/hide all guides (UX-004). */
  toggleGuides: () => void
  /** Enable/disable snapping objects to guides (UX-004). */
  toggleSnapGuides: () => void
  /** Set the guides currently being snapped to (highlight; not persisted). */
  setActiveGuides: (g: Guides) => void
  /** Set the spread framing and re-enable auto-fit so it takes effect immediately. */
  setSpreadView: (v: SpreadView) => void
}

/** The live canvas, selection, object operations, and style/painter. */
export interface ObjectsSlice {
  /** The live Fabric.js canvas instance. Components must never mutate it directly. */
  canvas: fabric.Canvas | null
  /** Currently selected objects (mirror of fabric's active selection). */
  selection: fabric.FabricObject[]
  /** Bumped whenever a selected object is transformed, to refresh read-outs. */
  tick: number
  /** Style copied from an object, for paste-style / format painter (UX-007). */
  clipboardStyle: Record<string, unknown> | null
  /** Format-painter mode (UX-007). */
  painterMode: PainterMode
  /** True while a solid-background removal is processing (UX-010). */
  bgRemoving: boolean
  /** The image currently in crop mode, or null (UX-009). */
  cropImage: fabric.FabricImage | null
  /** Full (uncropped) image rect, in the image's own unrotated local axes,
   *  relative to cropCenter (fixed for the whole crop session — see below,
   *  *not* the image's current position, which enterCrop itself moves). */
  cropFull: CropBox | null
  /** Initial crop selection (the current crop), same local/cropCenter-
   *  relative frame as cropFull, for the overlay. */
  cropInitial: CropBox | null
  /** The image's effective rotation (own angle + any parent group's, via
   *  qrDecompose) at the moment crop mode was entered — fixed for the whole
   *  crop session (UX-021). 0 for an axis-aligned image; CropOverlay rotates
   *  its frame/handles/scrim by this to match the image's own orientation. */
  cropAngle: number
  /** The image's scene centre at the moment crop mode was entered — the
   *  fixed origin cropFull/cropInitial/the overlay's selection box are all
   *  relative to (UX-021). Captured once because enterCrop itself repositions
   *  the image (to show its full uncropped bounds), so re-reading the image's
   *  live position partway through a crop session would give the wrong
   *  origin — this is the one value that has to be a frozen snapshot. */
  cropCenter: { x: number; y: number }

  setCanvas: (c: fabric.Canvas | null) => void
  setSelection: (objs: fabric.FabricObject[]) => void
  bump: () => void

  /** Canonical way to add an object: every tool routes through here. */
  addObject: (obj: fabric.FabricObject) => void
  /** Quick-add a default rectangle (used to test selection/transform). */
  addBox: () => void
  /** Add a shape from the shape library. */
  addShape: (kind: ShapeKind) => void
  /** Add an editable, wrapping text box. */
  addText: () => void
  /** Read an image file, place it centred (base64), and persist it. */
  addImageFromFile: (file: File) => void
  /** Apply property changes to the single active object, live.
   *  Typed against Textbox so text + shape props are both accepted. */
  updateActive: (props: Partial<fabric.Textbox>) => void
  /** Programmatically select a single object (e.g. from the layers panel). */
  selectObject: (obj: fabric.FabricObject) => void
  /** Show or hide an object. */
  setObjectVisible: (obj: fabric.FabricObject, visible: boolean) => void
  /** Lock/unlock an object: locked objects can't be selected or edited on the
   *  canvas, but stay visible and exportable. */
  setObjectLocked: (obj: fabric.FabricObject, locked: boolean) => void
  /** Rename an object (layers panel); empty name clears back to the default. */
  setObjectName: (obj: fabric.FabricObject, name: string) => void
  /** Move the active selection by a pixel delta (arrow-key nudge). */
  nudge: (dx: number, dy: number) => void
  /** Align selected objects — to the canvas (one) or the selection box (many). */
  alignObjects: (mode: AlignMode) => void
  /** Evenly distribute 3+ selected objects along an axis (equal gaps). */
  distributeObjects: (axis: 'horizontal' | 'vertical') => void
  /** Delete the active selection. */
  deleteActive: () => void
  /** Copy the visual style of the (single) selected object (UX-007). */
  copyStyle: () => void
  /** Paste the copied style onto the selected object(s); undoable (UX-007). */
  pasteStyle: () => void
  /** Enter format-painter mode (copies the current style); sticky stays on. */
  startPainter: (sticky: boolean) => void
  /** Leave format-painter mode and restore the cursor. */
  exitPainter: () => void
  /** Paste the copied style onto a specific object (a format-painter click). */
  pasteStyleOnTarget: (obj: fabric.FabricObject) => void
  /** Remove a solid background from the selected image at the given colour
   *  tolerance; always re-processes from the original so it can be re-tuned. */
  removeImageBackground: (tolerance?: number) => void
  /** Set (or clear, passing null) one effect kind on the active object,
   *  independently of the other kind — both can be active at once (UX-011;
   *  independent toggling in UX-020 phase 2). */
  setShadowEffect: (kind: ShadowEffect['kind'], effect: ShadowEffect | null) => void
  /** Enter crop mode on the active image (shows the full image + selection). */
  enterCrop: () => void
  /** Commit the crop selection (scene rect) to the image; undoable (UX-009). */
  applyCrop: (rect: CropBox) => void
  /** Exit crop mode, restoring the image to its pre-crop state (UX-009). */
  cancelCrop: () => void
  /** Group the active multi-selection into a single group (UX-016). */
  groupSelection: () => void
  /** Ungroup the selected group back into its children at world positions (UX-016). */
  ungroupSelection: () => void
  /** Move an object to a position in the layer tree — a new bottom-first index
   *  within `toParent` (null = canvas root). Reorders in place when the object
   *  is already there; otherwise leaves its current parent (restoring world
   *  coordinates) and enters the new one (re-expressing them relative to it),
   *  so a drag between root and a group doesn't visually move anything (UX-018).
   *  Undoable, single history step. */
  moveLayerObject: (obj: fabric.FabricObject, toParent: fabric.Group | null, toIndex: number) => void
}

/** The full editor store: project + view + objects slices combined. */
export type CanvasState = ProjectSlice & ViewSlice & ObjectsSlice
