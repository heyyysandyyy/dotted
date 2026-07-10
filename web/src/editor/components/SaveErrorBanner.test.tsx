import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SaveErrorBanner } from './SaveErrorBanner'
import { useCanvasStore } from '../store/useCanvasStore'

describe('SaveErrorBanner', () => {
  beforeEach(() => {
    useCanvasStore.setState({ saveError: null })
  })

  it('renders nothing when there is no save error', () => {
    const { container } = render(<SaveErrorBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the message when a save error is set', () => {
    useCanvasStore.setState({ saveError: "Couldn't save — your browser's storage is full." })
    render(<SaveErrorBanner />)
    expect(screen.getByText(/storage is full/)).toBeInTheDocument()
  })

  it('dismissing clears the error', () => {
    useCanvasStore.setState({ saveError: 'Something failed' })
    render(<SaveErrorBanner />)
    fireEvent.click(screen.getByTitle('Dismiss'))
    expect(useCanvasStore.getState().saveError).toBeNull()
  })
})
