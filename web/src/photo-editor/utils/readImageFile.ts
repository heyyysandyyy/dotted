/**
 * Reads a File as a base64 data URL, mirroring Canvas's own
 * addImageFromFile (objectsSlice.ts) so an uploaded image is stored the same
 * way here — a plain data: string usePhotoEditorStore's `image` field (and
 * the <img> that renders it in PhotoEditor.tsx) already expects.
 */
export function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Could not read file'))
    }
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}
