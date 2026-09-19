import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createRef } from 'react'
import { PhotoStage } from './PhotoStage'
import { DEFAULT_GEOMETRY, planGeometry } from '../utils/geometry'

// jsdom has no PointerEvent; without one, fireEvent's pointer events drop
// their clientX/clientY and every drag reads as zero distance.
beforeAll(() => {
  if (typeof window.PointerEvent === 'undefined') {
    class PointerEventPolyfill extends MouseEvent {
      pointerId: number
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init)
        this.pointerId = init.pointerId ?? 1
      }
    }
    window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent
  }
})

// A 400×300 frame, shown at native size (jsdom lays nothing out, so the
// stage falls back to no scaling).
const PLAN = planGeometry(DEFAULT_GEOMETRY, 400, 300, { cropEditing: true })
const CROP = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }

function stage(props: Partial<Parameters<typeof PhotoStage>[0]> = {}) {
  const onCropChange = vi.fn()
  render(
    <PhotoStage
      canvasRef={createRef<HTMLCanvasElement>()}
      plan={PLAN}
      cropMode
      crop={CROP}
      cropAspect={null}
      onCropChange={onCropChange}
      {...props}
    />,
  )
  return onCropChange
}

function drag(el: Element, dx: number, dy: number) {
  fireEvent.pointerDown(el, { clientX: 100, clientY: 100, pointerId: 1 })
  fireEvent.pointerMove(screen.getByTestId('crop-overlay'), { clientX: 100 + dx, clientY: 100 + dy, pointerId: 1 })
  fireEvent.pointerUp(screen.getByTestId('crop-overlay'), { pointerId: 1 })
}

describe('PhotoStage crop overlay (PHOTO-009)', () => {
  it('only shows the crop box while the crop tool is open', () => {
    stage({ cropMode: false })
    expect(screen.queryByTestId('crop-overlay')).toBeNull()
  })

  it('draws the box over the part of the preview being kept', () => {
    stage()
    const box = screen.getByTestId('crop-box')
    expect(box.style.left).toBe('100px')
    expect(box.style.top).toBe('75px')
    expect(box.style.width).toBe('200px')
    expect(box.style.height).toBe('150px')
  })

  it('moves the box by dragging inside it', () => {
    const onCropChange = stage()
    drag(screen.getByTestId('crop-box'), 40, -30)
    const next = onCropChange.mock.calls.at(-1)![0]
    expect(next.x).toBeCloseTo(0.35)
    expect(next.y).toBeCloseTo(0.15)
    expect([next.w, next.h]).toEqual([0.5, 0.5])
  })

  it('resizes from a corner handle', () => {
    const onCropChange = stage()
    drag(screen.getByTestId('crop-handle-se'), 40, 30)
    const next = onCropChange.mock.calls.at(-1)![0]
    expect(next.w).toBeCloseTo(0.6)
    expect(next.h).toBeCloseTo(0.6)
  })

  it('offers only corner handles with a ratio locked, and keeps that ratio', () => {
    const onCropChange = stage({ cropAspect: 1 })
    expect(screen.queryByTestId('crop-handle-e')).toBeNull()
    drag(screen.getByTestId('crop-handle-se'), 60, 0)
    const next = onCropChange.mock.calls.at(-1)![0]
    expect((next.w * 400) / (next.h * 300)).toBeCloseTo(1)
  })
})
