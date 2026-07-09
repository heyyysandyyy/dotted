import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as fabric from 'fabric'
import { PropertiesPanel } from './PropertiesPanel'
import { useCanvasStore } from '../store/useCanvasStore'

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
