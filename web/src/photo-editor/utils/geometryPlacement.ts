import { apply } from './geometry'
import type { GeometryPlan } from './geometry'

/**
 * How a geometry-edited image relates to the source it came from (PHOTO-009)
 * — everything PHOTO-006's port-back needs to put the new image where the
 * old one's content was on Canvas.
 *
 * Only produced when geometry actually changed something. Without it the
 * flattened image has the source's exact pixel size, and port-back keeps
 * the Canvas object's own geometry untouched, as it always has.
 */
export interface GeometryPlacement {
  /** The new image's pixel size. */
  width: number
  height: number
  /** The source pixel under the new image's centre. */
  sourceCenter: { x: number; y: number }
  /** New image pixels per source pixel, per axis — the resize ratio. Crop,
   *  rotation and keystone keep one pixel per pixel. */
  pixelScale: { x: number; y: number }
}

export function placementFor(plan: GeometryPlan): GeometryPlacement | null {
  if (plan.identity) return null
  return {
    width: plan.width,
    height: plan.height,
    sourceCenter: apply(plan.toSource, plan.width / 2, plan.height / 2),
    pixelScale: plan.pixelScale,
  }
}

/** The fields of a serialized fabric image object this reads and rewrites. */
export interface SerializedImageGeometry {
  left?: number
  top?: number
  width?: number
  height?: number
  scaleX?: number
  scaleY?: number
  angle?: number
  flipX?: boolean
  flipY?: boolean
  cropX?: number
  cropY?: number
  originX?: unknown
  originY?: unknown
  strokeWidth?: number
}

/** Where an origin sits along an axis, from the box centre, in box widths:
 *  'left'/'top' is -0.5, 'center' 0, 'right'/'bottom' 0.5. */
function originOffset(origin: unknown): number {
  if (origin === 'left' || origin === 'top') return -0.5
  if (origin === 'right' || origin === 'bottom') return 0.5
  if (typeof origin === 'number') return origin - 0.5
  return 0
}

/**
 * The Canvas object's new geometry for a flattened, geometry-edited image —
 * a patch over its serialized JSON.
 *
 * The rule is "the content stays where it was, at the same density":
 * - The source pixel under the new image's centre goes back to the same spot
 *   on the page it occupied before, so a crop of the top-left corner stays in
 *   the top-left of where the photo was rather than jumping to its middle.
 * - Scale divides out the resize ratio, so resampling to half the pixels
 *   leaves the image the same size on the page, while a crop shrinks the
 *   object to just the part that was kept.
 * - The object's own angle and flips are kept: the edit's rotation is baked
 *   into the pixels, the Canvas-side turn still applies on top.
 * - Any Canvas-side crop window (UX-009) is dropped — it was measured
 *   against the old image's pixels, and the Photo Editor's crop replaces it.
 */
export function placeOnCanvas(
  obj: SerializedImageGeometry,
  placement: GeometryPlacement,
): SerializedImageGeometry {
  const scaleX = obj.scaleX ?? 1
  const scaleY = obj.scaleY ?? 1
  const stroke = obj.strokeWidth ?? 0
  const boxW = (obj.width ?? 0) + stroke
  const boxH = (obj.height ?? 0) + stroke
  const t = ((obj.angle ?? 0) * Math.PI) / 180
  const cos = Math.cos(t)
  const sin = Math.sin(t)
  const rotate = (x: number, y: number) => ({ x: x * cos - y * sin, y: x * sin + y * cos })
  const fx = originOffset(obj.originX)
  const fy = originOffset(obj.originY)

  // The old box's centre on the page: its origin point, less the origin's
  // offset from centre (turned by the object's angle).
  const originShift = rotate(fx * boxW * scaleX, fy * boxH * scaleY)
  const oldCentre = { x: (obj.left ?? 0) - originShift.x, y: (obj.top ?? 0) - originShift.y }

  // Where the new image's centre pixel sat within the old box, from its
  // centre, in page units — through the old crop window and the flips.
  const local = {
    x: (placement.sourceCenter.x - (obj.cropX ?? 0) - (obj.width ?? 0) / 2) * scaleX * (obj.flipX ? -1 : 1),
    y: (placement.sourceCenter.y - (obj.cropY ?? 0) - (obj.height ?? 0) / 2) * scaleY * (obj.flipY ? -1 : 1),
  }
  const offset = rotate(local.x, local.y)
  const newCentre = { x: oldCentre.x + offset.x, y: oldCentre.y + offset.y }

  const nextScaleX = scaleX / placement.pixelScale.x
  const nextScaleY = scaleY / placement.pixelScale.y
  const nextShift = rotate(fx * (placement.width + stroke) * nextScaleX, fy * (placement.height + stroke) * nextScaleY)
  return {
    left: newCentre.x + nextShift.x,
    top: newCentre.y + nextShift.y,
    width: placement.width,
    height: placement.height,
    cropX: 0,
    cropY: 0,
    scaleX: nextScaleX,
    scaleY: nextScaleY,
  }
}
