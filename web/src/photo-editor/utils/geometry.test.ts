import { describe, it, expect } from 'vitest'
import {
  DEFAULT_GEOMETRY,
  GEOMETRY_LIMITS,
  apply,
  cappedSize,
  fitCropToAspect,
  invert,
  isAffine,
  isIdentityGeometry,
  keystoneQuad,
  multiply,
  normalizeGeometry,
  planGeometry,
  renderMatrix,
  squareToQuad,
  straightenScale,
} from './geometry'
import type { PhotoGeometry } from './geometry'

const W = 400
const H = 300
const g = (patch: Partial<PhotoGeometry>): PhotoGeometry => ({ ...DEFAULT_GEOMETRY, ...patch })

function expectPoint(p: { x: number; y: number }, x: number, y: number) {
  expect(p.x).toBeCloseTo(x, 6)
  expect(p.y).toBeCloseTo(y, 6)
}

/** The source point under each output corner. */
function corners(plan: ReturnType<typeof planGeometry>) {
  return [
    apply(plan.toSource, 0, 0),
    apply(plan.toSource, plan.width, 0),
    apply(plan.toSource, plan.width, plan.height),
    apply(plan.toSource, 0, plan.height),
  ]
}

describe('planGeometry (PHOTO-009)', () => {
  it('leaves an untouched image exactly as it was', () => {
    const plan = planGeometry(DEFAULT_GEOMETRY, W, H)
    expect(plan.identity).toBe(true)
    expect([plan.width, plan.height]).toEqual([W, H])
    expectPoint(apply(plan.toSource, 123, 45), 123, 45)
    expect(plan.transparent).toBe(false)
  })

  it('turns 90° clockwise without resampling: the left column becomes the top row', () => {
    const plan = planGeometry(g({ quarterTurns: 1 }), W, H)
    expect([plan.width, plan.height]).toEqual([H, W])
    // Output top-left is the source's bottom-left; output top-right its top-left.
    expectPoint(apply(plan.toSource, 0, 0), 0, H)
    expectPoint(apply(plan.toSource, H, 0), 0, 0)
    expect(isAffine(plan.toSource)).toBe(true)
  })

  it('turns 180° and 270°', () => {
    expectPoint(apply(planGeometry(g({ quarterTurns: 2 }), W, H).toSource, 0, 0), W, H)
    const p270 = planGeometry(g({ quarterTurns: 3 }), W, H)
    expect([p270.width, p270.height]).toEqual([H, W])
    expectPoint(apply(p270.toSource, 0, 0), W, 0)
  })

  it('flips the displayed image, after any quarter turn', () => {
    expectPoint(apply(planGeometry(g({ flipH: true }), W, H).toSource, 0, 0), W, 0)
    expectPoint(apply(planGeometry(g({ flipV: true }), W, H).toSource, 0, 0), 0, H)
    // Turned then mirrored left-right: the display's top-left is the source's
    // own top-left again.
    expectPoint(apply(planGeometry(g({ quarterTurns: 1, flipH: true }), W, H).toSource, 0, 0), 0, 0)
  })

  it('straightens by cropping to the largest same-shaped rectangle inside the turned image', () => {
    const plan = planGeometry(g({ straighten: 10 }), W, H)
    const s = straightenScale(W, H, 10)
    expect(plan.width).toBe(Math.round(W * s))
    expect(plan.height).toBe(Math.round(H * s))
    expect(plan.width / plan.height).toBeCloseTo(W / H, 1)
    // Every corner of the result is real image — nothing uncovered.
    for (const c of corners(plan)) {
      expect(c.x).toBeGreaterThanOrEqual(-1e-6)
      expect(c.x).toBeLessThanOrEqual(W + 1e-6)
      expect(c.y).toBeGreaterThanOrEqual(-1e-6)
      expect(c.y).toBeLessThanOrEqual(H + 1e-6)
    }
    expect(plan.transparent).toBe(false)
    // The inscribed box touches the turned image: at least one corner is on its edge.
    const touches = corners(plan).some((c) => Math.min(c.x, c.y, W - c.x, H - c.y) < 1)
    expect(touches).toBe(true)
  })

  it('rotates freely into a frame that holds the whole turned image, with clear corners', () => {
    const plan = planGeometry(g({ angle: 30 }), W, H)
    const t = Math.PI / 6
    expect(plan.width).toBe(Math.round(W * Math.cos(t) + H * Math.sin(t)))
    expect(plan.height).toBe(Math.round(W * Math.sin(t) + H * Math.cos(t)))
    expect(plan.transparent).toBe(true)
    // The frame's centre is the source's centre.
    expectPoint(apply(plan.toSource, plan.width / 2, plan.height / 2), W / 2, H / 2)
  })

  it('treats a free rotation by a right angle as having no clear corners', () => {
    const plan = planGeometry(g({ angle: 90 }), W, H)
    expect([plan.width, plan.height]).toEqual([H, W])
    expect(plan.transparent).toBe(false)
  })

  it('corrects keystone with a true perspective map that fills the frame', () => {
    const plan = planGeometry(g({ perspectiveV: 60 }), W, H)
    expect([plan.width, plan.height]).toEqual([W, H])
    expect(isAffine(plan.toSource)).toBe(false)
    const quad = keystoneQuad(W, H, 60, 0)
    corners(plan).forEach((c, i) => expectPoint(c, quad[i].x, quad[i].y))
    // Positive vertical pulls the top corners in, stretching the top out.
    expect(quad[0].x).toBeGreaterThan(0)
    expect(quad[3].x).toBe(0)
    expect(plan.transparent).toBe(false)
  })

  it('pulls the opposite edges for negative and horizontal keystone', () => {
    const v = keystoneQuad(W, H, -40, 0)
    expect(v[0].x).toBe(0)
    expect(v[3].x).toBeGreaterThan(0)
    const h = keystoneQuad(W, H, 0, 40)
    expect(h[0].y).toBeGreaterThan(0)
    expect(h[1].y).toBe(0)
  })

  it('crops to a normalized rect of the turned frame', () => {
    const plan = planGeometry(g({ crop: { x: 0.25, y: 0.5, w: 0.5, h: 0.5 } }), W, H)
    expect([plan.width, plan.height]).toEqual([200, 150])
    expectPoint(apply(plan.toSource, 0, 0), 100, 150)
    expect(plan.cropFrame).toEqual({ width: W, height: H })
  })

  it('measures the crop against the frame after rotation', () => {
    const plan = planGeometry(g({ quarterTurns: 1, crop: { x: 0, y: 0, w: 0.5, h: 1 } }), W, H)
    expect([plan.width, plan.height]).toEqual([150, 400])
    expect(plan.cropFrame).toEqual({ width: H, height: W })
  })

  it('resizes by a uniform scale, rounded to whole pixels', () => {
    const plan = planGeometry(g({ resizeScale: 0.5 }), 401, 301)
    expect([plan.width, plan.height]).toEqual([201, 151])
    expect(plan.pixelScale.x).toBeCloseTo(201 / 401)
    // The output's far corner is still the source's far corner.
    expectPoint(apply(plan.toSource, plan.width, plan.height), 401, 301)
  })

  it('keeps anything geometry produces under the output edge limit', () => {
    const plan = planGeometry(g({ resizeScale: 4 }), 4000, 1000)
    expect(plan.width).toBe(GEOMETRY_LIMITS.maxEdge)
    expect(plan.height).toBe(GEOMETRY_LIMITS.maxEdge / 4)
  })

  it('leaves an untouched oversized image at its own size', () => {
    expect(planGeometry(DEFAULT_GEOMETRY, 10000, 5000).width).toBe(10000)
  })

  it('plans the uncropped, unresized frame for the crop tool', () => {
    const geometry = g({ crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, resizeScale: 0.5 })
    const plan = planGeometry(geometry, W, H, { cropEditing: true })
    expect([plan.width, plan.height]).toEqual([W, H])
    expect(plan.identity).toBe(false)
  })

  it('maps a render size back onto the same source', () => {
    const plan = planGeometry(g({ angle: 15, crop: { x: 0.2, y: 0.2, w: 0.6, h: 0.6 } }), W, H)
    const { width, height } = cappedSize(plan, 100)
    expect(Math.max(width, height)).toBe(100)
    const m = renderMatrix(plan, width, height)
    const a = apply(m, width, height)
    const b = apply(plan.toSource, plan.width, plan.height)
    expectPoint(a, b.x, b.y)
  })
})

describe('normalizeGeometry', () => {
  it('clamps every field into range and repairs junk', () => {
    const n = normalizeGeometry({
      quarterTurns: 7 as PhotoGeometry['quarterTurns'],
      flipH: 1 as unknown as boolean,
      flipV: false,
      perspectiveV: 500,
      perspectiveH: Number.NaN,
      straighten: -90,
      angle: 400,
      crop: { x: 0.9, y: -1, w: 0.5, h: 0 },
      resizeScale: 100,
      resample: 'bogus' as PhotoGeometry['resample'],
    })
    expect(n).toMatchObject({
      quarterTurns: 3,
      flipH: true,
      perspectiveV: 100,
      perspectiveH: 0,
      straighten: -45,
      angle: 180,
      resizeScale: 4,
      resample: 'smooth',
    })
    expect(n.crop).toEqual({ x: 0.5, y: 0, w: 0.5, h: GEOMETRY_LIMITS.minCrop })
  })

  it('counts nearest resampling alone as no change', () => {
    expect(isIdentityGeometry(g({ resample: 'nearest' }))).toBe(true)
    expect(isIdentityGeometry(g({ flipV: true }))).toBe(false)
  })
})

describe('matrix helpers', () => {
  it('squareToQuad sends the unit square’s corners to the quad', () => {
    const quad = [
      { x: 10, y: 5 },
      { x: 90, y: 0 },
      { x: 100, y: 80 },
      { x: 0, y: 70 },
    ]
    const m = squareToQuad(quad)
    expectPoint(apply(m, 0, 0), 10, 5)
    expectPoint(apply(m, 1, 0), 90, 0)
    expectPoint(apply(m, 1, 1), 100, 80)
    expectPoint(apply(m, 0, 1), 0, 70)
  })

  it('invert undoes a matrix', () => {
    const m = squareToQuad([
      { x: 1, y: 2 },
      { x: 50, y: 3 },
      { x: 55, y: 40 },
      { x: 0, y: 44 },
    ])
    const id = multiply(m, invert(m))
    expectPoint(apply(id, 7, 9), 7, 9)
  })
})

describe('fitCropToAspect', () => {
  it('reshapes the crop to the pixel aspect, centred where it was', () => {
    const crop = fitCropToAspect({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, 1, W, H)
    expect((crop.w * W) / (crop.h * H)).toBeCloseTo(1)
    expect(crop.x + crop.w / 2).toBeCloseTo(0.5)
    expect(crop.y + crop.h / 2).toBeCloseTo(0.5)
  })

  it('shrinks to fit the frame and slides back inside from an edge', () => {
    const crop = fitCropToAspect({ x: 0.8, y: 0, w: 0.2, h: 1 }, 16 / 9, W, H)
    expect((crop.w * W) / (crop.h * H)).toBeCloseTo(16 / 9)
    expect(crop.x + crop.w).toBeLessThanOrEqual(1 + 1e-9)
    expect(crop.y + crop.h).toBeLessThanOrEqual(1 + 1e-9)
    expect(crop.w).toBeCloseTo(1)
  })
})
