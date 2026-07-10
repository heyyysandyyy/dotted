const ACCEPTED_TYPES = ['image/jpeg', 'image/png']
const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB

/**
 * Returns a user-facing error message if the file can't be loaded, or null
 * if it's fine. JPG/PNG only for v1 (issue #164) — Canvas's own upload
 * (LeftSidebar.tsx) accepts a wider set, but that's a separate, more
 * permissive path this ticket doesn't touch.
 */
export function validateImageFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return 'Unsupported file type — only JPG and PNG images are supported.'
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'Image is too large — the maximum size is 25MB.'
  }
  return null
}
