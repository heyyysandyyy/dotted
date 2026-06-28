import type * as fabric from 'fabric'

const TEXT_TYPES = ['text', 'i-text', 'textbox']

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

/** Trigger a browser download for a data/object URL. */
export function downloadUrl(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}
