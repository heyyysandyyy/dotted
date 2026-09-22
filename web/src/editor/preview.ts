import * as fabric from 'fabric'
import { migrateStrokeDefaults } from './store/storeHelpers'

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
  // fabric's loadFromJSON calls clear() on the canvas when it settles, so a
  // thumbnail unmounted mid-load (switching workspace or page, of which the
  // strip does plenty) would clear a canvas whose contexts dispose() has
  // already freed — an uncaught TypeError. Aborting makes the load reject
  // instead, before it can touch the canvas (BUG-010).
  const load = new AbortController()
  sc.loadFromJSON(json, undefined, { signal: load.signal })
    .then(() => {
      migrateStrokeDefaults(sc)
      sc.requestRenderAll()
    })
    .catch(() => {
      // Aborted, or bad page JSON: nothing to draw, and nothing to report —
      // the thumbnail just stays blank.
    })
  return () => {
    load.abort()
    sc.dispose()
  }
}
