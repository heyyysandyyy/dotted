import type { fabric } from 'fabric'

const TEXT_TYPES = ['text', 'i-text', 'textbox']

/** True when the object is any kind of editable text. */
export function isText(obj: fabric.Object | undefined | null): obj is fabric.Textbox {
  return !!obj && TEXT_TYPES.includes(obj.type ?? '')
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
