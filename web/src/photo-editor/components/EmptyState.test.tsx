import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EmptyState } from './EmptyState'
import { usePhotoEditorStore } from '../store/usePhotoEditorStore'

function makeFile(type: string, name = 'photo', content = 'x'): File {
  return new File([content], name, { type })
}

describe('EmptyState upload (PHOTO-002)', () => {
  beforeEach(() => {
    usePhotoEditorStore.setState({ image: null })
  })

  it('loads a valid PNG picked via the file input into the store', async () => {
    render(<EmptyState />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(input, { target: { files: [makeFile('image/png')] } })

    await waitFor(() => expect(usePhotoEditorStore.getState().image).toMatch(/^data:image\/png;base64,/))
  })

  it('loads a valid JPEG dropped onto the dropzone into the store', async () => {
    render(<EmptyState />)
    const dropzone = screen.getByText('No image loaded').closest('div')!.parentElement!

    fireEvent.drop(dropzone, { dataTransfer: { files: [makeFile('image/jpeg')] } })

    await waitFor(() => expect(usePhotoEditorStore.getState().image).toMatch(/^data:image\/jpeg;base64,/))
  })

  it('rejects an unsupported format with a visible error and leaves the store empty', async () => {
    render(<EmptyState />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(input, { target: { files: [makeFile('image/gif')] } })

    expect(await screen.findByText(/only JPG and PNG images are supported/)).toBeInTheDocument()
    expect(usePhotoEditorStore.getState().image).toBeNull()
  })
})
