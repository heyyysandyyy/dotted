import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../exporters', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('../exporters')
  return {
    ...actual,
    exportPNG: vi.fn(),
    exportJPEG: vi.fn(),
    exportPDF: vi.fn(() => Promise.resolve()),
    exportSVG: vi.fn(() => Promise.resolve()),
  }
})

import { ExportModal } from './ExportModal'
import { exportPNG, exportJPEG, exportPDF, exportSVG } from '../exporters'
import { useCanvasStore } from '../store/useCanvasStore'
import { findProductTemplate, productGuideSpec } from '../products'

const SPEC = productGuideSpec(findProductTemplate('pin-2-25')!)
// Just enough canvas for the dialog to size the export: a 400×300 artboard.
const canvas = { __artboardSize: { width: 400, height: 300 }, getObjects: () => [] } as never

function setUpPage(product: typeof SPEC | undefined, selection: unknown[] = []) {
  useCanvasStore.setState({
    canvas,
    selection: selection as never,
    designName: 'My pins',
    pages: [{ id: 'page-1', canvas: { objects: [] }, product }],
    activePageId: 'page-1',
  })
}

describe('ExportModal — product cut lines (PROD-001)', () => {
  beforeEach(() => {
    vi.mocked(exportPNG).mockClear()
    vi.mocked(exportSVG).mockClear()
  })

  it('hands the active page’s cut-line geometry to the exporter', () => {
    setUpPage(SPEC)
    render(<ExportModal open onClose={() => {}} />)

    fireEvent.click(screen.getByText('Download'))

    expect(exportPNG).toHaveBeenCalledWith(canvas, 'My pins', expect.objectContaining({ scale: 1, cutLines: SPEC }))
  })

  it('passes it to the vector export too', () => {
    setUpPage(SPEC)
    render(<ExportModal open onClose={() => {}} />)

    fireEvent.click(screen.getByText('svg'))
    fireEvent.click(screen.getByText('Download'))

    expect(exportSVG).toHaveBeenCalledWith(canvas, 'My pins', expect.objectContaining({ cutLines: SPEC }))
  })

  it('sends nothing extra for a design with no product template', () => {
    setUpPage(undefined)
    render(<ExportModal open onClose={() => {}} />)

    fireEvent.click(screen.getByText('Download'))

    expect(exportPNG).toHaveBeenCalledWith(canvas, 'My pins', expect.objectContaining({ cutLines: null }))
  })
})

/** A selected object with a scene-plane box, as exportBounds reads it. */
const picked = { getBoundingRect: () => ({ left: 20, top: 30, width: 100, height: 50 }) }

describe('ExportModal — export options (UX-028)', () => {
  beforeEach(() => {
    vi.mocked(exportPNG).mockClear()
    vi.mocked(exportJPEG).mockClear()
    vi.mocked(exportPDF).mockClear()
    vi.mocked(exportSVG).mockClear()
  })

  const download = () => fireEvent.click(screen.getByText('Download'))

  it('offers a transparent-background toggle for PNG only, on by default', () => {
    setUpPage(undefined)
    render(<ExportModal open onClose={() => {}} />)

    const toggle = screen.getByLabelText('Transparent background') as HTMLInputElement
    expect(toggle.checked).toBe(true)
    download()
    expect(exportPNG).toHaveBeenCalledWith(canvas, 'My pins', expect.objectContaining({ transparent: true }))

    for (const f of ['jpeg', 'pdf', 'svg']) {
      fireEvent.click(screen.getByText(f))
      expect(screen.queryByLabelText('Transparent background')).toBeNull()
    }
  })

  it('exports an opaque PNG with the toggle off', () => {
    setUpPage(undefined)
    render(<ExportModal open onClose={() => {}} />)

    fireEvent.click(screen.getByLabelText('Transparent background'))
    download()

    expect(exportPNG).toHaveBeenCalledWith(canvas, 'My pins', expect.objectContaining({ transparent: false }))
  })

  it('disables "Selection only" with nothing selected', () => {
    setUpPage(undefined)
    render(<ExportModal open onClose={() => {}} />)

    expect(screen.getByText('Selection only').closest('button')!.disabled).toBe(true)
    expect(screen.getByText('400 × 300 px')).toBeTruthy()
  })

  it('scopes every format to the selection, without the product cut line', () => {
    setUpPage(SPEC, [picked])
    render(<ExportModal open onClose={() => {}} />)

    fireEvent.click(screen.getByText('Selection only'))
    expect(screen.getByText('100 × 50 px')).toBeTruthy()
    download()
    expect(exportPNG).toHaveBeenCalledWith(
      canvas,
      'My pins',
      expect.objectContaining({ selection: [picked], cutLines: null }),
    )
  })

  it('takes a custom scale alongside the preset chips', () => {
    setUpPage(undefined)
    render(<ExportModal open onClose={() => {}} />)

    fireEvent.change(screen.getByLabelText('Custom scale'), { target: { value: '1.5' } })
    expect(screen.getByText('600 × 450 px')).toBeTruthy()
    download()
    expect(exportPNG).toHaveBeenCalledWith(canvas, 'My pins', expect.objectContaining({ scale: 1.5 }))

    // A chip writes the field too.
    fireEvent.click(screen.getByText('3×'))
    expect((screen.getByLabelText('Custom scale') as HTMLInputElement).value).toBe('3')
  })

  it('blocks a scale out of range or an export too large to allocate', () => {
    setUpPage(undefined)
    render(<ExportModal open onClose={() => {}} />)
    const field = screen.getByLabelText('Custom scale')
    const button = screen.getByText('Download') as HTMLButtonElement

    fireEvent.change(field, { target: { value: '0' } })
    expect(screen.getByRole('alert').textContent).toMatch(/Scale must be between/)
    expect(button.disabled).toBe(true)

    fireEvent.change(field, { target: { value: '' } })
    expect(button.disabled).toBe(true)

    // 400px × 10 fits; the check is against the output, not the factor alone.
    fireEvent.change(field, { target: { value: '10' } })
    expect(button.disabled).toBe(false)
  })

  it('defaults the file name to the design name and exports under the edited one', () => {
    setUpPage(undefined)
    render(<ExportModal open onClose={() => {}} />)
    const field = screen.getByLabelText('File name') as HTMLInputElement

    expect(field.value).toBe('My pins')
    expect(screen.getByText('Saves as My pins.png')).toBeTruthy()

    fireEvent.change(field, { target: { value: 'badge: final?' } })
    fireEvent.click(screen.getByText('jpeg'))
    expect(screen.getByText('Saves as badge final.jpg')).toBeTruthy()
    download()
    expect(exportJPEG).toHaveBeenCalledWith(canvas, 'badge: final?', expect.anything())
  })

  it('goes back to the design name the next time it opens', () => {
    setUpPage(undefined)
    const { rerender } = render(<ExportModal open onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('File name'), { target: { value: 'one-off' } })
    fireEvent.click(screen.getByText('Cancel'))

    rerender(<ExportModal open={false} onClose={() => {}} />)
    rerender(<ExportModal open onClose={() => {}} />)

    expect((screen.getByLabelText('File name') as HTMLInputElement).value).toBe('My pins')
  })
})
