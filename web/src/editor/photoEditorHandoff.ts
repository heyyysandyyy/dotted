import type * as fabric from 'fabric'
import type { PhotoEditorSourceRef } from '../photo-editor/store/usePhotoEditorStore'

/**
 * Shared by ContextMenu's "Edit in Photo Editor" item and PropertiesPanel's
 * Image section button (PHOTO-003, issue #165) so both entry points build
 * the exact same handoff payload. `null` only if the object somehow never
 * got the id every canvas object is assigned on add (see objectsSlice.ts).
 */
export function buildPhotoEditorHandoff(
  canvas: fabric.Canvas,
  obj: fabric.FabricObject,
  activePageId: string,
): { image: string; sourceRef: PhotoEditorSourceRef } | null {
  const img = obj as fabric.FabricImage & { id?: string; originalSrc?: string }
  if (!img.id) return null
  return {
    image: img.originalSrc ?? img.getSrc(),
    sourceRef: {
      pageId: activePageId,
      objectId: img.id,
      left: obj.left ?? 0,
      top: obj.top ?? 0,
      scaleX: obj.scaleX ?? 1,
      scaleY: obj.scaleY ?? 1,
      angle: obj.angle ?? 0,
      zIndex: canvas.getObjects().indexOf(obj),
    },
  }
}
