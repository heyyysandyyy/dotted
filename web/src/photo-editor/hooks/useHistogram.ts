import { useEffect, useRef, useState } from 'react'
import { renderAdjustedImage } from '../utils/renderAdjustedImage'
import { computeHistogram, type Histogram } from '../utils/histogram'
import type { PhotoAdjustments } from '../store/usePhotoEditorStore'

/** Longest edge of the off-screen copy the histogram is counted from.
 *  65k pixels is plenty for a 256-bin distribution and keeps the whole
 *  render-and-count round trip cheap enough to redo on every adjustment
 *  tick, which counting the full-size image would not be. */
const SAMPLE_MAX_EDGE = 256

/**
 * The live distribution of the *adjusted* image (PHOTO-007 levels/curves
 * phase) — what the Levels and Curves panels plot behind their controls.
 *
 * Counted from a small off-screen copy rendered through the same
 * renderAdjustedImage the preview uses, so the histogram can never disagree
 * with what's on screen, and dragging a slider shows the distribution move
 * under it rather than a stale picture of the untouched original.
 *
 * The count is kept alongside the image it was taken from: a new image
 * reads as null straight away (its own histogram is a frame behind), while
 * an adjustment tweak keeps the previous count on screen until the new one
 * lands, so the plot animates rather than blinking out on every tick.
 */
export function useHistogram(image: HTMLImageElement | null, adjustments: PhotoAdjustments): Histogram | null {
  const [counted, setCounted] = useState<{ source: HTMLImageElement; histogram: Histogram } | null>(null)
  // One scratch canvas for the life of the hook: a drag recounts on every
  // frame, and each new canvas element would otherwise allocate (and leave
  // for the collector) its own backing bitmap.
  const scratch = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!image) return
    // Coalesced to one recount per frame, for the same reason the preview
    // redraw is: a slider drag fires far faster than that.
    const rafId = requestAnimationFrame(() => {
      const longest = Math.max(image.naturalWidth, image.naturalHeight)
      const scale = longest > SAMPLE_MAX_EDGE ? SAMPLE_MAX_EDGE / longest : 1
      const width = Math.max(1, Math.round(image.naturalWidth * scale))
      const height = Math.max(1, Math.round(image.naturalHeight * scale))
      const canvas = (scratch.current ??= document.createElement('canvas'))
      if (!renderAdjustedImage(canvas, image, width, height, adjustments)) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      setCounted({ source: image, histogram: computeHistogram(ctx.getImageData(0, 0, width, height)) })
    })
    return () => cancelAnimationFrame(rafId)
  }, [image, adjustments])

  return counted && counted.source === image ? counted.histogram : null
}
