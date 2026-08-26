import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as fabric from 'fabric'
import { LayersPanel } from './LayersPanel'
import { useCanvasStore } from '../store/useCanvasStore'
import { findProductTemplate, productGuideSpec } from '../products'

const SPEC = productGuideSpec(findProductTemplate('pin-2-25')!)

function setUpPage(product: typeof SPEC | undefined) {
  const canvas = new fabric.Canvas(document.createElement('canvas'), { width: 100, height: 100 })
  useCanvasStore.setState({
    canvas,
    selection: [],
    pages: [{ id: 'page-1', canvas: canvas.toObject(), product }],
    activePageId: 'page-1',
    showProductGuides: true,
  })
  return canvas
}

describe('LayersPanel — product guide layer (PROD-001)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('lists the template’s guides above the real layers', () => {
    setUpPage(SPEC)
    render(<LayersPanel />)

    expect(screen.getByText('2.25″ pin guides')).toBeInTheDocument()
  })

  it('shows the guide layer even on a page with nothing on it yet', () => {
    setUpPage(SPEC)
    render(<LayersPanel />)

    expect(screen.getByText('2.25″ pin guides')).toBeInTheDocument()
    expect(screen.getByText('No layers yet')).toBeInTheDocument()
  })

  it('toggles the guides off and back on from its eye button', () => {
    setUpPage(SPEC)
    render(<LayersPanel />)

    fireEvent.click(screen.getByTitle('Hide template guides'))
    expect(useCanvasStore.getState().showProductGuides).toBe(false)

    fireEvent.click(screen.getByTitle('Show template guides'))
    expect(useCanvasStore.getState().showProductGuides).toBe(true)
  })

  it('offers no rename or reorder handle — the guides are not a canvas object', () => {
    setUpPage(SPEC)
    render(<LayersPanel />)

    const row = screen.getByText('2.25″ pin guides').closest('div')!
    expect(row.querySelector('[title="Drag to reorder"]')).toBeNull()
    expect(screen.getByTitle("Guides can't be selected or moved")).toBeInTheDocument()
  })

  it('is absent for a page with no product template', () => {
    setUpPage(undefined)
    render(<LayersPanel />)

    expect(screen.queryByText(/guides/)).not.toBeInTheDocument()
  })
})
