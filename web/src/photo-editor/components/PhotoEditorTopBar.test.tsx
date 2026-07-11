import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PhotoEditorTopBar } from './PhotoEditorTopBar'
import { usePhotoEditorStore, type PhotoEditorSourceRef } from '../store/usePhotoEditorStore'
import { useCanvasStore } from '../../editor/store/useCanvasStore'

// WorkspaceSwitcher (rendered inside PhotoEditorTopBar) calls useLocation,
// which throws outside a <RouterProvider> — same pattern ContextMenu.test.tsx
// already uses for useNavigate.
const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useLocation: () => '/photo-editor',
  useNavigate: () => navigateMock,
  Link: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}))

// flattenImage loads the data URL into a real Image to read its natural
// size — jsdom never fires Image.onload for actual image bytes (see
// lib/downscaleImage.test.ts). Mocked here since these tests exercise the
// button wiring, not the flatten pipeline itself (covered by
// utils/flattenImage.test.ts).
vi.mock('../utils/flattenImage', () => ({
  flattenImage: vi.fn(() => Promise.resolve('data:image/png;base64,flattened')),
}))

const REF: PhotoEditorSourceRef = {
  pageId: 'page-1',
  objectId: 'obj-1',
  left: 10,
  top: 20,
  scaleX: 1,
  scaleY: 1,
  angle: 0,
  zIndex: 2,
}

describe('PhotoEditorTopBar — undo/redo (PHOTO-005)', () => {
  beforeEach(() => {
    usePhotoEditorStore.setState({
      image: null,
      sourceRef: null,
      historyStack: [
        { brightness: 0, contrast: 0 },
        { brightness: 40, contrast: 0 },
      ],
      historyIndex: 1,
      adjustments: { brightness: 40, contrast: 0 },
    })
  })

  it('undo is enabled and redo is disabled when there is history behind but nothing ahead', () => {
    render(<PhotoEditorTopBar />)
    expect(screen.getByTitle('Undo (Cmd/Ctrl+Z)')).toBeEnabled()
    expect(screen.getByTitle('Redo (Cmd/Ctrl+Shift+Z)')).toBeDisabled()
  })

  it('clicking undo steps the adjustments back', () => {
    render(<PhotoEditorTopBar />)
    fireEvent.click(screen.getByTitle('Undo (Cmd/Ctrl+Z)'))
    expect(usePhotoEditorStore.getState().adjustments).toEqual({ brightness: 0, contrast: 0 })
  })

  it('both buttons are disabled with no history at all', () => {
    usePhotoEditorStore.setState({
      historyStack: [{ brightness: 0, contrast: 0 }],
      historyIndex: 0,
      adjustments: { brightness: 0, contrast: 0 },
    })
    render(<PhotoEditorTopBar />)
    expect(screen.getByTitle('Undo (Cmd/Ctrl+Z)')).toBeDisabled()
    expect(screen.getByTitle('Redo (Cmd/Ctrl+Shift+Z)')).toBeDisabled()
  })
})

describe('PhotoEditorTopBar — Save/Cancel (PHOTO-006)', () => {
  beforeEach(() => {
    navigateMock.mockClear()
    usePhotoEditorStore.setState({
      image: null,
      sourceRef: null,
      adjustments: { brightness: 0, contrast: 0 },
      historyStack: [{ brightness: 0, contrast: 0 }],
      historyIndex: 0,
    })
  })

  it('shows neither button with no image loaded', () => {
    render(<PhotoEditorTopBar />)
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument()
    expect(screen.queryByText('Save')).not.toBeInTheDocument()
  })

  it('shows only Cancel for a direct upload with no Canvas origin', () => {
    usePhotoEditorStore.setState({ image: 'data:image/png;base64,abc', sourceRef: null })
    render(<PhotoEditorTopBar />)
    expect(screen.getByText('Cancel')).toBeInTheDocument()
    expect(screen.queryByText('Save')).not.toBeInTheDocument()
  })

  it('shows both Cancel and Save for an Edit-from-Canvas session', () => {
    usePhotoEditorStore.setState({ image: 'data:image/png;base64,abc', sourceRef: REF })
    render(<PhotoEditorTopBar />)
    expect(screen.getByText('Cancel')).toBeInTheDocument()
    expect(screen.getByText('Save')).toBeInTheDocument()
  })

  it('Cancel clears the session and navigates to Canvas without touching it', () => {
    usePhotoEditorStore.setState({ image: 'data:image/png;base64,abc', sourceRef: REF })
    render(<PhotoEditorTopBar />)

    fireEvent.click(screen.getByText('Cancel'))

    expect(usePhotoEditorStore.getState().image).toBeNull()
    expect(navigateMock).toHaveBeenCalledWith({ to: '/' })
  })

  it('Save flattens, ports back, clears the session, and navigates to Canvas', async () => {
    const portBack = vi.fn(() => true)
    useCanvasStore.setState({ portBackFromPhotoEditor: portBack })
    usePhotoEditorStore.setState({
      image: 'data:image/png;base64,abc',
      sourceRef: REF,
      adjustments: { brightness: 30, contrast: -10 },
    })
    render(<PhotoEditorTopBar />)

    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: '/' }))
    expect(portBack).toHaveBeenCalledWith(REF, 'data:image/png;base64,flattened', { brightness: 30, contrast: -10 })
    expect(usePhotoEditorStore.getState().image).toBeNull()
  })

  it('Save shows an error and keeps the session open if the Canvas object is gone', async () => {
    useCanvasStore.setState({ portBackFromPhotoEditor: vi.fn(() => false) })
    usePhotoEditorStore.setState({ image: 'data:image/png;base64,abc', sourceRef: REF })
    render(<PhotoEditorTopBar />)

    fireEvent.click(screen.getByText('Save'))

    expect(await screen.findByText(/couldn't find that image/i)).toBeInTheDocument()
    expect(usePhotoEditorStore.getState().image).not.toBeNull()
    expect(navigateMock).not.toHaveBeenCalled()
  })
})
