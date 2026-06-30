import * as fabric from 'fabric'
import { EXTRA_PROPS } from '../storage'
import { GOOGLE_FONTS, loadGoogleFont } from '../fonts'

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

/** Serialize the live canvas into a page payload. */
export function serializeCanvas(canvas: fabric.Canvas): object {
  return canvas.toObject(EXTRA_PROPS)
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
 * Fire `object:modified` carrying a history label. Fabric's typed event map
 * doesn't allow extra fields, so the label is attached via a cast; it rides
 * along at runtime for the history-panel handler in CanvasStage.
 */
export function fireModified(canvas: fabric.Canvas, target: fabric.FabricObject, historyLabel: string) {
  canvas.fire('object:modified', { target, historyLabel } as unknown as never)
}

/** Visual style props copied/pasted between objects (UX-007). */
const STYLE_KEYS = [
  'fill',
  'stroke',
  'strokeWidth',
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
  if (keys.includes('stroke') || keys.includes('strokeWidth')) return 'Changed stroke'
  if (keys.includes('opacity')) return 'Changed opacity'
  if (keys.some((k) => TEXT_PROP_KEYS.includes(k))) return 'Edited text'
  return 'Changed style'
}
