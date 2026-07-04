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
 * Shadow/glow effect config (UX-011; `spread` added in UX-020 phase 1).
 * Fabric has a single `shadow` slot, so an object has at most one of these;
 * `kind` disambiguates drop-shadow vs glow. `color` carries the effect
 * opacity via its alpha channel. `spread` > 0 needs a second synthetic
 * object (see effectsEngine.ts) since canvas 2D can't cast a shadow from a
 * transparent fill, so there's no way to draw a bigger shadow on the host
 * object alone.
 */
export interface ShadowEffect {
  kind: 'drop' | 'glow'
  x: number
  y: number
  blur: number
  spread: number
  color: string
}

export const DROP_SHADOW_DEFAULT: ShadowEffect = { kind: 'drop', x: 4, y: 4, blur: 8, spread: 0, color: 'rgba(0,0,0,0.3)' }
export const GLOW_DEFAULT: ShadowEffect = { kind: 'glow', x: 0, y: 0, blur: 12, spread: 0, color: 'rgba(255,255,255,0.6)' }

/** Read the current shadow/glow effect off an object, or null if none (UX-011). */
export function readShadowEffect(obj: fabric.FabricObject): ShadowEffect | null {
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
    // Pre-UX-020 saved shadows predate spread — a plain 0 reads the same as
    // "no spread clone", so nothing changes for a project saved before this.
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
