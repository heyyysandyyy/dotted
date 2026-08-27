import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { NewDesignModal } from './NewDesignModal'
import { useCanvasStore } from '../store/useCanvasStore'
import { customProductTemplate } from '../products'

/**
 * The product route through the modal itself (PROD-001), rather than the setup
 * panel in isolation: picking Products, choosing a card, and typing a size the
 * presets don't offer. The panel's own tests can't see this wiring — the modal
 * decides whether the panel is on screen at all, and whether the general
 * canvas-size box is what's showing instead.
 */
describe('NewDesignModal — print products', () => {
  const newProductProject = vi.fn()
  const newProject = vi.fn()

  beforeEach(() => {
    newProductProject.mockClear()
    newProject.mockClear()
    useCanvasStore.setState({ newProductProject, newProject, canvas: null })
  })

  it('offers the products under their own filter', () => {
    render(<NewDesignModal open onClose={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Products' }))

    expect(screen.getByText('2.25″ pin')).toBeInTheDocument()
    expect(screen.getByText('3″ magnet')).toBeInTheDocument()
  })

  it('swaps the page-size box for product setup once a product is picked', () => {
    render(<NewDesignModal open onClose={() => {}} />)
    expect(screen.getByText('Custom page size')).toBeInTheDocument()

    fireEvent.click(screen.getByText('2″ magnet'))

    // The general "Custom size" box sizes the *page*, which is not what a
    // product design is started from — product setup replaces it.
    expect(screen.queryByText('Custom page size')).not.toBeInTheDocument()
    expect(screen.getByText('Product setup')).toBeInTheDocument()
  })

  it('keeps the page-size box off the products screen entirely', () => {
    render(<NewDesignModal open onClose={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Products' }))

    // A width, a height and a Create button under the product cards is how a
    // 2 × 3in magnet became a 2 × 3in page. The tab lands on its first product
    // instead, so product setup is what's under the grid.
    expect(screen.queryByText('Custom page size')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Width')).not.toBeInTheDocument()
    expect(screen.getByText('Product setup')).toBeInTheDocument()
    expect(screen.getByText('Create 1″ pin')).toBeInTheDocument()
  })

  it('falls back to the hint when a search leaves the products grid empty', () => {
    render(<NewDesignModal open onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Search presets'), { target: { value: 'zzz' } })

    fireEvent.click(screen.getByRole('button', { name: 'Products' }))

    expect(screen.getByText(/Pick a product above to set its size/)).toBeInTheDocument()
  })

  it('still offers it everywhere else, where the page is what is being sized', () => {
    render(<NewDesignModal open onClose={() => {}} />)

    expect(screen.getByText('Custom page size')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Print' }))
    expect(screen.getByText('Custom page size')).toBeInTheDocument()
  })

  it('drops product setup when the filter moves to a grid without it', () => {
    render(<NewDesignModal open onClose={() => {}} />)
    fireEvent.click(screen.getByText('2″ magnet'))
    expect(screen.getByText('Product setup')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Social' }))

    // Left on screen it would read as a sizing control for the social presets.
    expect(screen.queryByText('Product setup')).not.toBeInTheDocument()
    expect(screen.getByText('Custom page size')).toBeInTheDocument()
  })

  it('keeps it while the product is still on the grid', () => {
    render(<NewDesignModal open onClose={() => {}} />)
    fireEvent.click(screen.getByText('2″ magnet'))

    fireEvent.click(screen.getByRole('button', { name: 'Products' }))

    expect(screen.getByText('Product setup')).toBeInTheDocument()
  })

  it('does the same for a book preset’s setup panel', () => {
    render(<NewDesignModal open onClose={() => {}} />)
    fireEvent.click(screen.getByText('US Trade'))
    expect(screen.getByText('Book setup')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Print' }))

    expect(screen.queryByText('Book setup')).not.toBeInTheDocument()
  })

  it('offers a custom card in the grid, so a typed size never needs a preset first', () => {
    render(<NewDesignModal open onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Products' }))

    fireEvent.click(screen.getByText('Custom product'))

    // Straight into the size fields — no preset to undo first.
    expect(screen.getByText('Product setup')).toBeInTheDocument()
    expect(screen.getByLabelText('Width (in)')).toBeInTheDocument()
  })

  it('sends the page-size box’s reader to the product flow instead', () => {
    render(<NewDesignModal open onClose={() => {}} />)

    // The general box is where a 2 × 3in entry became a 2 × 3in *page*; its
    // own text is the last place to say so before that happens.
    fireEvent.click(screen.getByRole('button', { name: 'Products filter' }))

    expect(screen.queryByText('Custom page size')).not.toBeInTheDocument()
    expect(screen.getByText('Product setup')).toBeInTheDocument()
    expect(screen.getByLabelText('Width (in)')).toBeInTheDocument()
  })

  it('creates a magnet from the custom card at the typed size', () => {
    render(<NewDesignModal open onClose={() => {}} />)
    fireEvent.click(screen.getByText('Custom product'))

    // "Magnets" is also the badge on every magnet card in the grid above, so
    // reach for the panel's own category card.
    const panel = screen.getByText('Product setup').parentElement!
    fireEvent.click(within(panel).getByText('Magnets'))
    fireEvent.change(screen.getByLabelText('Width (in)'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Height (in)'), { target: { value: '3' } })
    fireEvent.click(screen.getByText('Create 2 × 3″ magnet'))

    expect(newProductProject).toHaveBeenCalledWith(
      customProductTemplate('magnet', 'rect', 2, 3),
      undefined,
    )
    expect(newProject).not.toHaveBeenCalled()
  })

  it('creates a magnet at a typed size, not a page at that size', () => {
    const onClose = vi.fn()
    render(<NewDesignModal open onClose={onClose} />)

    fireEvent.click(screen.getByText('2″ magnet'))
    fireEvent.click(screen.getByText('Custom…'))
    fireEvent.change(screen.getByLabelText('Width (in)'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Height (in)'), { target: { value: '3' } })
    fireEvent.click(screen.getByText('Create 2 × 3″ magnet'))

    expect(newProductProject).toHaveBeenCalledWith(
      customProductTemplate('magnet', 'rect', 2, 3),
      undefined,
    )
    expect(newProject).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})

describe('NewDesignModal — presets and the size fields track each other', () => {
  beforeEach(() => {
    useCanvasStore.setState({ newProject: vi.fn(), newProductProject: vi.fn(), canvas: null })
  })

  const card = (label: string) => screen.getByText(label).closest('button')!

  it('lights up the preset a typed size spells out', () => {
    render(<NewDesignModal open onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Video' }))

    fireEvent.change(screen.getByLabelText('Width'), { target: { value: '1280' } })
    fireEvent.change(screen.getByLabelText('Height'), { target: { value: '720' } })

    expect(card('YouTube thumbnail').className).toContain('border-indigo-500')
  })

  it('drops the highlight again as soon as the size stops matching', () => {
    render(<NewDesignModal open onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Video' }))
    fireEvent.change(screen.getByLabelText('Width'), { target: { value: '1280' } })
    fireEvent.change(screen.getByLabelText('Height'), { target: { value: '720' } })

    fireEvent.change(screen.getByLabelText('Height'), { target: { value: '721' } })

    expect(card('YouTube thumbnail').className).not.toContain('border-indigo-500')
  })

  it('matches whatever unit the fields are in', () => {
    render(<NewDesignModal open onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Print' }))

    fireEvent.change(screen.getByLabelText('Units'), { target: { value: 'in' } })
    // A business card preset is 1050 × 600px, which is 10.9375 × 6.25in.
    fireEvent.change(screen.getByLabelText('Width'), { target: { value: '10.9375' } })
    fireEvent.change(screen.getByLabelText('Height'), { target: { value: '6.25' } })

    expect(card('Business card').className).toContain('border-indigo-500')
  })

  it('does not open Book setup from underneath a half-typed size', () => {
    // On the All tab, where the book presets share the grid with everything
    // else and the size fields are on screen to type into.
    render(<NewDesignModal open onClose={() => {}} />)

    fireEvent.change(screen.getByLabelText('Width'), { target: { value: '1800' } })
    fireEvent.change(screen.getByLabelText('Height'), { target: { value: '2700' } })

    // The card says the size is recognised; the fields stay where they are.
    expect(card('US Trade').className).toContain('border-indigo-500')
    expect(screen.queryByText('Book setup')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Width')).toHaveValue(1800)

    // Clicking the lit card is what commits to the book flow.
    fireEvent.click(card('US Trade'))
    expect(screen.getByText('Book setup')).toBeInTheDocument()
  })

  it('still fills the fields when a preset is clicked', () => {
    render(<NewDesignModal open onClose={() => {}} />)

    fireEvent.click(card('Instagram story'))

    expect(screen.getByLabelText('Width')).toHaveValue(1080)
    expect(screen.getByLabelText('Height')).toHaveValue(1920)
  })
})

describe('NewDesignModal — every tab lands on a card', () => {
  beforeEach(() => {
    useCanvasStore.setState({ newProject: vi.fn(), newProductProject: vi.fn(), canvas: null })
  })

  it('opens on the first card of the All grid', () => {
    render(<NewDesignModal open onClose={() => {}} />)

    expect(screen.getByText('Instagram post').closest('button')!.className).toContain(
      'border-indigo-500',
    )
  })

  it('takes the first size of each tab, and fills the fields with it', () => {
    render(<NewDesignModal open onClose={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Print' }))

    expect(screen.getByText('A4 portrait').closest('button')!.className).toContain(
      'border-indigo-500',
    )
    expect(screen.getByLabelText('Width')).toHaveValue(794)
    expect(screen.getByLabelText('Height')).toHaveValue(1123)
  })

  it('opens the setup panel of tabs whose first card has one', () => {
    render(<NewDesignModal open onClose={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Book' }))
    expect(screen.getByText('Book setup')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Products' }))
    expect(screen.getByText('Create 1″ pin')).toBeInTheDocument()
  })

  it('keeps a selection the new grid still shows rather than resetting it', () => {
    render(<NewDesignModal open onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Products' }))
    fireEvent.click(screen.getByText('3″ magnet'))

    fireEvent.click(screen.getByRole('button', { name: 'All' }))

    expect(screen.getByText('Create 3″ magnet')).toBeInTheDocument()
  })

  it('lands on the first card the search has left in the grid', () => {
    render(<NewDesignModal open onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Search presets'), { target: { value: 'story' } })

    fireEvent.click(screen.getByRole('button', { name: 'Social' }))

    expect(screen.getByLabelText('Width')).toHaveValue(1080)
    expect(screen.getByLabelText('Height')).toHaveValue(1920)
  })
})
