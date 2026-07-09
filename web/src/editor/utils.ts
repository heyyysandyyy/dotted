import type * as fabric from 'fabric'
import tinycolor from 'tinycolor2'

const TEXT_TYPES = ['text', 'i-text', 'textbox']

/**
 * Combine a hex colour with an opacity percentage (0–100) into a CSS colour:
 * a plain hex string when fully opaque, otherwise an rgba() string (CLR-002).
 */
export function toColorString(hex: string, alphaPct: number): string {
  const c = tinycolor(hex)
  c.setAlpha(alphaPct / 100)
  return alphaPct >= 100 ? c.toHexString() : c.toRgbString()
}

/** True when the object is any kind of editable text. */
export function isText(obj: fabric.FabricObject | undefined | null): obj is fabric.Textbox {
  return !!obj && TEXT_TYPES.includes(obj.type ?? '')
}

/** True for vector shapes (everything that isn't text or a raster image). */
export function isShape(obj: fabric.FabricObject | undefined | null): boolean {
  return !!obj && !isText(obj) && obj.type !== 'image'
}

/** Human-readable name for a canvas object, shown in the layers panel. */
export function layerName(obj: fabric.FabricObject): string {
  switch (obj.type) {
    case 'textbox':
    case 'i-text':
    case 'text': {
      const t = (obj as fabric.Textbox).text?.trim()
      return t ? (t.length > 20 ? t.slice(0, 20) + '…' : t) : 'Text'
    }
    case 'image':
      return 'Image'
    case 'rect':
      return (obj as fabric.Rect).rx ? 'Rounded rectangle' : 'Rectangle'
    case 'ellipse':
      return 'Ellipse'
    case 'triangle':
      return 'Triangle'
    case 'line':
      return 'Line'
    case 'path':
      return 'Arrow'
    case 'group':
      return 'Group'
    default:
      return obj.type ?? 'Object'
  }
}

/** Lower-case object kind for history labels (e.g. "Added rectangle"). */
export function kindName(obj: fabric.FabricObject | undefined | null): string {
  switch (obj?.type) {
    case 'textbox':
    case 'i-text':
    case 'text':
      return 'text'
    case 'image':
      return 'image'
    case 'rect':
      return 'rectangle'
    case 'ellipse':
      return 'ellipse'
    case 'triangle':
      return 'triangle'
    case 'line':
      return 'line'
    case 'path':
      return 'arrow'
    case 'group':
      return 'group'
    default:
      return obj?.type ?? 'object'
  }
}

/** Which edge/centre to align to (UX-006). */
export type AlignMode = 'left' | 'centerH' | 'right' | 'top' | 'middleV' | 'bottom'

/** An axis-aligned bounding box. */
export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/**
 * The (dx, dy) to move box `r` so it aligns to `target` per `mode` (UX-006).
 * Delta-based, so it works regardless of an object's origin.
 */
export function alignDelta(r: Box, target: Box, mode: AlignMode): { dx: number; dy: number } {
  switch (mode) {
    case 'left':
      return { dx: target.left - r.left, dy: 0 }
    case 'centerH':
      return { dx: target.left + target.width / 2 - (r.left + r.width / 2), dy: 0 }
    case 'right':
      return { dx: target.left + target.width - (r.left + r.width), dy: 0 }
    case 'top':
      return { dx: 0, dy: target.top - r.top }
    case 'middleV':
      return { dx: 0, dy: target.top + target.height / 2 - (r.top + r.height / 2) }
    case 'bottom':
      return { dx: 0, dy: target.top + target.height - (r.top + r.height) }
  }
}

/**
 * Shadow/glow/inner-shadow effect config (UX-011; `spread` added in UX-020
 * phase 1; `inner` kind added in phase 3). `kind` disambiguates drop-shadow,
 * glow, and inner shadow. `color` carries the effect opacity via its alpha
 * channel. An object can have more than one of these active at once
 * (UX-020 phase 2) even though fabric has a single native `shadow` slot —
 * every effect past the first, and any effect with `spread` > 0, needs a
 * synthetic clone (see effectsEngine.ts) since canvas 2D can't cast a
 * shadow from a transparent fill, so there's no way to draw a second or
 * bigger shadow on the host object alone. Inner shadow is a special case
 * even among these: canvas 2D shadows are physically incapable of casting
 * inward at all (a shadow always renders outside the casting shape's own
 * pixels), so it's never a native-shadow candidate regardless of array
 * position — it's always a raster-composited overlay (see
 * effectsEngine.ts's syncInnerShadow) and doesn't use `spread`.
 */
export interface ShadowEffect {
  kind: 'drop' | 'glow' | 'inner'
  x: number
  y: number
  blur: number
  spread: number
  color: string
}

export const DROP_SHADOW_DEFAULT: ShadowEffect = { kind: 'drop', x: 4, y: 4, blur: 8, spread: 0, color: 'rgba(0,0,0,0.3)' }
export const GLOW_DEFAULT: ShadowEffect = { kind: 'glow', x: 0, y: 0, blur: 12, spread: 0, color: 'rgba(255,255,255,0.6)' }
export const INNER_SHADOW_DEFAULT: ShadowEffect = { kind: 'inner', x: 4, y: 4, blur: 8, spread: 0, color: 'rgba(0,0,0,0.5)' }

/** A ShadowEffect's fields as fabric.Shadow constructor options — shared by
 *  the host's own native shadow (objectsSlice.ts) and each synthetic clone's
 *  native shadow (effectsEngine.ts) so the two can never drift apart.
 *
 * `spread` folds directly into the blur radius rather than scaling the
 * casting shape's geometry. Canvas 2D's shadowBlur only softens the edge of
 * whatever shape is actually casting it — if spread instead grew a clone's
 * silhouette first, the band between the host's real edge and the clone's
 * enlarged edge would be flat, un-blurred solid fill (it's nowhere near
 * either shape's edge), which reads as a hard-edged stroke, not a soft glow.
 * Folding spread into blur keeps the clone the same size as the host (fully
 * hidden behind it) and produces one smooth gradient starting at the real
 * edge, growing wider as spread increases — this loses literal CSS
 * box-shadow-spread fidelity (which does grow the shape first) but that's
 * the right trade for a design tool where "never looks like a stroke"
 * matters more than spec accuracy. */
export function shadowOptions(effect: ShadowEffect): { color: string; blur: number; offsetX: number; offsetY: number } {
  return { color: effect.color, blur: effect.blur + effect.spread, offsetX: effect.x, offsetY: effect.y }
}

/** Read an object's active effects (UX-020 phase 2): the new `effects` array
 *  if present, else a pre-phase-2 object's single legacy shadow (native
 *  `shadow` + `shadowKind` + `shadowSpread`), else none. */
export function readShadowEffects(obj: fabric.FabricObject): ShadowEffect[] {
  const withEffects = obj as unknown as { effects?: ShadowEffect[] }
  if (withEffects.effects) return withEffects.effects
  const legacy = readLegacyShadowEffect(obj)
  return legacy ? [legacy] : []
}

/** Read a single kind's active effect, or null if that kind isn't on. */
export function readShadowEffectByKind(obj: fabric.FabricObject, kind: ShadowEffect['kind']): ShadowEffect | null {
  return readShadowEffects(obj).find((e) => e.kind === kind) ?? null
}

/** Pre-UX-020-phase-2 single-effect representation: a native fabric.Shadow
 *  plus the shadowKind/shadowSpread custom props phase 1 wrote. Only used as
 *  a fallback for objects saved before the `effects` array existed. */
function readLegacyShadowEffect(obj: fabric.FabricObject): ShadowEffect | null {
  const s = obj.shadow
  if (!s || typeof s === 'string') return null
  const kind =
    (obj as unknown as { shadowKind?: 'drop' | 'glow' }).shadowKind ??
    (s.offsetX || s.offsetY ? 'drop' : 'glow')
  return {
    kind,
    x: s.offsetX ?? 0,
    y: s.offsetY ?? 0,
    blur: s.blur ?? 0,
    spread: (obj as unknown as { shadowSpread?: number }).shadowSpread ?? 0,
    color: (s.color as string) ?? 'rgba(0,0,0,0.3)',
  }
}

/** Trigger a browser download for a data/object URL. */
export function downloadUrl(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}
