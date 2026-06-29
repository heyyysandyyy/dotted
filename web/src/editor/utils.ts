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

/** Trigger a browser download for a data/object URL. */
export function downloadUrl(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}
