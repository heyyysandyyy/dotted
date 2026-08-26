import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { ProductGuides } from './ProductGuides'
import { useCanvasStore } from '../store/useCanvasStore'
import { findProductTemplate, productGuideSpec } from '../products'

const SPEC = productGuideSpec(findProductTemplate('pin-1')!)

function setUpPage(product: typeof SPEC | undefined, showProductGuides = true) {
  useCanvasStore.setState({
    pages: [{ id: 'page-1', canvas: { objects: [] }, product }],
    activePageId: 'page-1',
    showProductGuides,
  })
}

describe('ProductGuides overlay (PROD-001)', () => {
  beforeEach(() => {
    // useViewportGeometry measures its root with a ResizeObserver, which jsdom
    // doesn't implement. Nothing here depends on a real measurement — an
    // unmeasured (0x0) root just means the guides aren't drawn yet.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
  })

  it('draws into its own overlay canvas, outside the fabric canvas — which is what keeps guides out of every export', () => {
    setUpPage(SPEC)
    const { container } = render(<ProductGuides />)

    const overlay = container.querySelector('div')
    expect(overlay).toHaveClass('pointer-events-none')
    expect(overlay?.querySelector('canvas')).toBeInTheDocument()
  })

  it('renders nothing for a page with no product template', () => {
    setUpPage(undefined)
    const { container } = render(<ProductGuides />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing once the guide layer is switched off in the layers panel', () => {
    setUpPage(SPEC, false)
    const { container } = render(<ProductGuides />)

    expect(container).toBeEmptyDOMElement()
  })
})

describe('ProductGuides — printing (PROD-001)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
  })

  it('keeps the tint and safe zone off paper, and puts the cut line on it', () => {
    setUpPage(SPEC)
    const { container } = render(<ProductGuides />)

    const [screen, print] = Array.from(container.querySelectorAll('canvas'))
    // The screen layer (bleed tint + safe zone) drops out of a print…
    expect(screen).toHaveClass('print:hidden')
    // …and a cut-line-only layer, hidden on screen, takes its place.
    expect(print).toHaveClass('hidden')
    expect(print).toHaveClass('print:block')
  })
})
