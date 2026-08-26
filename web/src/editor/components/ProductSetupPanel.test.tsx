import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProductSetupPanel } from './ProductSetupPanel'
import { useCanvasStore } from '../store/useCanvasStore'
import { findProductTemplate } from '../products'

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

    expect(newProductProject).toHaveBeenCalledWith(findProductTemplate('pin-2-25'))
    expect(onCreated).toHaveBeenCalled()
  })

  it('states the artboard, bleed, safe zone and resolution being committed to', () => {
    render(<ProductSetupPanel initialTemplateId="pin-2-25" onCreated={() => {}} />)

    expect(stat('Canvas')).toBe('825 × 825 px')
    expect(stat('Bleed')).toBe('0.25 in')
    expect(stat('Safe zone')).toBe('0.25 in')
    expect(stat('Resolution')).toBe('300 dpi')
  })

  it('reports a magnet’s smaller bleed and safe zone, not the pin defaults', () => {
    render(<ProductSetupPanel initialTemplateId="magnet-2" onCreated={() => {}} />)

    expect(stat('Canvas')).toBe('675 × 675 px')
    expect(stat('Bleed')).toBe('0.125 in')
    expect(stat('Safe zone')).toBe('0.125 in')
  })

  it('falls back to the first template for an id that no longer exists', () => {
    render(<ProductSetupPanel initialTemplateId="pin-42" onCreated={() => {}} />)
    expect(screen.getByText('Create 1″ pin')).toBeInTheDocument()
  })
})
