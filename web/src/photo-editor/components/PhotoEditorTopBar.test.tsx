import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PhotoEditorTopBar } from './PhotoEditorTopBar'
import { usePhotoEditorStore } from '../store/usePhotoEditorStore'

// WorkspaceSwitcher (rendered inside PhotoEditorTopBar) calls useLocation,
// which throws outside a <RouterProvider> — same pattern ContextMenu.test.tsx
// already uses for useNavigate.
vi.mock('@tanstack/react-router', () => ({
  useLocation: () => '/photo-editor',
  Link: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}))

describe('PhotoEditorTopBar — undo/redo (PHOTO-005)', () => {
  beforeEach(() => {
    usePhotoEditorStore.setState({
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
