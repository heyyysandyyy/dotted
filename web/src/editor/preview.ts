import * as fabric from 'fabric'

/**
 * Render a page's serialized canvas into a read-only StaticCanvas, used for the
 * all-pages stack previews (TPL-001). Returns a disposer for effect cleanup.
 *
 * This lives outside components/ so preview components don't import the fabric
 * value directly (the architecture lint rule) — it's a throwaway render surface,
 * not the editing canvas, so it doesn't go through the store.
 */
export function renderPreview(
  el: HTMLCanvasElement,
  json: object,
  width: number,
  height: number,
): () => void {
  const sc = new fabric.StaticCanvas(el, { width, height, backgroundColor: '#ffffff' })
  let disposed = false
  sc.loadFromJSON(json).then(() => {
    if (!disposed) sc.requestRenderAll()
  })
  return () => {
    disposed = true
    sc.dispose()
  }
}
