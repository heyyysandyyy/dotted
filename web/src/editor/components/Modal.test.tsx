import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Modal } from './Modal'

describe('Modal (BUG-011)', () => {
  it('is announced as a dialog, labelled by its title', () => {
    render(<Modal title="Export" onClose={() => {}}>body</Modal>)
    const dialog = screen.getByRole('dialog', { name: 'Export' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })

  it('closes on Escape, from anywhere in the document', () => {
    const onClose = vi.fn()
    render(<Modal title="Export" onClose={onClose}>body</Modal>)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('leaves other keys alone', () => {
    const onClose = vi.fn()
    render(<Modal title="Export" onClose={onClose}>body</Modal>)
    fireEvent.keyDown(document, { key: 'a' })
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('stops Escape reaching the editor underneath, which would also exit crop mode', () => {
    const editorHandler = vi.fn()
    document.addEventListener('keydown', editorHandler)
    render(<Modal title="Export" onClose={() => {}}>body</Modal>)
    fireEvent.keyDown(document, { key: 'Escape' })
    document.removeEventListener('keydown', editorHandler)
    expect(editorHandler).not.toHaveBeenCalled()
  })

  it('still closes on a backdrop click but not a click inside', () => {
    const onClose = vi.fn()
    render(<Modal title="Export" onClose={onClose}>body</Modal>)
    fireEvent.click(screen.getByText('body'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('dialog').parentElement!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
