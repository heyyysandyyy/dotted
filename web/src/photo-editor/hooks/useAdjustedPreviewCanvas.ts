import { useEffect, useRef } from 'react'
import { renderAdjustedImage } from '../utils/renderAdjustedImage'
import type { PhotoAdjustments } from '../store/usePhotoEditorStore'

/**
 * Longest edge the preview is rendered at.
 *
 * The preview is laid out with `max-h-full max-w-full object-contain`, so it
 * is already being scaled down to the viewport — past this many pixels the
 * extra detail is not on screen to be seen. Capping matters because of
 * PHOTO-008's neighbourhood pass: the per-pixel passes cost one table lookup
 * per pixel, but a blur or an unsharp mask walks the image several times over,
 * and the Edit-from-Canvas entry point carries the original upload through
 * uncapped (PHOTO-002's 2000px downscale only applies to a direct upload).
 * At full size that put a slider drag into whole seconds per frame — a blur
 * on a 4000 x 3000 image measured about a second, and every tool at once
 * nearly four. At this cap a single tool lands around 100ms.
 *
 * Nothing is lost by capping. Every spatial radius is a fraction of the
 * render's own shorter edge (spatialPass.ts), so the proxy shows the same look
 * the full-resolution bake will produce — and the bake is unaffected either
 * way: flattenImage renders the original at its own size for PHOTO-006's
 * port-back, exactly as before.
 */
const PREVIEW_MAX_EDGE = 1400

/**
 * Renders an already-decoded image (useDecodedImage) onto a canvas with
 * every live adjustment applied (PHOTO-004/PHOTO-007/PHOTO-008), so dragging
 * a slider redraws against the decoded element instead of re-decoding the
 * same data URL on every tick.
 */
export function useAdjustedPreviewCanvas(image: HTMLImageElement | null, adjustments: PhotoAdjustments) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!image || !canvas) return
    // Coalesced to one redraw per animation frame — a raw <input type=range>
    // fires `input` far faster than that while dragging, and everything
    // past brightness/contrast's cheap CSS filter runs a real
    // getImageData/LUT/putImageData pass, which on a large image is too slow
    // to redo on every single event without dropping frames.
    const rafId = requestAnimationFrame(() => {
      const longest = Math.max(image.naturalWidth, image.naturalHeight)
      const scale = longest > PREVIEW_MAX_EDGE ? PREVIEW_MAX_EDGE / longest : 1
      const width = Math.max(1, Math.round(image.naturalWidth * scale))
      const height = Math.max(1, Math.round(image.naturalHeight * scale))
      renderAdjustedImage(canvas, image, width, height, adjustments)
    })
    return () => cancelAnimationFrame(rafId)
  }, [image, adjustments])

  return canvasRef
}
