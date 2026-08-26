import { useEffect, useState } from 'react'

/**
 * Decodes the loaded image's data URL once and hands the element to every
 * consumer that needs pixels out of it — the preview canvas
 * (useAdjustedPreviewCanvas) and the histogram (useHistogram), which would
 * otherwise each decode the same data URL separately. That matters more
 * than it looks: the Edit-from-Canvas entry point carries the original
 * upload through uncapped (PHOTO-002's 2000px downscale only applies to a
 * direct upload), so the image being decoded can be very large.
 *
 * Returns null while decoding and for a null or failed image — every
 * consumer already has a "nothing to draw yet" path, so a decode failure
 * just leaves the preview empty rather than throwing. The decoded element
 * is kept alongside the source it came from and matched during render, so
 * switching images reads as null immediately instead of handing back the
 * previous image's pixels for a frame.
 */
export function useDecodedImage(image: string | null): HTMLImageElement | null {
  const [decoded, setDecoded] = useState<{ source: string; element: HTMLImageElement } | null>(null)

  useEffect(() => {
    if (!image) return
    let cancelled = false
    const element = new Image()
    element.onload = () => {
      if (!cancelled) setDecoded({ source: image, element })
    }
    element.src = image
    return () => {
      cancelled = true
    }
  }, [image])

  return decoded && decoded.source === image ? decoded.element : null
}
