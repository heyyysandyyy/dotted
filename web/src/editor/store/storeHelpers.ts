import * as fabric from 'fabric'
import type { ModifiedEvent } from 'fabric'
import { EXTRA_PROPS, type PageData } from '../storage'
import { GOOGLE_FONTS, loadGoogleFont } from '../fonts'
import { isShape } from '../utils'
import { isEffectClone } from '../effectsEngine'

/** Default name given to a fresh project. */
export const DEFAULT_NAME = 'Untitled design'

/** Default fill/stroke for shapes added from the library. */
export const SHAPE_FILL = '#4f46e5'
export const SHAPE_STROKE = '#111111'

/**
 * Lazy-load every Google font used by the canvas's text and repaint once each
 * is ready. A loaded project stores only font *names*; without this the canvas
 * paints them with the fallback font until the font is fetched (BUG-001 on load).
 */
export function loadCanvasFonts(canvas: fabric.Canvas): void {
  const families = new Set<string>()
  for (const o of canvas.getObjects()) {
    const family = (o as unknown as { fontFamily?: string }).fontFamily
    if (typeof family === 'string' && GOOGLE_FONTS.includes(family)) families.add(family)
  }
  families.forEach((family) => loadGoogleFont(family).then(() => canvas.requestRenderAll()))
}

/**
 * Backfill `strokeUniform`/`strokeLineJoin` onto shapes saved before those
 * became the default for newly-added shapes — without this, a design saved
 * earlier keeps rendering with the old non-uniform stroke and sharp miter
 * joins forever, even after the app-wide default changed (a shape's corners
 * flatten or spike once it's been resized non-uniformly). Safe to force
 * unconditionally on every load: neither property has ever been exposed in
 * the UI, so no saved value could reflect a deliberate user choice.
 */
export function migrateStrokeDefaults(canvas: fabric.StaticCanvas): void {
  const visit = (obj: fabric.FabricObject) => {
    if (isEffectClone(obj)) return
    if (isShape(obj)) obj.set({ strokeUniform: true, strokeLineJoin: 'round' })
    if (obj.type === 'group') (obj as fabric.Group).getObjects().forEach(visit)
  }
  canvas.getObjects().forEach(visit)
}

/** Serialize the live canvas into a page payload. */
export function serializeCanvas(canvas: fabric.Canvas): object {
  return canvas.toObject(EXTRA_PROPS)
}

/** A shape's stroke dash preset (UX-028) — solid/dashed/dotted/spaced.
 *  There's no separate stored "style" field; it's inferred from
 *  `strokeDashArray` so the Properties Panel can show which preset is
 *  active. */
export type StrokeStyle = 'solid' | 'dashed' | 'dotted' | 'spaced'

/** Infer the active dash preset from an object's current dash array. A
 *  dotted preset always starts with a 0-length dash (a round-capped dot),
 *  which no dashed/spaced preset ever produces. Between dashed and spaced —
 *  both non-zero-starting — spaced is the one whose gap (the second value)
 *  is wider than its dash, dashed the one where the dash is wider than the
 *  gap; that holds regardless of strokeWidth scaling, so no need to match
 *  the exact numbers. */
export function strokeStyleOf(obj: fabric.FabricObject): StrokeStyle {
  const arr = obj.strokeDashArray
  if (!arr || arr.length === 0) return 'solid'
  if (arr[0] === 0) return 'dotted'
  return arr[1] > arr[0] ? 'spaced' : 'dashed'
}

/** Derive `strokeDashArray`/`strokeLineCap` for a dash preset, scaled to the
 *  shape's current stroke width so dashed/dotted/spaced stay proportional as
 *  width changes (UX-028). */
export function strokeDashProps(
  style: StrokeStyle,
  strokeWidth: number,
): { strokeDashArray: number[] | null; strokeLineCap: 'butt' | 'round' } {
  switch (style) {
    case 'dashed':
      return { strokeDashArray: [strokeWidth * 3, strokeWidth * 2], strokeLineCap: 'butt' }
    case 'spaced':
      return { strokeDashArray: [strokeWidth * 3, strokeWidth * 5], strokeLineCap: 'butt' }
    case 'dotted':
      return { strokeDashArray: [0, strokeWidth * 2], strokeLineCap: 'round' }
    case 'solid':
      return { strokeDashArray: null, strokeLineCap: 'butt' }
  }
}

/** A shape's stroke alignment (UX-028). `paintFirst` alone can't produce a
 *  true inset stroke — a stroke is always centered on the path regardless of
 *  paint order, so `paintFirst: 'stroke'` only paints the fill over the
 *  stroke's *inner* half (the half that would need to stay for an inset
 *  look) and leaves the outer half — the part bulging past the shape's true
 *  edge — untouched. Confirmed with a pixel-level render check: the visible
 *  stroke band shrinks from strokeWidth to strokeWidth/2, but its outer edge
 *  never moves, so it still straddles the boundary same as center, just
 *  thinner. A real inset stroke needs the stroke to be geometrically
 *  confined to the shape's own silhouette, which Canvas has no direct
 *  primitive for — so `applyStrokeAlignment` builds one out of two Fabric
 *  primitives that do exist: double the internal strokeWidth (so its inner
 *  half, alone, is the full requested visual weight) and clip the object to
 *  a clone of its own un-stroked shape (removing the outer half entirely).
 *  Center alignment is just the untouched, undoubled, unclipped stroke. */
export type StrokeAlignment = 'center' | 'inside'

/** Read alignment off whether a stroke-inset clip is present, not off
 *  `paintFirst` (see the module doc above for why that doesn't work). */
export function strokeAlignmentOf(obj: fabric.FabricObject): StrokeAlignment {
  return obj.clipPath ? 'inside' : 'center'
}

/** The stroke width as the user sees/edits it in the Properties Panel —
 *  half of `obj.strokeWidth` when aligned inside, since inside-alignment
 *  doubles the internal width so its clipped inner half matches the
 *  requested visual weight (see the module doc above). Center alignment
 *  stores the width as-is, so this is the identity there. */
export function displayStrokeWidth(obj: fabric.FabricObject): number {
  const w = obj.strokeWidth ?? 0
  return strokeAlignmentOf(obj) === 'inside' ? w / 2 : w
}

/**
 * Derive the `strokeWidth`/`clipPath`/`paintFirst` triple for a given
 * alignment + the width as the user sees it (UX-028) — see the module doc
 * above for why width and clip need to change together. `clipPath` is built
 * from `obj.clone()` (geometry only: width/height/rx/ry/path data, whatever
 * defines this particular shape kind) with its own stroke stripped and
 * repositioned to (0,0)/no rotation/no scale in the host's *local*
 * coordinate space — Fabric applies the host's own transform to a
 * non-`absolutePositioned` clipPath automatically, so this stays correctly
 * aligned through drag/resize/rotate with no manual resync, unlike the
 * effect-clone system (which needs one because those are separate
 * top-level canvas objects, not an attached clip). `paintFirst` is always
 * forced to `'fill'` (Fabric's own default, and the only value either
 * rendering path here assumes) rather than left alone — an object that was
 * ever toggled to inside alignment under a prior, broken version of this
 * mechanism could otherwise carry a stale `'stroke'` value that neither
 * branch below sets, silently breaking rendering with no visible cause.
 * Async because `clone()` is.
 */
export async function applyStrokeAlignment(
  obj: fabric.FabricObject,
  alignment: StrokeAlignment,
  displayWidth: number,
): Promise<{ strokeWidth: number; clipPath: fabric.FabricObject | undefined; paintFirst: 'fill' }> {
  if (alignment === 'center') {
    return { strokeWidth: displayWidth, clipPath: undefined, paintFirst: 'fill' }
  }
  const clip = await obj.clone()
  clip.set({
    left: 0,
    top: 0,
    originX: 'center',
    originY: 'center',
    angle: 0,
    scaleX: 1,
    scaleY: 1,
    skewX: 0,
    skewY: 0,
    stroke: undefined,
    strokeWidth: 0,
    shadow: null,
  })
  return { strokeWidth: displayWidth * 2, clipPath: clip, paintFirst: 'fill' }
}

/**
 * A page's effective artboard size: its own width/height if set (book pages,
 * UX-015 — a cover and its spreads can differ within one project), else the
 * project's shared size (every other page).
 */
export function pageSize(
  page: PageData,
  fallback: { width: number; height: number },
): { width: number; height: number } {
  return { width: page.width ?? fallback.width, height: page.height ?? fallback.height }
}

const TEXT_PROP_KEYS = [
  'text',
  'fontSize',
  'fontFamily',
  'fontWeight',
  'fontStyle',
  'textAlign',
  'lineHeight',
  'underline',
]

/**
 * Fire `object:modified` carrying a history label. Fabric's ModifiedEvent
 * type doesn't have a historyLabel field, so the payload is asserted against
 * an intersection type extending it — narrower than `as unknown as never`,
 * since `target` still has to actually be a FabricObject. It rides along at
 * runtime for the history-panel handler in CanvasStage.
 */
export function fireModified(canvas: fabric.Canvas, target: fabric.FabricObject, historyLabel: string) {
  canvas.fire('object:modified', { target, historyLabel } as ModifiedEvent & { historyLabel: string })
}

/** Visual style props copied/pasted between objects (UX-007). */
const STYLE_KEYS = [
  'fill',
  'stroke',
  'strokeWidth',
  'strokeDashArray',
  'strokeLineCap',
  'opacity',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'textAlign',
  'underline',
  'lineHeight',
  'shadow',
  'rx',
  'ry',
]

/** Read the copyable style off an object (only props it actually defines). */
export function readStyle(obj: fabric.FabricObject): Record<string, unknown> {
  const style: Record<string, unknown> = {}
  for (const k of STYLE_KEYS) {
    // rx/ry are a border radius on a rect but a radius on an ellipse — keep them rect-only.
    if ((k === 'rx' || k === 'ry') && obj.type !== 'rect') continue
    const v = (obj as unknown as Record<string, unknown>)[k]
    if (v !== undefined) style[k] = v
  }
  return style
}

/** Apply a copied style to a target, setting only compatible (present) props. */
export function applyStyle(obj: fabric.FabricObject, style: Record<string, unknown>): void {
  const props: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(style)) {
    if ((k === 'rx' || k === 'ry') && obj.type !== 'rect') continue
    if ((obj as unknown as Record<string, unknown>)[k] !== undefined) props[k] = v
  }
  obj.set(props)
  obj.setCoords()
}

/**
 * Equal-gap distribution: given items (start position + size) sorted by start,
 * return each item's new start so the outer edges stay fixed and the gaps
 * between items are equal (UX-006). Pure — exported for testing.
 */
export function distributeStarts(items: { start: number; size: number }[]): number[] {
  if (items.length < 2) return items.map((i) => i.start)
  const spanStart = items[0].start
  const last = items[items.length - 1]
  const spanEnd = last.start + last.size
  const totalSize = items.reduce((sum, i) => sum + i.size, 0)
  const gap = (spanEnd - spanStart - totalSize) / (items.length - 1)
  const out: number[] = []
  let cursor = spanStart
  for (const it of items) {
    out.push(cursor)
    cursor += it.size + gap
  }
  return out
}

/**
 * Position an object so its centre sits at a given scene (canvas) point — used
 * by image crop (UX-009). If the object is inside a group, the scene point is
 * converted into the group's local space first, so grouped images crop correctly.
 */
export function setImageSceneCenter(obj: fabric.FabricObject, sceneX: number, sceneY: number): void {
  const g = (obj as unknown as { group?: fabric.Group }).group
  const scene = new fabric.Point(sceneX, sceneY)
  const target =
    g && g.type === 'group'
      ? fabric.util.transformPoint(scene, fabric.util.invertTransform(g.calcTransformMatrix()))
      : scene
  obj.setPositionByOrigin(target, 'center', 'center')
  obj.setCoords()
}

/** Re-group objects into an active selection (multi) or select the single one. */
export function reselect(canvas: fabric.Canvas, objs: fabric.FabricObject[]): void {
  if (objs.length > 1) {
    canvas.setActiveObject(new fabric.ActiveSelection(objs, { canvas }))
  } else if (objs[0]) {
    canvas.setActiveObject(objs[0])
  }
}

/** History label for an `updateActive` change, inferred from which props moved. */
export function labelForProps(props: object): string {
  const keys = Object.keys(props)
  if (keys.includes('fill')) return 'Changed fill color'
  if (
    keys.includes('stroke') ||
    keys.includes('strokeWidth') ||
    keys.includes('strokeDashArray') ||
    keys.includes('strokeLineCap') ||
    keys.includes('clipPath')
  )
    return 'Changed stroke'
  if (keys.includes('opacity')) return 'Changed opacity'
  if (keys.some((k) => TEXT_PROP_KEYS.includes(k))) return 'Edited text'
  return 'Changed style'
}
