import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageBar } from './PageBar'
import { useCanvasStore } from '../store/useCanvasStore'

// The thumbnails render a page through fabric on a real canvas; this suite is
// about the per-page controls, so the render is stubbed out.
vi.mock('../preview', () => ({ renderPreview: () => () => {} }))

describe('PageBar per-page controls (BUG-012)', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      pages: [
        { id: 'page-1', canvas: { objects: [] } },
        { id: 'page-2', canvas: { objects: [] } },
      ],
      activePageId: 'page-1',
      width: 800,
      height: 600,
      viewMode: 'single',
    })
  })

  it('keeps duplicate and delete in the DOM, reachable without a mouse', () => {
    render(<PageBar />)
    // They used to be `hidden` until hover, so a keyboard user could never
    // reach them: being present and labelled per page is the fix.
    for (const n of [1, 2]) {
      expect(screen.getByLabelText(`Duplicate page ${n}`)).toBeTruthy()
      expect(screen.getByLabelText(`Delete page ${n}`)).toBeTruthy()
    }
  })

  it('hides delete when a single page is all that is left', () => {
    useCanvasStore.setState({ pages: [{ id: 'page-1', canvas: { objects: [] } }], activePageId: 'page-1' })
    render(<PageBar />)
    expect(screen.getByLabelText('Duplicate page 1')).toBeTruthy()
    expect(screen.queryByLabelText('Delete page 1')).toBeNull()
  })
})
