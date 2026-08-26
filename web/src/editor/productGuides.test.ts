import { describe, it, expect, vi } from 'vitest'
import { drawProductGuides } from './productGuides'
import { findProductTemplate, productCanvasSize, productGuideSpec } from './products'

function mockCtx() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    clip: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
  } as unknown as CanvasRenderingContext2D
}

const PIN = findProductTemplate('pin-2-25')!
const SPEC = productGuideSpec(PIN)
const SIZE = productCanvasSize(PIN)

describe('drawProductGuides (PROD-001)', () => {
  it('tints the whole artboard and clears the trim circle out of it', () => {
    const ctx = mockCtx()
    drawProductGuides(ctx, { x: 0, y: 0, width: SIZE.width, height: SIZE.height }, SPEC, 1)

    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, SIZE.width, SIZE.height)
    expect(ctx.clip).toHaveBeenCalled()
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, SIZE.width, SIZE.height)
    // The clip is scoped, or every later stroke would be confined to the circle.
    expect(ctx.save).toHaveBeenCalled()
    expect(ctx.restore).toHaveBeenCalled()
  })

  it('draws the trim and safe-zone circles concentric on the artboard centre', () => {
    const ctx = mockCtx()
    drawProductGuides(ctx, { x: 0, y: 0, width: SIZE.width, height: SIZE.height }, SPEC, 1)

    const centre = SIZE.width / 2
    const radii = vi.mocked(ctx.arc).mock.calls.map((call) => [call[0], call[1], call[2]])
    // The clip circle, the trim circle, then the safe-zone circle.
    expect(radii).toEqual([
      [centre, centre, SPEC.diameterPx / 2],
      [centre, centre, SPEC.diameterPx / 2],
      [centre, centre, SPEC.diameterPx / 2 - SPEC.safeZonePx],
    ])
    expect(ctx.stroke).toHaveBeenCalledTimes(2)
  })

  it('scales every radius, and offsets from the box, for a zoomed or preview-sized draw', () => {
    const ctx = mockCtx()
    const scale = 0.2
    drawProductGuides(
      ctx,
      { x: 40, y: 10, width: SIZE.width * scale, height: SIZE.height * scale },
      SPEC,
      scale,
    )

    const [cx, cy, trimRadius] = vi.mocked(ctx.arc).mock.calls[1]
    expect(cx).toBe(40 + (SIZE.width * scale) / 2)
    expect(cy).toBe(10 + (SIZE.height * scale) / 2)
    expect(trimRadius).toBe((SPEC.diameterPx / 2) * scale)
  })

  it('draws nothing at a scale where the trim circle has no radius left', () => {
    const ctx = mockCtx()
    drawProductGuides(ctx, { x: 0, y: 0, width: 0, height: 0 }, SPEC, 0)

    expect(ctx.fillRect).not.toHaveBeenCalled()
    expect(ctx.arc).not.toHaveBeenCalled()
  })

  it('skips the safe-zone circle when the safe zone would swallow the whole face', () => {
    const ctx = mockCtx()
    drawProductGuides(
      ctx,
      { x: 0, y: 0, width: SIZE.width, height: SIZE.height },
      { ...SPEC, safeZonePx: SPEC.diameterPx },
      1,
    )

    expect(ctx.stroke).toHaveBeenCalledTimes(1)
  })

  it('leaves no dash pattern set behind it for the next drawing pass', () => {
    const ctx = mockCtx()
    drawProductGuides(ctx, { x: 0, y: 0, width: SIZE.width, height: SIZE.height }, SPEC, 1)

    const lastDash = vi.mocked(ctx.setLineDash).mock.calls.at(-1)
    expect(lastDash).toEqual([[]])
  })
})
