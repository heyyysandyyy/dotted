import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as fabric from 'fabric'
import { ContextMenu } from './ContextMenu'
import { useCanvasStore } from '../store/useCanvasStore'
import { usePhotoEditorStore } from '../../photo-editor/store/usePhotoEditorStore'

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

function rightClickCanvas() {
  const container = document.createElement('div')
  container.className = 'canvas-container'
  document.body.appendChild(container)
  fireEvent.contextMenu(container, { clientX: 10, clientY: 10 })
}

describe('ContextMenu — Edit in Photo Editor (PHOTO-003)', () => {
  let canvas: fabric.Canvas

  beforeEach(() => {
    navigateMock.mockClear()
    canvas = new fabric.Canvas(document.createElement('canvas'), { width: 400, height: 400 })
    usePhotoEditorStore.setState({ image: null, sourceRef: null })
  })

  it('shows the action for a single selected image and wires it through to the photo editor store + navigation', () => {
    const img = new fabric.FabricImage(document.createElement('img'), {
      left: 30,
      top: 40,
      scaleX: 2,
      scaleY: 2,
      angle: 15,
    }) as fabric.FabricImage & { id?: string }
    img.id = 'img-1'
    canvas.add(img)
    canvas.setActiveObject(img)
    useCanvasStore.setState({ canvas, selection: [img], activePageId: 'page-9' })

    render(<ContextMenu />)
    rightClickCanvas()

    fireEvent.click(screen.getByText('Edit in Photo Editor'))

    expect(usePhotoEditorStore.getState().sourceRef).toMatchObject({
      pageId: 'page-9',
      objectId: 'img-1',
      left: 30,
      top: 40,
      scaleX: 2,
      scaleY: 2,
      angle: 15,
    })
    expect(navigateMock).toHaveBeenCalledWith({ to: '/photo-editor' })
  })

  it('does not show the action when the selected object is not an image', () => {
    const rect = new fabric.Rect({ left: 0, top: 0, width: 50, height: 50 })
    canvas.add(rect)
    canvas.setActiveObject(rect)
    useCanvasStore.setState({ canvas, selection: [rect] })

    render(<ContextMenu />)
    rightClickCanvas()

    expect(screen.queryByText('Edit in Photo Editor')).not.toBeInTheDocument()
  })

  it('does not show the action for a multi-object selection, even if it includes an image', () => {
    const img = new fabric.FabricImage(document.createElement('img'), { left: 0, top: 0 })
    const rect = new fabric.Rect({ left: 0, top: 0, width: 50, height: 50 })
    canvas.add(img)
    canvas.add(rect)
    useCanvasStore.setState({ canvas, selection: [img, rect] })

    render(<ContextMenu />)
    rightClickCanvas()

    expect(screen.queryByText('Edit in Photo Editor')).not.toBeInTheDocument()
  })
})
