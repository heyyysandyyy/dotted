import { useEffect, useRef } from 'react'
import { renderAdjustedImage } from '../utils/renderAdjustedImage'
import type { PhotoAdjustments } from '../store/usePhotoEditorStore'

/**
 * Renders an already-decoded image (useDecodedImage) onto a canvas with
 * every live adjustment applied (PHOTO-004/PHOTO-007), so dragging a slider
 * redraws against the decoded element instead of re-decoding the same data
 * URL on every tick.
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
    const rafId = requestAnimationFrame(() =>
      renderAdjustedImage(canvas, image, image.naturalWidth, image.naturalHeight, adjustments),
    )
    return () => cancelAnimationFrame(rafId)
  }, [image, adjustments])

  return canvasRef
}
