import { describe, it, expect } from 'vitest'
import { validateImageFile } from './validateImageFile'

function makeFile(type: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], 'test-file', { type })
}

describe('validateImageFile (PHOTO-002)', () => {
  it('accepts a JPEG within the size limit', () => {
    expect(validateImageFile(makeFile('image/jpeg', 1024))).toBeNull()
  })

  it('accepts a PNG within the size limit', () => {
    expect(validateImageFile(makeFile('image/png', 1024))).toBeNull()
  })

  it('rejects an unsupported format with a clear message', () => {
    expect(validateImageFile(makeFile('image/gif', 1024))).toBe(
      'Unsupported file type — only JPG and PNG images are supported.',
    )
  })

  it('rejects a non-image file', () => {
    expect(validateImageFile(makeFile('application/pdf', 1024))).toBe(
      'Unsupported file type — only JPG and PNG images are supported.',
    )
  })

  it('rejects a file over the size limit', () => {
    expect(validateImageFile(makeFile('image/png', 26 * 1024 * 1024))).toBe(
      'Image is too large — the maximum size is 25MB.',
    )
  })

  it('accepts a file right at the size limit', () => {
    expect(validateImageFile(makeFile('image/png', 25 * 1024 * 1024))).toBeNull()
  })
})
