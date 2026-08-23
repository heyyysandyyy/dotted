import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import * as fabric from 'fabric'
import { PropertiesPanel } from './PropertiesPanel'
import { useCanvasStore } from '../store/useCanvasStore'
import { usePhotoEditorStore } from '../../photo-editor/store/usePhotoEditorStore'

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

/** Finds the Opacity slider by walking up from its label text to the <label>
 *  wrapper, then down to the range input inside it — mirrors the structural
 *  pattern the "Line height" control already uses in PropertiesPanel.tsx. */
function opacitySlider(): HTMLInputElement {
  const labelText = screen.getByText('Opacity')
  const wrapper = labelText.closest('label')
  if (!wrapper) throw new Error('Opacity control not wrapped in a <label>')
  const input = wrapper.querySelector('input[type="range"]')
  if (!input) throw new Error('No range input inside the Opacity label')
  return input as HTMLInputElement
}

describe('PropertiesPanel — opacity slider (UX-025)', () => {
  let canvas: fabric.Canvas

  beforeEach(() => {
    canvas = new fabric.Canvas(document.createElement('canvas'), { width: 400, height: 400 })
    // PropertiesPanel reads live fabric object properties (e.g. obj.opacity)
    // straight off the mutable object rather than mirroring them into React
    // state, and only re-renders because it subscribes to the store's `tick`
    // counter. In production CanvasStage bumps that counter on every
    // `object:modified` (see components/CanvasStage.tsx); CanvasStage isn't
    // mounted here, so this replicates that one piece of its wiring.
    canvas.on('object:modified', () => useCanvasStore.getState().bump())
  })

  it('shows 100% for a freshly added shape and drags it down, setting the object\'s opacity directly (not fill alpha)', () => {
    const rect = new fabric.Rect({ left: 0, top: 0, width: 50, height: 50, fill: '#3366ff' })
    canvas.add(rect)
    canvas.setActiveObject(rect)
    useCanvasStore.setState({ canvas, selection: [rect] })

    render(<PropertiesPanel />)
    const slider = opacitySlider()
    expect(slider.value).toBe('100')

    fireEvent.change(slider, { target: { value: '40' } })

    expect(rect.opacity).toBeCloseTo(0.4, 5)
    // The fill colour itself is untouched — this is the object's own opacity
    // channel, not the fill-alpha trick UX-012 already provides.
    expect(rect.fill).toBe('#3366ff')
    expect(screen.getByText('40%')).toBeInTheDocument()
  })

  it('also works on a text object, since text has no fill-alpha escape hatch of its own', () => {
    const text = new fabric.Textbox('Hello', { left: 0, top: 0, width: 100, fill: '#000000' })
    canvas.add(text)
    canvas.setActiveObject(text)
    useCanvasStore.setState({ canvas, selection: [text] })

    render(<PropertiesPanel />)
    const slider = opacitySlider()

    fireEvent.change(slider, { target: { value: '65' } })

    expect(text.opacity).toBeCloseTo(0.65, 5)
    expect(screen.getByText('65%')).toBeInTheDocument()
  })

  it('reflects an already-translucent object\'s opacity on mount, not just after a drag', () => {
    const rect = new fabric.Rect({ left: 0, top: 0, width: 50, height: 50, fill: '#000', opacity: 0.25 })
    canvas.add(rect)
    canvas.setActiveObject(rect)
    useCanvasStore.setState({ canvas, selection: [rect] })

    render(<PropertiesPanel />)

    expect(opacitySlider().value).toBe('25')
    expect(screen.getByText('25%')).toBeInTheDocument()
  })
})

describe('PropertiesPanel — stroke style/alignment (UX-028)', () => {
  let canvas: fabric.Canvas

  beforeEach(() => {
    canvas = new fabric.Canvas(document.createElement('canvas'), { width: 400, height: 400 })
    canvas.on('object:modified', () => useCanvasStore.getState().bump())
  })

  it('only shows stroke controls for a shape, not for text', () => {
    const text = new fabric.Textbox('Hi', { left: 0, top: 0, width: 100 })
    canvas.add(text)
    canvas.setActiveObject(text)
    useCanvasStore.setState({ canvas, selection: [text] })

    render(<PropertiesPanel />)

    expect(screen.queryByTitle('Dashed')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Inside stroke')).not.toBeInTheDocument()
  })

  it('shows stroke controls for a shape', () => {
    const rect = new fabric.Rect({ left: 0, top: 0, width: 50, height: 50, stroke: '#111', strokeWidth: 4 })
    canvas.add(rect)
    canvas.setActiveObject(rect)
    useCanvasStore.setState({ canvas, selection: [rect] })

    render(<PropertiesPanel />)

    expect(screen.getByTitle('Dashed')).toBeInTheDocument()
    expect(screen.getByTitle('Center stroke')).toBeInTheDocument()
  })

  it('applying dashed derives a dash array proportional to the current stroke width', () => {
    const rect = new fabric.Rect({ left: 0, top: 0, width: 50, height: 50, stroke: '#111', strokeWidth: 6 })
    canvas.add(rect)
    canvas.setActiveObject(rect)
    useCanvasStore.setState({ canvas, selection: [rect] })

    render(<PropertiesPanel />)
    fireEvent.click(screen.getByTitle('Dashed'))

    expect(rect.strokeDashArray).toEqual([18, 12])
    expect(rect.strokeLineCap).toBe('butt')
  })

  it('applying spaced derives a wider-gapped dash array proportional to the current stroke width', () => {
    const rect = new fabric.Rect({ left: 0, top: 0, width: 50, height: 50, stroke: '#111', strokeWidth: 6 })
    canvas.add(rect)
    canvas.setActiveObject(rect)
    useCanvasStore.setState({ canvas, selection: [rect] })

    render(<PropertiesPanel />)
    fireEvent.click(screen.getByTitle('Spaced'))

    expect(rect.strokeDashArray).toEqual([18, 30])
    expect(rect.strokeLineCap).toBe('butt')
  })

  it('applying dotted uses a round cap and a zero-length leading dash', () => {
    const rect = new fabric.Rect({ left: 0, top: 0, width: 50, height: 50, stroke: '#111', strokeWidth: 6 })
    canvas.add(rect)
    canvas.setActiveObject(rect)
    useCanvasStore.setState({ canvas, selection: [rect] })

    render(<PropertiesPanel />)
    fireEvent.click(screen.getByTitle('Dotted'))

    expect(rect.strokeDashArray).toEqual([0, 12])
    expect(rect.strokeLineCap).toBe('round')
  })

  it('switching to inside alignment clips to the shape\'s own silhouette and doubles the internal stroke width; center clears both', async () => {
    const rect = new fabric.Rect({ left: 0, top: 0, width: 50, height: 50, stroke: '#111', strokeWidth: 6 })
    canvas.add(rect)
    canvas.setActiveObject(rect)
    useCanvasStore.setState({ canvas, selection: [rect] })

    render(<PropertiesPanel />)
    fireEvent.click(screen.getByTitle('Inside stroke'))
    await waitFor(() => expect(rect.clipPath).toBeDefined())
    // Doubled internally so the clipped inner half is the full 6px the user
    // set — but the "SW" field still reads back the un-doubled value.
    expect(rect.strokeWidth).toBe(12)
    expect(screen.getByDisplayValue('6')).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('Center stroke'))
    await waitFor(() => expect(rect.clipPath).toBeUndefined())
    expect(rect.strokeWidth).toBe(6)
  })

  it('setting stroke width to 0 removes the stroke entirely', () => {
    const rect = new fabric.Rect({ left: 0, top: 0, width: 50, height: 50, stroke: '#111', strokeWidth: 6 })
    canvas.add(rect)
    canvas.setActiveObject(rect)
    useCanvasStore.setState({ canvas, selection: [rect] })

    render(<PropertiesPanel />)
    const swInput = screen.getByDisplayValue('6') as HTMLInputElement
    fireEvent.change(swInput, { target: { value: '0' } })

    expect(rect.strokeWidth).toBe(0)
  })

  it('every stroke control change fires object:modified so it lands in undo/redo history', async () => {
    const rect = new fabric.Rect({ left: 0, top: 0, width: 50, height: 50, stroke: '#111', strokeWidth: 6 })
    canvas.add(rect)
    canvas.setActiveObject(rect)
    useCanvasStore.setState({ canvas, selection: [rect] })
    const onModified = vi.fn()
    canvas.on('object:modified', onModified)

    render(<PropertiesPanel />)
    fireEvent.click(screen.getByTitle('Dashed'))
    fireEvent.click(screen.getByTitle('Inside stroke'))

    await waitFor(() => expect(onModified).toHaveBeenCalledTimes(2))
    for (const call of onModified.mock.calls) {
      expect((call[0] as { historyLabel?: string }).historyLabel).toBe('Changed stroke')
    }
  })
})

describe('PropertiesPanel — Edit in Photo Editor (PHOTO-003)', () => {
  let canvas: fabric.Canvas

  beforeEach(() => {
    navigateMock.mockClear()
    canvas = new fabric.Canvas(document.createElement('canvas'), { width: 400, height: 400 })
    usePhotoEditorStore.setState({ image: null, sourceRef: null })
  })

  it('shows the action for a selected image and wires it through to the photo editor store + navigation', () => {
    const img = new fabric.FabricImage(document.createElement('img'), {
      left: 5,
      top: 6,
    }) as fabric.FabricImage & { id?: string }
    img.id = 'img-42'
    canvas.add(img)
    canvas.setActiveObject(img)
    useCanvasStore.setState({ canvas, selection: [img], activePageId: 'page-7' })

    render(<PropertiesPanel />)
    fireEvent.click(screen.getByText('Edit in Photo Editor'))

    expect(usePhotoEditorStore.getState().sourceRef).toMatchObject({ pageId: 'page-7', objectId: 'img-42' })
    expect(navigateMock).toHaveBeenCalledWith({ to: '/photo-editor' })
  })

  it('does not show for a non-image selection', () => {
    const rect = new fabric.Rect({ left: 0, top: 0, width: 50, height: 50 })
    canvas.add(rect)
    canvas.setActiveObject(rect)
    useCanvasStore.setState({ canvas, selection: [rect] })

    render(<PropertiesPanel />)

    expect(screen.queryByText('Edit in Photo Editor')).not.toBeInTheDocument()
  })
})
