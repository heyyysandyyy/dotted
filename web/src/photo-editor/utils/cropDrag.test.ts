import { describe, it, expect } from 'vitest'
import { dragCrop } from './cropDrag'

const START = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 }
const MIN = { w: 0.05, h: 0.05 }

describe('dragCrop (PHOTO-009)', () => {
  it('moves the box and keeps it inside the frame', () => {
    const moved = dragCrop(START, 'move', 0.1, -0.1, null, MIN)
    expect(moved.x).toBeCloseTo(0.3)
    expect(moved.y).toBeCloseTo(0.1)
    expect([moved.w, moved.h]).toEqual([0.4, 0.4])
    const pinned = dragCrop(START, 'move', 5, 5, null, MIN)
    expect(pinned.x).toBeCloseTo(0.6)
    expect(pinned.y).toBeCloseTo(0.6)
  })

  it('resizes from an edge, never past the frame or below the minimum', () => {
    const wider = dragCrop(START, 'e', 0.1, 0, null, MIN)
    expect(wider.w).toBeCloseTo(0.5)
    expect(wider.x).toBeCloseTo(0.2)
    expect(dragCrop(START, 'w', -1, 0, null, MIN).x).toBe(0)
    expect(dragCrop(START, 'n', 1, 1, null, MIN).h).toBeCloseTo(MIN.h)
  })

  it('resizes a free corner on both axes independently', () => {
    const r = dragCrop(START, 'se', 0.1, 0.2, null, MIN)
    expect(r.w).toBeCloseTo(0.5)
    expect(r.h).toBeCloseTo(0.6)
  })

  it('keeps a locked ratio from a corner, anchored on the opposite corner', () => {
    const r = dragCrop(START, 'se', 0.3, 0.05, 2, MIN)
    expect(r.w / r.h).toBeCloseTo(2)
    expect(r.x).toBeCloseTo(0.2)
    expect(r.y).toBeCloseTo(0.2)
    const nw = dragCrop(START, 'nw', -0.1, -0.1, 1, MIN)
    expect(nw.w / nw.h).toBeCloseTo(1)
    expect(nw.x + nw.w).toBeCloseTo(0.6)
    expect(nw.y + nw.h).toBeCloseTo(0.6)
  })

  it('stops a locked-ratio corner at the frame edge without breaking the ratio', () => {
    const r = dragCrop(START, 'se', 2, 2, 0.5, MIN)
    expect(r.w / r.h).toBeCloseTo(0.5)
    expect(r.y + r.h).toBeCloseTo(1)
    expect(r.x + r.w).toBeLessThanOrEqual(1)
  })
})
