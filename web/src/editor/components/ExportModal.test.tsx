import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../exporters', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('../exporters')
  return {
    ...actual,
    exportPNG: vi.fn(),
    exportJPEG: vi.fn(),
    exportPDF: vi.fn(() => Promise.resolve()),
    exportSVG: vi.fn(),
  }
})

import { ExportModal } from './ExportModal'
import { exportPNG, exportSVG } from '../exporters'
import { useCanvasStore } from '../store/useCanvasStore'
import { findProductTemplate, productGuideSpec } from '../products'

const SPEC = productGuideSpec(findProductTemplate('pin-2-25')!)
const canvas = {} as never

function setUpPage(product: typeof SPEC | undefined) {
  useCanvasStore.setState({
    canvas,
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

    expect(exportPNG).toHaveBeenCalledWith(canvas, 'My pins', 1, SPEC)
  })

  it('passes it to the vector export too', () => {
    setUpPage(SPEC)
    render(<ExportModal open onClose={() => {}} />)

    fireEvent.click(screen.getByText('svg'))
    fireEvent.click(screen.getByText('Download'))

    expect(exportSVG).toHaveBeenCalledWith(canvas, 'My pins', SPEC)
  })

  it('sends nothing extra for a design with no product template', () => {
    setUpPage(undefined)
    render(<ExportModal open onClose={() => {}} />)

    fireEvent.click(screen.getByText('Download'))

    expect(exportPNG).toHaveBeenCalledWith(canvas, 'My pins', 1, null)
  })
})
