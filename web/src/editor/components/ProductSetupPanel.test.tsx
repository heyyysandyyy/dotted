import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProductSetupPanel } from './ProductSetupPanel'
import { useCanvasStore } from '../store/useCanvasStore'
import { customProductTemplate, findProductTemplate, productWithShape } from '../products'

/** The value shown under one stat label — several stats can share a value
 *  (a pin's bleed and safe zone are both 0.25in), so they're read by label. */
function stat(label: string): string {
  const value = screen.getByText(label).nextElementSibling
  if (!value) throw new Error(`No value rendered for the "${label}" stat`)
  return value.textContent ?? ''
}

describe('ProductSetupPanel (PROD-001)', () => {
  const newProductProject = vi.fn()

  beforeEach(() => {
    newProductProject.mockClear()
    useCanvasStore.setState({ newProductProject })
  })

  it('opens on the category and size of the card that was clicked', () => {
    render(<ProductSetupPanel initialTemplateId="magnet-3" onCreated={() => {}} />)

    expect(screen.getByText('Magnets').closest('button')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('3″').closest('button')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Create 3″ magnet')).toBeInTheDocument()
  })

  it('offers only the sizes of the selected category', () => {
    render(<ProductSetupPanel initialTemplateId="pin-1" onCreated={() => {}} />)

    expect(screen.getAllByRole('button', { pressed: false }).map((b) => b.textContent)).toEqual(
      expect.arrayContaining(['1.5″', '2.25″', '3″']),
    )
    // 2" is a magnet size, so it isn't on offer while Pins is selected.
    expect(screen.queryByText('2″')).not.toBeInTheDocument()
  })

  it('switching category lands on that category’s first size rather than an id it no longer has', () => {
    render(<ProductSetupPanel initialTemplateId="pin-3" onCreated={() => {}} />)

    fireEvent.click(screen.getByText('Magnets'))

    expect(screen.getByText('Create 2″ magnet')).toBeInTheDocument()
    expect(screen.getByText('2″').closest('button')).toHaveAttribute('aria-pressed', 'true')
  })

  it('creates the project at the picked size and closes the modal', () => {
    const onCreated = vi.fn()
    render(<ProductSetupPanel initialTemplateId="pin-1" onCreated={onCreated} />)

    fireEvent.click(screen.getByText('2.25″'))
    fireEvent.click(screen.getByText('Create 2.25″ pin'))

    expect(newProductProject).toHaveBeenCalledWith(findProductTemplate('pin-2-25'), undefined)
    expect(onCreated).toHaveBeenCalled()
  })

  it('states the artboard, bleed, safe zone and resolution being committed to', () => {
    render(<ProductSetupPanel initialTemplateId="pin-2-25" onCreated={() => {}} />)

    expect(stat('Product')).toBe('2.25 in round')
    expect(stat('Page')).toBe('825 × 825 px')
    expect(stat('Bleed')).toBe('0.25 in')
    expect(stat('Safe zone')).toBe('0.25 in')
    expect(stat('Resolution')).toBe('300 dpi')
  })

  it('reports a magnet’s smaller bleed and safe zone, not the pin defaults', () => {
    render(<ProductSetupPanel initialTemplateId="magnet-2" onCreated={() => {}} />)

    expect(stat('Page')).toBe('675 × 675 px')
    expect(stat('Bleed')).toBe('0.125 in')
    expect(stat('Safe zone')).toBe('0.125 in')
  })

  it('falls back to the first template for an id that no longer exists', () => {
    render(<ProductSetupPanel initialTemplateId="pin-42" onCreated={() => {}} />)
    expect(screen.getByText('Create 1″ pin')).toBeInTheDocument()
  })
})

describe('ProductSetupPanel — several per page (PROD-001)', () => {
  const newProductProject = vi.fn()

  beforeEach(() => {
    newProductProject.mockClear()
    useCanvasStore.setState({ newProductProject })
  })

  it('starts on one per artboard, with no paper or count to answer for', () => {
    render(<ProductSetupPanel initialTemplateId="pin-2-25" onCreated={() => {}} />)

    expect(screen.getByText('One per artboard')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Paper')).not.toBeInTheDocument()
    expect(stat('Products')).toBe('1')
  })

  it('fills the sheet by default and says how many fit where', () => {
    render(<ProductSetupPanel initialTemplateId="pin-2-25" onCreated={() => {}} />)

    fireEvent.click(screen.getByText('Several per page'))

    expect(screen.getByLabelText('Per page')).toHaveValue(6)
    expect(screen.getByText(/Up to 6 fit on US Letter/)).toBeInTheDocument()
    expect(screen.getByText(/2 across × 3 down/)).toBeInTheDocument()
    expect(stat('Page')).toBe('2550 × 3300 px')
    expect(stat('Products')).toBe('6')
  })

  it('re-fills for the new paper rather than holding onto the old count', () => {
    render(<ProductSetupPanel initialTemplateId="pin-2-25" onCreated={() => {}} />)
    fireEvent.click(screen.getByText('Several per page'))

    fireEvent.change(screen.getByLabelText('Paper'), { target: { value: 'a4' } })

    expect(screen.getByLabelText('Per page')).toHaveValue(8)
    expect(stat('Page')).toBe('2480 × 3508 px')
  })

  it('takes a smaller count and creates the sheet with it', () => {
    const onCreated = vi.fn()
    render(<ProductSetupPanel initialTemplateId="pin-2-25" onCreated={onCreated} />)
    fireEvent.click(screen.getByText('Several per page'))

    fireEvent.change(screen.getByLabelText('Per page'), { target: { value: '4' } })
    expect(screen.getByText('Create sheet of 4')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Create sheet of 4'))

    expect(newProductProject).toHaveBeenCalledWith(findProductTemplate('pin-2-25'), {
      sheetId: 'letter',
      count: 4,
    })
    expect(onCreated).toHaveBeenCalled()
  })

  it('never offers more than the paper holds', () => {
    render(<ProductSetupPanel initialTemplateId="pin-2-25" onCreated={() => {}} />)
    fireEvent.click(screen.getByText('Several per page'))

    fireEvent.change(screen.getByLabelText('Per page'), { target: { value: '99' } })

    expect(screen.getByLabelText('Per page')).toHaveValue(6)
    expect(screen.getByText('Create sheet of 6')).toBeInTheDocument()
  })

  it('switching back to one per artboard drops the sheet from what gets created', () => {
    render(<ProductSetupPanel initialTemplateId="pin-1" onCreated={() => {}} />)
    fireEvent.click(screen.getByText('Several per page'))
    fireEvent.click(screen.getByText('One per artboard'))

    fireEvent.click(screen.getByText('Create 1″ pin'))

    expect(newProductProject).toHaveBeenCalledWith(findProductTemplate('pin-1'), undefined)
  })
})

describe('ProductSetupPanel — custom sizes (PROD-001)', () => {
  const newProductProject = vi.fn()

  beforeEach(() => {
    newProductProject.mockClear()
    useCanvasStore.setState({ newProductProject })
  })

  const openCustom = (initialTemplateId = 'magnet-2') => {
    render(<ProductSetupPanel initialTemplateId={initialTemplateId} onCreated={() => {}} />)
    fireEvent.click(screen.getByText('Custom…'))
  }

  it('is closed until asked for, leaving the presets in charge', () => {
    render(<ProductSetupPanel initialTemplateId="magnet-2" onCreated={() => {}} />)

    expect(screen.queryByLabelText('Width (in)')).not.toBeInTheDocument()
    expect(screen.getByText('Create 2″ magnet')).toBeInTheDocument()
  })

  it('sizes the product, not the page: 2 × 3 is the magnet, and the page is it plus bleed', () => {
    openCustom()

    fireEvent.change(screen.getByLabelText('Width (in)'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Height (in)'), { target: { value: '3' } })

    expect(stat('Product')).toBe('2 × 3 in')
    expect(stat('Page')).toBe('675 × 975 px')
    expect(stat('Products')).toBe('1')
    expect(screen.getByText('Create 2 × 3″ magnet')).toBeInTheDocument()
  })

  it('works out how many of that size a page holds, and fills it', () => {
    openCustom()
    fireEvent.change(screen.getByLabelText('Width (in)'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Height (in)'), { target: { value: '3' } })

    fireEvent.click(screen.getByText('Several per page'))

    expect(screen.getByText(/Up to 9 fit on US Letter/)).toBeInTheDocument()
    expect(screen.getByText(/3 across × 3 down/)).toBeInTheDocument()
    expect(screen.getByLabelText('Per page')).toHaveValue(9)
    // The page is now the paper — the 2 × 3in size stayed with the magnet.
    expect(stat('Product')).toBe('2 × 3 in')
    expect(stat('Page')).toBe('2550 × 3300 px')
  })

  it('still lets a smaller number than fits be asked for', () => {
    openCustom()
    fireEvent.change(screen.getByLabelText('Width (in)'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Height (in)'), { target: { value: '3' } })
    fireEvent.click(screen.getByText('Several per page'))

    fireEvent.change(screen.getByLabelText('Per page'), { target: { value: '4' } })
    fireEvent.click(screen.getByText('Create sheet of 4'))

    expect(newProductProject).toHaveBeenCalledWith(customProductTemplate('magnet', 'rect', 2, 3), {
      sheetId: 'letter',
      count: 4,
    })
  })

  it('asks for one measurement for a round product and creates it at that diameter', () => {
    openCustom('pin-1')
    fireEvent.click(screen.getByText('Round'))

    expect(screen.queryByLabelText('Height (in)')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Diameter (in)'), { target: { value: '2.5' } })

    expect(stat('Product')).toBe('2.5 in round')
    fireEvent.click(screen.getByText('Create 2.5″ pin'))
    expect(newProductProject).toHaveBeenCalledWith(
      customProductTemplate('pin', 'circle', 2.5, 2.5),
      undefined,
    )
  })

  it('refuses to create a size nothing could be made at, and says the range', () => {
    openCustom()

    fireEvent.change(screen.getByLabelText('Width (in)'), { target: { value: '0' } })

    expect(screen.getByText(/between 0.5 and 12 in/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Create/ })).toBeDisabled()
  })

  it('goes back to a preset when one is clicked', () => {
    openCustom()
    fireEvent.click(screen.getByText('3″'))

    expect(screen.queryByLabelText('Width (in)')).not.toBeInTheDocument()
    expect(screen.getByText('Create 3″ magnet')).toBeInTheDocument()
  })
})

describe('ProductSetupPanel — round or square presets (PROD-001)', () => {
  const newProductProject = vi.fn()

  beforeEach(() => {
    newProductProject.mockClear()
    useCanvasStore.setState({ newProductProject })
  })

  it('offers magnets both outlines, starting round', () => {
    render(<ProductSetupPanel initialTemplateId="magnet-2" onCreated={() => {}} />)

    expect(screen.getByText('Round')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Square')).toHaveAttribute('aria-pressed', 'false')
  })

  it('does not offer it for pins, which only come round', () => {
    render(<ProductSetupPanel initialTemplateId="pin-1" onCreated={() => {}} />)

    expect(screen.queryByText('Square')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Magnets'))
    expect(screen.getByText('Square')).toBeInTheDocument()
  })

  it('squares the preset off at the same size, and says so', () => {
    render(<ProductSetupPanel initialTemplateId="magnet-2" onCreated={() => {}} />)

    fireEvent.click(screen.getByText('Square'))

    expect(stat('Product')).toBe('2 × 2 in')
    expect(stat('Page')).toBe('675 × 675 px')
    fireEvent.click(screen.getByText('Create 2″ square magnet'))
    expect(newProductProject).toHaveBeenCalledWith(
      productWithShape(findProductTemplate('magnet-2')!, 'rect'),
      undefined,
    )
  })

  it('holds the outline while another size is picked', () => {
    render(<ProductSetupPanel initialTemplateId="magnet-2" onCreated={() => {}} />)
    fireEvent.click(screen.getByText('Square'))

    fireEvent.click(screen.getByText('3″'))

    expect(screen.getByText('Create 3″ square magnet')).toBeInTheDocument()
    // The size chip still tracks the preset it came from.
    expect(screen.getByText('3″').closest('button')).toHaveAttribute('aria-pressed', 'true')
  })

  it('gangs squares up on a sheet like any other product', () => {
    render(<ProductSetupPanel initialTemplateId="magnet-2" onCreated={() => {}} />)
    fireEvent.click(screen.getByText('Square'))

    fireEvent.click(screen.getByText('Several per page'))

    expect(screen.getByText(/Up to 12 fit on US Letter/)).toBeInTheDocument()
    expect(stat('Page')).toBe('2550 × 3300 px')
  })
})
