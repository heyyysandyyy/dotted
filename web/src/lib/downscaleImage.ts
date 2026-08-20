const MAX_DIMENSION = 2000
const JPEG_QUALITY = 0.85

/**
 * Downscale an image data URL to fit within `maxDimension` on its longest
 * edge. Real-resolution photos (a phone shot can easily be 4000px+) inflate
 * to several MB as a base64 data URL — this app's only persistence layer is
 * localStorage (no backend, ~5-10MB per origin), and storage.ts's
 * saveProject fails soft on a quota error, so an unshrunk upload can get
 * silently dropped on the very next save. Returns the input unchanged if
 * it's already small enough, or if it's SVG (vector — rasterizing it here
 * would be a regression, not a fix).
 */
export function downscaleDataUrl(
  dataUrl: string,
  mimeType: string,
  maxDimension = MAX_DIMENSION,
): Promise<string> {
  if (mimeType === 'image/svg+xml') return Promise.resolve(dataUrl)

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img
      if (w <= maxDimension && h <= maxDimension) {
        resolve(dataUrl)
        return
      }
      const scale = maxDimension / Math.max(w, h)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(w * scale)
      canvas.height = Math.round(h * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(dataUrl)
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      // PNG stays PNG (preserves transparency); everything else re-encodes as
      // JPEG, which compresses photographic content far better than PNG does.
      const outputMime = mimeType === 'image/png' ? 'image/png' : 'image/jpeg'
      resolve(canvas.toDataURL(outputMime, outputMime === 'image/jpeg' ? JPEG_QUALITY : undefined))
    }
    img.onerror = () => reject(new Error('Could not load image for downscaling'))
    img.src = dataUrl
  })
}
