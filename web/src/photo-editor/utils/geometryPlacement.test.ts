import { describe, it, expect } from 'vitest'
import { placeOnCanvas, placementFor } from './geometryPlacement'
import type { SerializedImageGeometry } from './geometryPlacement'
import { DEFAULT_GEOMETRY, planGeometry } from './geometry'
import type { PhotoGeometry } from './geometry'

const g = (patch: Partial<PhotoGeometry>): PhotoGeometry => ({ ...DEFAULT_GEOMETRY, ...patch })

/** The page position of an image object's box centre. */
function centreOf(o: SerializedImageGeometry) {
  const t = ((o.angle ?? 0) * Math.PI) / 180
  const f = (v: unknown) => (v === 'left' || v === 'top' ? -0.5 : v === 'right' || v === 'bottom' ? 0.5 : 0)
  const dx = f(o.originX) * (o.width ?? 0) * (o.scaleX ?? 1)
  const dy = f(o.originY) * (o.height ?? 0) * (o.scaleY ?? 1)
  return { x: (o.left ?? 0) - (dx * Math.cos(t) - dy * Math.sin(t)), y: (o.top ?? 0) - (dx * Math.sin(t) + dy * Math.cos(t)) }
}

const OBJ: SerializedImageGeometry = {
  left: 500,
  top: 400,
  width: 400,
  height: 300,
  scaleX: 0.5,
  scaleY: 0.5,
  angle: 0,
  originX: 'center',
  originY: 'center',
}

describe('placementFor', () => {
  it('is null for an untouched image, so port-back keeps its old path', () => {
    expect(placementFor(planGeometry(DEFAULT_GEOMETRY, 400, 300))).toBeNull()
  })
})

describe('placeOnCanvas (PHOTO-009)', () => {
  it('keeps a crop where that part of the photo was, at the same size on the page', () => {
    // Keep the top-left quarter of a 400×300 photo shown at half size, centred at (500, 400).
    const placement = placementFor(planGeometry(g({ crop: { x: 0, y: 0, w: 0.5, h: 0.5 } }), 400, 300))!
    const next = placeOnCanvas(OBJ, placement)
    expect(next).toMatchObject({ width: 200, height: 150, scaleX: 0.5, scaleY: 0.5, cropX: 0, cropY: 0 })
    // The photo spanned (400..600, 325..475); its top-left quarter is centred at (450, 362.5).
    const c = centreOf({ ...OBJ, ...next })
    expect(c.x).toBeCloseTo(450)
    expect(c.y).toBeCloseTo(362.5)
  })

  it('leaves a resampled image the same size on the page', () => {
    const placement = placementFor(planGeometry(g({ resizeScale: 0.25 }), 400, 300))!
    const next = placeOnCanvas(OBJ, placement)
    expect(next.width).toBe(100)
    expect((next.width ?? 0) * (next.scaleX ?? 0)).toBeCloseTo(400 * 0.5)
    const c = centreOf({ ...OBJ, ...next })
    expect(c.x).toBeCloseTo(500)
    expect(c.y).toBeCloseTo(400)
  })

  it('works from a top-left origin', () => {
    const obj = { ...OBJ, originX: 'left', originY: 'top', left: 400, top: 325 }
    const placement = placementFor(planGeometry(g({ crop: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 } }), 400, 300))!
    const next = placeOnCanvas(obj, placement)
    // The bottom-right quarter's top-left corner was at (500, 400).
    expect(next.left).toBeCloseTo(500)
    expect(next.top).toBeCloseTo(400)
  })

  it('follows the object’s own rotation on the page', () => {
    const obj = { ...OBJ, angle: 90 }
    const placement = placementFor(planGeometry(g({ crop: { x: 0.5, y: 0, w: 0.5, h: 1 } }), 400, 300))!
    const c = centreOf({ ...obj, ...placeOnCanvas(obj, placement) })
    // The right half sits 50px right of centre in the photo; turned 90° on the page that's 50px down.
    expect(c.x).toBeCloseTo(500)
    expect(c.y).toBeCloseTo(450)
  })

  it('measures through a Canvas-side crop window and flips, then drops the window', () => {
    // Canvas showed only the source's right half (cropX 200, width 200), mirrored.
    const obj = { ...OBJ, width: 200, height: 300, cropX: 200, flipX: true, scaleX: 1, scaleY: 1 }
    // The edit keeps the source's left half — which Canvas wasn't showing.
    const placement = placementFor(planGeometry(g({ crop: { x: 0, y: 0, w: 0.5, h: 1 } }), 400, 300))!
    const next = placeOnCanvas(obj, placement)
    expect(next).toMatchObject({ cropX: 0, cropY: 0, width: 200, height: 300 })
    // Source x=100 is 200px left of the shown window's centre (x=300); mirrored, that's 200px right.
    expect(centreOf({ ...obj, ...next }).x).toBeCloseTo(700)
  })
})
