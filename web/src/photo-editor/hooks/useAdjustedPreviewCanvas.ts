import { useEffect, useRef } from 'react'
import { renderAdjustedImage } from '../utils/renderAdjustedImage'
import type { PhotoAdjustments } from '../store/usePhotoEditorStore'

/**
 * Renders the loaded image onto a canvas with every live adjustment applied
 * (PHOTO-004/PHOTO-007) — decodes the source image once per `image` change
 * and reuses that decoded element on every adjustment tweak, so dragging a
 * slider redraws against an already-decoded image instead of re-decoding the
 * same data URL on every tick.
 */
export function useAdjustedPreviewCanvas(image: string | null, adjustments: PhotoAdjustments) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    imgRef.current = null
    if (!image) return
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      imgRef.current = img
      const canvas = canvasRef.current
      if (canvas) renderAdjustedImage(canvas, img, img.naturalWidth, img.naturalHeight, adjustments)
    }
    img.src = image
    return () => {
      cancelled = true
    }
    // Deliberately only re-decodes on a new `image` — the effect below
    // redraws the already-decoded element whenever `adjustments` changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image])

  useEffect(() => {
    // Coalesced to one redraw per animation frame — a raw <input type=range>
    // fires `input` far faster than that while dragging, and exposure/
    // highlights/shadows (unlike brightness/contrast's cheap CSS filter) run
    // a real getImageData/LUT/putImageData pass, which on a large image (the
    // Edit-from-Canvas entry point carries the original upload through
    // uncapped — PHOTO-002's 2000px downscale only applies to a direct
    // upload) is too slow to redo on every single event without dropping
    // frames.
    const rafId = requestAnimationFrame(() => {
      const img = imgRef.current
      const canvas = canvasRef.current
      if (!img || !canvas) return
      renderAdjustedImage(canvas, img, img.naturalWidth, img.naturalHeight, adjustments)
    })
    return () => cancelAnimationFrame(rafId)
  }, [adjustments])

  return canvasRef
}
