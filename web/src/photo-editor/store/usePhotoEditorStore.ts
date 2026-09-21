import { create } from 'zustand'
import {
  CURVE_CHANNELS,
  DEFAULT_CURVES,
  DEFAULT_LEVELS,
  IDENTITY_CURVE,
  LEVELS_LIMITS,
  normalizeCurvePoints,
} from '../utils/levelsCurves'
import type { CurveChannel, CurvePoint, PhotoCurves, PhotoLevels } from '../utils/levelsCurves'
import { DEFAULT_GEOMETRY, normalizeGeometry, sameGeometry } from '../utils/geometry'
import type { PhotoGeometry } from '../utils/geometry'
import { EMPTY_SELECTION, combineSelection, hasSelection, normalizeSelection, sameSelection } from '../utils/selection'
import type { PhotoSelection, SelectionOp } from '../utils/selection'

/**
 * Identifies the Canvas object an image came from, captured at the moment
 * "Edit in Photo Editor" is clicked (PHOTO-003). PHOTO-006 uses this to
 * find that same object again and replace it in place — position, size,
 * and z-order are captured now because they're only readable while the
 * Canvas route (and its live fabric objects) is actually mounted.
 */
export interface PhotoEditorSourceRef {
  pageId: string
  objectId: string
  left: number
  top: number
  scaleX: number
  scaleY: number
  angle: number
  zIndex: number
}

/**
 * Tonal and colour adjustment values for the loaded image.
 *
 * Most numeric fields are -100..100 with 0 = no change, deliberately on one
 * shared scale so a single clamp and a single slider component cover every
 * one of them. Two kinds of exception: fields whose unit isn't really
 * "percent" (`hue`'s ±100 is a ±180° turn of the colour wheel, see
 * colorPass.ts; `motionBlurAngle`'s is ±90° of streak direction, see
 * spatialPass.ts), and PHOTO-008's one-directional strengths, which run
 * 0..100 — see ADJUSTMENT_LIMITS, which is what actually enforces the range.
 *
 * Grouped by the phase that added them: brightness/contrast (PHOTO-004);
 * exposure/highlights/shadows (PHOTO-007 tone-controls phase); `saturation`
 * through `invert` (PHOTO-007 colour-controls phase); `sharpen` through
 * `grain` (PHOTO-008's sharpen/blur/noise tools, the first controls that
 * read neighbouring pixels rather than mapping each one on its own).
 * `levels` and `curves`
 * (PHOTO-007 levels/curves phase) break the one-number-per-control shape
 * deliberately — a curve is a variable-length list of control points and
 * levels is a black/white/gamma triple, neither of which a single -100..100
 * slider can express. They ride in the same snapshot regardless, so
 * PHOTO-005's undo/redo and PHOTO-006's stored edit metadata keep covering
 * every control with no second history stack. `geometry` (PHOTO-009's crop,
 * rotate, flip, perspective and resize) joins them on the same terms, and so
 * does `selection` (PHOTO-011) — making or changing a selection is an undo
 * step, and the selection the adjustments were confined to is saved with them.
 */
export interface ToneAdjustments {
  brightness: number
  contrast: number
  exposure: number
  highlights: number
  shadows: number
  saturation: number
  vibrance: number
  hue: number
  temperature: number
  tint: number
  redBalance: number
  greenBalance: number
  blueBalance: number
  blackAndWhite: boolean
  invert: boolean
  sharpen: number
  sharpenRadius: number
  blur: number
  motionBlur: number
  motionBlurAngle: number
  noiseReduction: number
  grain: number
  levels: PhotoLevels
  curves: PhotoCurves
}

/**
 * An adjustment layer (PHOTO-011 phase 2): its own full set of tone, colour
 * and detail settings, confined to its own mask and faded by its opacity.
 * Layers apply in order, each on top of the result of everything before it —
 * so one part of the photo can be brightened while another is desaturated.
 *
 * The mask *is* a selection (phase 1's model, unchanged): drawn with the same
 * marquee/lasso/wand tools while the layer is the active target. A layer with
 * nothing selected in its mask covers the whole photo, like an unmasked
 * adjustment layer in any photo editor.
 */
export interface AdjustmentLayer {
  id: string
  name: string
  visible: boolean
  /** 0..100 — how strongly the layer's result replaces what's beneath. */
  opacity: number
  selection: PhotoSelection
  adjustments: ToneAdjustments
}

/**
 * Everything one edit holds: the base tone/colour/detail settings, the
 * geometry (applies to the whole photo), the base selection they're confined
 * to (phase 1), and the adjustment layers on top.
 */
export interface PhotoAdjustments extends ToneAdjustments {
  geometry: PhotoGeometry
  selection: PhotoSelection
  layers: AdjustmentLayer[]
}

/** The -100..100 slider-backed fields, split off the on/off ones so
 *  setAdjustment/AdjustmentSlider can't be pointed at a boolean (and
 *  setToggle can't be pointed at a number) by mistake. `levels`/`curves`
 *  drop out of both automatically — neither extends `number` or `boolean` —
 *  so they can only be written through their own setters. */
export type NumericAdjustmentKey = {
  [K in keyof ToneAdjustments]: ToneAdjustments[K] extends number ? K : never
}[keyof ToneAdjustments]

/** The on/off fields — full black & white conversion and invert. */
export type ToggleAdjustmentKey = {
  [K in keyof ToneAdjustments]: ToneAdjustments[K] extends boolean ? K : never
}[keyof ToneAdjustments]

/** Every tone, colour and detail control at its neutral value. */
export const DEFAULT_TONE: ToneAdjustments = {
  brightness: 0,
  contrast: 0,
  exposure: 0,
  highlights: 0,
  shadows: 0,
  saturation: 0,
  vibrance: 0,
  hue: 0,
  temperature: 0,
  tint: 0,
  redBalance: 0,
  greenBalance: 0,
  blueBalance: 0,
  blackAndWhite: false,
  invert: false,
  sharpen: 0,
  // Mid-scale, so the sharpen amount works out of the box without the radius
  // having to be found first; it is still neutral, since radius does nothing
  // while amount is 0.
  sharpenRadius: 50,
  blur: 0,
  motionBlur: 0,
  motionBlurAngle: 0,
  noiseReduction: 0,
  grain: 0,
  levels: DEFAULT_LEVELS,
  curves: DEFAULT_CURVES,
}

export const DEFAULT_ADJUSTMENTS: PhotoAdjustments = {
  ...DEFAULT_TONE,
  geometry: DEFAULT_GEOMETRY,
  selection: EMPTY_SELECTION,
  layers: [],
}

/**
 * Range overrides for the numeric fields that aren't the shared -100..100.
 * PHOTO-008's neighbourhood controls are one-directional — there is no
 * negative amount of grain, and a negative blur radius isn't a thing — so
 * they run 0..100 with 0 as their neutral. `motionBlurAngle` keeps the full
 * signed range: it's a direction, not a strength.
 *
 * Enforced in the store rather than only on the slider's `min`, so a value
 * arriving from anywhere else (a restored history entry, PHOTO-006's stored
 * edit metadata) can't put the pass into a state its maths never expects.
 */
const ADJUSTMENT_LIMITS: Partial<Record<NumericAdjustmentKey, { min: number; max: number }>> = {
  sharpen: { min: 0, max: 100 },
  sharpenRadius: { min: 0, max: 100 },
  blur: { min: 0, max: 100 },
  motionBlur: { min: 0, max: 100 },
  noiseReduction: { min: 0, max: 100 },
  grain: { min: 0, max: 100 },
}

const clampAdjustment = (key: NumericAdjustmentKey, v: number) => {
  const { min, max } = ADJUSTMENT_LIMITS[key] ?? { min: -100, max: 100 }
  return Math.max(min, Math.min(max, v))
}

const HISTORY_DEBOUNCE_MS = 300
// Module-level like useHistoryStore's own debounceTimer (Canvas) — a drag
// gesture fires many onChange calls; only the settled value after a pause
// becomes one undo step, not one step per pixel of drag.
let historyDebounceTimer: ReturnType<typeof setTimeout> | null = null

function samePoints(a: CurvePoint[], b: CurvePoint[]): boolean {
  return a === b || (a.length === b.length && a.every((p, i) => p.x === b[i].x && p.y === b[i].y))
}

// Driven off DEFAULT_ADJUSTMENTS' own keys so a field added later is
// compared by default rather than silently ignored. `levels` and `curves`
// are the two that need looking into rather than an identity check, since
// every edit to them produces a fresh object.
export function sameTone(a: ToneAdjustments, b: ToneAdjustments): boolean {
  return (Object.keys(DEFAULT_TONE) as (keyof ToneAdjustments)[]).every((key) => {
    if (key === 'levels') {
      return a.levels.black === b.levels.black && a.levels.white === b.levels.white && a.levels.gamma === b.levels.gamma
    }
    if (key === 'curves') return CURVE_CHANNELS.every((channel) => samePoints(a.curves[channel], b.curves[channel]))
    return a[key] === b[key]
  })
}

/** True when a tone set changes nothing — an untouched layer is skipped. */
export function isNeutralTone(tone: ToneAdjustments): boolean {
  return sameTone(tone, DEFAULT_TONE)
}

function sameLayer(a: AdjustmentLayer, b: AdjustmentLayer): boolean {
  return (
    a === b ||
    (a.id === b.id &&
      a.name === b.name &&
      a.visible === b.visible &&
      a.opacity === b.opacity &&
      sameSelection(a.selection, b.selection) &&
      sameTone(a.adjustments, b.adjustments))
  )
}

function sameAdjustments(a: PhotoAdjustments, b: PhotoAdjustments): boolean {
  return (
    sameTone(a, b) &&
    sameGeometry(a.geometry, b.geometry) &&
    sameSelection(a.selection, b.selection) &&
    a.layers.length === b.layers.length &&
    a.layers.every((layer, i) => sameLayer(layer, b.layers[i]))
  )
}

/** The layer the tone panels and selection tools are editing, or null for
 *  the base image. A layer id that no longer exists (undone, deleted) falls
 *  back to the base rather than pointing at nothing. */
export function activeLayer(s: { adjustments: PhotoAdjustments; activeLayerId: string | null }): AdjustmentLayer | null {
  if (!s.activeLayerId) return null
  return s.adjustments.layers.find((l) => l.id === s.activeLayerId) ?? null
}

/** The tone settings being edited: the active layer's, or the base's. */
export function selectActiveTone(s: { adjustments: PhotoAdjustments; activeLayerId: string | null }): ToneAdjustments {
  return activeLayer(s)?.adjustments ?? s.adjustments
}

/** The selection being edited: the active layer's mask, or the base's. */
export function selectActiveSelection(s: { adjustments: PhotoAdjustments; activeLayerId: string | null }): PhotoSelection {
  return activeLayer(s)?.selection ?? s.adjustments.selection
}

/**
 * Photo Editor session state (PHOTO-001). Deliberately its own store, not a
 * slice of useCanvasStore — Canvas and Photo Editor are separate workspaces
 * with no shared toolbars or state (three-workspace model), and this
 * session is explicitly ephemeral (flattened + discarded on exit per
 * PHOTO-006), unlike a Canvas project which persists to localStorage.
 *
 * Holds the loaded image, PHOTO-003's source reference, PHOTO-004's
 * adjustment values, and PHOTO-005's undo/redo stack for them — a simple
 * linear stack of adjustment snapshots, session-scoped only (reset whenever
 * a new image loads, same as the adjustments themselves).
 */
export type SelectionTool = 'rect' | 'ellipse' | 'lasso' | 'wand' | 'brush' | 'gradient'
export type GradientShape = 'linear' | 'radial'
export type SelectionCombine = 'new' | 'add' | 'subtract'

/** The wand's default reach: a colour within about an eighth of the range. */
export const DEFAULT_WAND_TOLERANCE = 12

/** Brush defaults: a middling size, and an edge soft enough that strokes
 *  blend rather than showing a hard rim (PHOTO-011 phase 3). */
export const DEFAULT_BRUSH_SIZE = 25
export const DEFAULT_BRUSH_HARDNESS = 50

interface PhotoEditorState {
  /** The loaded image, as a data URL — null means the empty state shows. */
  image: string | null
  /** Set only when the image arrived via Edit-from-Canvas; null for a direct upload (PHOTO-002). */
  sourceRef: PhotoEditorSourceRef | null
  /** Live adjustment values for the current image — reset whenever a new image loads (PHOTO-004). */
  adjustments: PhotoAdjustments
  /** Committed adjustment snapshots (PHOTO-005); historyIndex points at the current one. */
  historyStack: PhotoAdjustments[]
  historyIndex: number
  setImage: (image: string | null) => void
  /** PHOTO-003: entry point from a Canvas image's "Edit in Photo Editor" action. */
  openFromCanvas: (image: string, sourceRef: PhotoEditorSourceRef) => void
  /** Set one slider-backed adjustment, clamped to -100..100. Debounced into one undo step per settled change. */
  setAdjustment: (key: NumericAdjustmentKey, value: number) => void
  /** Set one on/off adjustment (black & white, invert) — undoable on the same debounced path. */
  setToggle: (key: ToggleAdjustmentKey, value: boolean) => void
  /** Which adjustment layer the tone panels and selection tools edit — null
   *  for the base image (PHOTO-011 phase 2). UI state: not in history. */
  activeLayerId: string | null
  selectLayer: (id: string | null) => void
  /** Add an adjustment layer on top and make it the one being edited. Its
   *  mask is the base selection if there is one (which then leaves the base,
   *  so it isn't applied twice), else the whole photo. */
  addLayer: () => void
  deleteLayer: (id: string) => void
  setLayerVisible: (id: string, visible: boolean) => void
  setLayerOpacity: (id: string, opacity: number) => void
  renameLayer: (id: string, name: string) => void
  /** Move a layer one place up (1, applied later) or down (-1) the stack. */
  moveLayer: (id: string, direction: 1 | -1) => void
  /** Reset one adjustment back to its neutral default — itself undoable.
   *  For `levels`/`curves` that resets the whole group at once; the
   *  per-field/per-channel resets are resetLevel/resetCurve. */
  resetAdjustment: (key: keyof PhotoAdjustments) => void
  /** Set one input-levels field, clamped to LEVELS_LIMITS. Black and white
   *  may never cross: the field being set wins and pushes the other aside. */
  setLevel: (key: keyof PhotoLevels, value: number) => void
  /** Reset one input-levels field to its neutral default, leaving the other
   *  two where they are. */
  resetLevel: (key: keyof PhotoLevels) => void
  /** Replace one curve's control points — normalized (clamped, sorted,
   *  de-duplicated on x) on the way in, so no other consumer has to. */
  setCurve: (channel: CurveChannel, points: CurvePoint[]) => void
  /** Reset one curve back to the straight-through identity. */
  resetCurve: (channel: CurveChannel) => void
  /** Change any geometry fields (PHOTO-009), normalized into range — undoable
   *  on the same debounced path as every other control. Reset the lot with
   *  resetAdjustment('geometry'). */
  setGeometry: (patch: Partial<PhotoGeometry>) => void
  /** Turn the displayed image 90° clockwise (1) or anticlockwise (-1) —
   *  crop and keystone included, so the same content stays framed. */
  rotate90: (direction: 1 | -1) => void
  /** Mirror the displayed image across its vertical ('h') or horizontal ('v')
   *  axis — crop, keystone, straighten and rotation included. */
  flip: (axis: 'h' | 'v') => void
  /** Whether the crop tool is open — the preview then shows the whole frame
   *  with the crop box over it. UI state, not an edit: never in history. */
  cropMode: boolean
  setCropMode: (on: boolean) => void
  /** The crop tool's locked aspect ratio (width ÷ height), or null for free. */
  cropAspect: number | null
  setCropAspect: (aspect: number | null) => void
  /** Add a finished marquee/lasso/wand operation to the selection
   *  (PHOTO-011): 'new' replaces it, 'add'/'subtract' combine with it. */
  applySelectionOp: (op: SelectionOp, combine: SelectionCombine) => void
  setSelectionFeather: (feather: number) => void
  invertSelection: () => void
  /** Deselect — adjustments go back to applying to the whole photo. */
  clearSelection: () => void
  /** The selection tool drawing on the preview, if any. UI state, not an
   *  edit: never in history. Mutually exclusive with the crop tool. */
  selectionTool: SelectionTool | null
  setSelectionTool: (tool: SelectionTool | null) => void
  /** How the next finished shape combines with the selection. */
  selectionCombine: SelectionCombine
  setSelectionCombine: (combine: SelectionCombine) => void
  /** The magic wand's settings for its next click. */
  wandTolerance: number
  wandContiguous: boolean
  setWandTolerance: (tolerance: number) => void
  setWandContiguous: (contiguous: boolean) => void
  /** The brush's settings for its next stroke (1..100 each). */
  brushSize: number
  brushHardness: number
  setBrushSize: (size: number) => void
  setBrushHardness: (hardness: number) => void
  /** Whether the gradient tool draws a graduated (linear) or radial mask. */
  gradientShape: GradientShape
  setGradientShape: (shape: GradientShape) => void
  /** Tint the selected area on the preview, so a mask can be seen rather
   *  than guessed at from its outline. */
  showMask: boolean
  setShowMask: (show: boolean) => void
  undo: () => void
  redo: () => void
}

/** Crop- and selection-tool UI state, and which layer is being edited, go
 *  back to closed/defaults/base with every new image. */
function resetTools() {
  return {
    cropMode: false,
    cropAspect: null,
    selectionTool: null,
    selectionCombine: 'new' as SelectionCombine,
    wandTolerance: DEFAULT_WAND_TOLERANCE,
    wandContiguous: true,
    brushSize: DEFAULT_BRUSH_SIZE,
    brushHardness: DEFAULT_BRUSH_HARDNESS,
    gradientShape: 'linear' as GradientShape,
    showMask: true,
    activeLayerId: null,
  }
}

function resetHistory(): { historyStack: PhotoAdjustments[]; historyIndex: number } {
  if (historyDebounceTimer) {
    clearTimeout(historyDebounceTimer)
    historyDebounceTimer = null
  }
  return { historyStack: [DEFAULT_ADJUSTMENTS], historyIndex: 0 }
}

export const usePhotoEditorStore = create<PhotoEditorState>((set, get) => {
  /** Applies one field change live and schedules the debounced history push —
   *  the single write path every setter below funnels through, so a slider
   *  drag, a checkbox click and a reset all coalesce the same way. */
  const commit = <K extends keyof PhotoAdjustments>(key: K, value: PhotoAdjustments[K]) =>
    commitPatch({ [key]: value } as Partial<PhotoAdjustments>)

  const commitPatch = (patch: Partial<PhotoAdjustments>) => {
    const adjustments = { ...get().adjustments, ...patch }
    set({ adjustments })
    if (historyDebounceTimer) clearTimeout(historyDebounceTimer)
    historyDebounceTimer = setTimeout(() => {
      historyDebounceTimer = null
      const { historyStack, historyIndex, adjustments: current } = get()
      if (sameAdjustments(historyStack[historyIndex], current)) return
      const nextStack = [...historyStack.slice(0, historyIndex + 1), current]
      set({ historyStack: nextStack, historyIndex: nextStack.length - 1 })
    }, HISTORY_DEBOUNCE_MS)
  }

  const updateLayer = (id: string, change: (layer: AdjustmentLayer) => AdjustmentLayer) =>
    commit(
      'layers',
      get().adjustments.layers.map((l) => (l.id === id ? change(l) : l)),
    )

  /** Write one tone field to whatever is being edited — the active layer's
   *  settings, or the base's. Every tone setter below goes through here. */
  const commitTone = <K extends keyof ToneAdjustments>(key: K, value: ToneAdjustments[K]) => {
    const layer = activeLayer(get())
    if (layer) updateLayer(layer.id, (l) => ({ ...l, adjustments: { ...l.adjustments, [key]: value } }))
    else commit(key, value as PhotoAdjustments[K])
  }
  const tone = () => selectActiveTone(get())

  /** Write the selection being edited — the active layer's mask, or the base's. */
  const commitSelection = (selection: PhotoSelection) => {
    const layer = activeLayer(get())
    if (layer) updateLayer(layer.id, (l) => ({ ...l, selection }))
    else commit('selection', selection)
  }
  const selection = () => selectActiveSelection(get())

  return {
    image: null,
    sourceRef: null,
    adjustments: DEFAULT_ADJUSTMENTS,
    historyStack: [DEFAULT_ADJUSTMENTS],
    historyIndex: 0,

    ...resetTools(),

    setImage: (image) =>
      set({ image, sourceRef: null, adjustments: DEFAULT_ADJUSTMENTS, ...resetTools(), ...resetHistory() }),
    openFromCanvas: (image, sourceRef) =>
      set({ image, sourceRef, adjustments: DEFAULT_ADJUSTMENTS, ...resetTools(), ...resetHistory() }),

    setAdjustment: (key, value) => commitTone(key, clampAdjustment(key, value)),

    setToggle: (key, value) => commitTone(key, value),

    resetAdjustment: (key) => {
      if (key in DEFAULT_TONE) {
        const k = key as keyof ToneAdjustments
        commitTone(k, DEFAULT_TONE[k])
      } else commit(key, DEFAULT_ADJUSTMENTS[key])
    },

    setLevel: (key, value) => {
      const { min, max } = LEVELS_LIMITS[key]
      const clamped = Math.max(min, Math.min(max, Number.isFinite(value) ? value : DEFAULT_LEVELS[key]))
      const next: PhotoLevels = { ...tone().levels, [key]: clamped }
      // Both limits stop one step short of the full 0..255 range, so shoving
      // the other endpoint aside can never push it out of bounds.
      if (next.black >= next.white) {
        if (key === 'black') next.white = clamped + 1
        else if (key === 'white') next.black = clamped - 1
      }
      commitTone('levels', next)
    },

    resetLevel: (key) => commitTone('levels', { ...tone().levels, [key]: DEFAULT_LEVELS[key] }),

    setCurve: (channel, points) =>
      commitTone('curves', { ...tone().curves, [channel]: normalizeCurvePoints(points) }),

    resetCurve: (channel) => commitTone('curves', { ...tone().curves, [channel]: IDENTITY_CURVE }),

    setGeometry: (patch) => commit('geometry', normalizeGeometry({ ...get().adjustments.geometry, ...patch })),

    // The 90° and flip buttons act on the image as it's displayed — framing,
    // keystone and all — not on the source underneath. The quarter turn and
    // flip themselves run early in the pipeline (geometry.ts), so everything
    // after them that's expressed in display terms is carried along: the
    // crop turns or mirrors with the image (else a crop taken before a turn
    // would suddenly frame a different part of the photo), keystone moves to
    // whichever edges are now top/left, and a mirror reverses the direction
    // of straighten and free rotation.
    rotate90: (direction) => {
      const g = get().adjustments.geometry
      // A quarter turn made under a single mirror comes out the other way
      // round on screen — count it backwards.
      const mirrored = g.flipH !== g.flipV
      const step = mirrored ? -direction : direction
      const { x, y, w, h } = g.crop
      const turned =
        direction === 1
          ? { crop: { x: 1 - y - h, y: x, w: h, h: w }, perspectiveV: g.perspectiveH, perspectiveH: -g.perspectiveV }
          : { crop: { x: y, y: 1 - x - w, w: h, h: w }, perspectiveV: -g.perspectiveH, perspectiveH: g.perspectiveV }
      get().setGeometry({ quarterTurns: ((g.quarterTurns + step + 4) % 4) as PhotoGeometry['quarterTurns'], ...turned })
      const aspect = get().cropAspect
      if (aspect !== null) set({ cropAspect: 1 / aspect })
    },

    flip: (axis) => {
      const g = get().adjustments.geometry
      const { x, y, w, h } = g.crop
      const mirrored = { straighten: -g.straighten, angle: -g.angle }
      get().setGeometry(
        axis === 'h'
          ? { ...mirrored, flipH: !g.flipH, perspectiveH: -g.perspectiveH, crop: { x: 1 - x - w, y, w, h } }
          : { ...mirrored, flipV: !g.flipV, perspectiveV: -g.perspectiveV, crop: { x, y: 1 - y - h, w, h } },
      )
    },

    // Cropping shows the uncropped frame, where a selection drawn on screen
    // would be measured against the wrong picture — the two tools never run
    // at once.
    setCropMode: (on) => set(on ? { cropMode: true, selectionTool: null } : { cropMode: false }),
    setCropAspect: (aspect) => set({ cropAspect: aspect }),

    applySelectionOp: (op, combine) =>
      commitSelection(normalizeSelection(combineSelection(selection(), op, combine))),
    setSelectionFeather: (feather) => commitSelection(normalizeSelection({ ...selection(), feather })),
    invertSelection: () => {
      const s = selection()
      if (!hasSelection(s)) return
      commitSelection({ ...s, inverted: !s.inverted })
    },
    clearSelection: () => {
      const s = selection()
      if (!hasSelection(s)) return
      commitSelection({ ...EMPTY_SELECTION, feather: s.feather })
    },

    selectLayer: (id) => set({ activeLayerId: id }),

    addLayer: () => {
      const { adjustments } = get()
      const taken = new Set(adjustments.layers.map((l) => l.name))
      let n = adjustments.layers.length + 1
      while (taken.has(`Layer ${n}`)) n++
      const baseSelection = adjustments.selection
      const moveSelection = hasSelection(baseSelection)
      const layer: AdjustmentLayer = {
        id: crypto.randomUUID(),
        name: `Layer ${n}`,
        visible: true,
        opacity: 100,
        selection: moveSelection ? baseSelection : EMPTY_SELECTION,
        adjustments: DEFAULT_TONE,
      }
      commitPatch({
        layers: [...adjustments.layers, layer],
        ...(moveSelection ? { selection: { ...EMPTY_SELECTION, feather: baseSelection.feather } } : {}),
      })
      set({ activeLayerId: layer.id })
    },

    deleteLayer: (id) => {
      commit(
        'layers',
        get().adjustments.layers.filter((l) => l.id !== id),
      )
      if (get().activeLayerId === id) set({ activeLayerId: null })
    },

    setLayerVisible: (id, visible) => updateLayer(id, (l) => ({ ...l, visible })),

    setLayerOpacity: (id, opacity) =>
      updateLayer(id, (l) => ({ ...l, opacity: Math.max(0, Math.min(100, Number.isFinite(opacity) ? opacity : 100)) })),

    renameLayer: (id, name) => {
      const trimmed = name.trim()
      if (trimmed) updateLayer(id, (l) => ({ ...l, name: trimmed.slice(0, 40) }))
    },

    moveLayer: (id, direction) => {
      const layers = [...get().adjustments.layers]
      const i = layers.findIndex((l) => l.id === id)
      const j = i + direction
      if (i < 0 || j < 0 || j >= layers.length) return
      ;[layers[i], layers[j]] = [layers[j], layers[i]]
      commit('layers', layers)
    },
    setSelectionTool: (tool) => set(tool ? { selectionTool: tool, cropMode: false } : { selectionTool: null }),
    setSelectionCombine: (combine) => set({ selectionCombine: combine }),
    setWandTolerance: (tolerance) => set({ wandTolerance: Math.max(0, Math.min(100, tolerance)) }),
    setWandContiguous: (contiguous) => set({ wandContiguous: contiguous }),
    setBrushSize: (size) => set({ brushSize: Math.max(1, Math.min(100, size)) }),
    setBrushHardness: (hardness) => set({ brushHardness: Math.max(0, Math.min(100, hardness)) }),
    setGradientShape: (shape) => set({ gradientShape: shape }),
    setShowMask: (show) => set({ showMask: show }),

    undo: () => {
      if (historyDebounceTimer) {
        clearTimeout(historyDebounceTimer)
        historyDebounceTimer = null
      }
      const { historyStack, historyIndex } = get()
      if (historyIndex <= 0) return
      const newIndex = historyIndex - 1
      set({ historyIndex: newIndex, adjustments: historyStack[newIndex] })
    },

    redo: () => {
      if (historyDebounceTimer) {
        clearTimeout(historyDebounceTimer)
        historyDebounceTimer = null
      }
      const { historyStack, historyIndex } = get()
      if (historyIndex >= historyStack.length - 1) return
      const newIndex = historyIndex + 1
      set({ historyIndex: newIndex, adjustments: historyStack[newIndex] })
    },
  }
})
