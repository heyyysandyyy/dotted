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
 * rotate, flip, perspective and resize) joins them on the same terms.
 */
export interface PhotoAdjustments {
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
  geometry: PhotoGeometry
}

/** The -100..100 slider-backed fields, split off the on/off ones so
 *  setAdjustment/AdjustmentSlider can't be pointed at a boolean (and
 *  setToggle can't be pointed at a number) by mistake. `levels`/`curves`
 *  drop out of both automatically — neither extends `number` or `boolean` —
 *  so they can only be written through their own setters. */
export type NumericAdjustmentKey = {
  [K in keyof PhotoAdjustments]: PhotoAdjustments[K] extends number ? K : never
}[keyof PhotoAdjustments]

/** The on/off fields — full black & white conversion and invert. */
export type ToggleAdjustmentKey = {
  [K in keyof PhotoAdjustments]: PhotoAdjustments[K] extends boolean ? K : never
}[keyof PhotoAdjustments]

export const DEFAULT_ADJUSTMENTS: PhotoAdjustments = {
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
  geometry: DEFAULT_GEOMETRY,
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
function sameAdjustments(a: PhotoAdjustments, b: PhotoAdjustments): boolean {
  return (Object.keys(DEFAULT_ADJUSTMENTS) as (keyof PhotoAdjustments)[]).every((key) => {
    if (key === 'levels') {
      return a.levels.black === b.levels.black && a.levels.white === b.levels.white && a.levels.gamma === b.levels.gamma
    }
    if (key === 'curves') return CURVE_CHANNELS.every((channel) => samePoints(a.curves[channel], b.curves[channel]))
    if (key === 'geometry') return sameGeometry(a.geometry, b.geometry)
    return a[key] === b[key]
  })
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
  undo: () => void
  redo: () => void
}

/** Crop-tool UI state goes back to closed/free with every new image. */
function resetTools(): { cropMode: boolean; cropAspect: number | null } {
  return { cropMode: false, cropAspect: null }
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
  const commit = <K extends keyof PhotoAdjustments>(key: K, value: PhotoAdjustments[K]) => {
    const adjustments = { ...get().adjustments, [key]: value }
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

  return {
    image: null,
    sourceRef: null,
    adjustments: DEFAULT_ADJUSTMENTS,
    historyStack: [DEFAULT_ADJUSTMENTS],
    historyIndex: 0,

    cropMode: false,
    cropAspect: null,

    setImage: (image) =>
      set({ image, sourceRef: null, adjustments: DEFAULT_ADJUSTMENTS, ...resetTools(), ...resetHistory() }),
    openFromCanvas: (image, sourceRef) =>
      set({ image, sourceRef, adjustments: DEFAULT_ADJUSTMENTS, ...resetTools(), ...resetHistory() }),

    setAdjustment: (key, value) => commit(key, clampAdjustment(key, value)),

    setToggle: (key, value) => commit(key, value),

    resetAdjustment: (key) => commit(key, DEFAULT_ADJUSTMENTS[key]),

    setLevel: (key, value) => {
      const { min, max } = LEVELS_LIMITS[key]
      const clamped = Math.max(min, Math.min(max, Number.isFinite(value) ? value : DEFAULT_LEVELS[key]))
      const next: PhotoLevels = { ...get().adjustments.levels, [key]: clamped }
      // Both limits stop one step short of the full 0..255 range, so shoving
      // the other endpoint aside can never push it out of bounds.
      if (next.black >= next.white) {
        if (key === 'black') next.white = clamped + 1
        else if (key === 'white') next.black = clamped - 1
      }
      commit('levels', next)
    },

    resetLevel: (key) => commit('levels', { ...get().adjustments.levels, [key]: DEFAULT_LEVELS[key] }),

    setCurve: (channel, points) =>
      commit('curves', { ...get().adjustments.curves, [channel]: normalizeCurvePoints(points) }),

    resetCurve: (channel) => commit('curves', { ...get().adjustments.curves, [channel]: IDENTITY_CURVE }),

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

    setCropMode: (on) => set({ cropMode: on }),
    setCropAspect: (aspect) => set({ cropAspect: aspect }),

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
