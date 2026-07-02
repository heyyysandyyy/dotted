import { describe, it, expect, vi } from 'vitest'
import { drawPageGuides, DEFAULT_GUIDE_STYLE } from './pageGuides'

function mockCtx() {
  return {
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    strokeRect: vi.fn(),
    setLineDash: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
  } as unknown as CanvasRenderingContext2D
}

describe('drawPageGuides', () => {
  it('tints the bleed margin, punches a clear hole for the trim, and draws the dashed trim line', () => {
    const ctx = mockCtx()
    drawPageGuides(ctx, { x: 0, y: 0, width: 100, height: 80 }, 10, false)
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 100, 80)
    expect(ctx.clearRect).toHaveBeenCalledWith(10, 10, 80, 60)
    expect(ctx.strokeRect).toHaveBeenCalledTimes(1)
  })

  it('draws 4 corner cut marks (one stroke per corner) for a non-spread page', () => {
    const ctx = mockCtx()
    drawPageGuides(ctx, { x: 0, y: 0, width: 100, height: 80 }, 10, false)
    // 4 corners, no spine.
    expect(ctx.stroke).toHaveBeenCalledTimes(4)
  })

  it('adds the spine line + spine cut marks (2 more strokes) for a spread', () => {
    const ctx = mockCtx()
    drawPageGuides(ctx, { x: 0, y: 0, width: 100, height: 80 }, 10, true)
    expect(ctx.stroke).toHaveBeenCalledTimes(6)
  })

  it('does nothing when the bleed leaves no room for a trim area', () => {
    const ctx = mockCtx()
    drawPageGuides(ctx, { x: 0, y: 0, width: 10, height: 10 }, 10, false)
    expect(ctx.fillRect).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('offsets by the box origin, not just its size', () => {
    const ctx = mockCtx()
    drawPageGuides(ctx, { x: 5, y: 7, width: 100, height: 80 }, 10, false)
    expect(ctx.fillRect).toHaveBeenCalledWith(5, 7, 100, 80)
    expect(ctx.clearRect).toHaveBeenCalledWith(15, 17, 80, 60)
  })

  it('uses the provided style instead of the default when given', () => {
    const ctx = mockCtx()
    const style = { ...DEFAULT_GUIDE_STYLE, markLen: 3, markGap: 1, dash: [2, 1.5] as [number, number] }
    drawPageGuides(ctx, { x: 0, y: 0, width: 100, height: 80 }, 10, false, style)
    expect(ctx.setLineDash).toHaveBeenCalledWith([2, 1.5])
  })
})
