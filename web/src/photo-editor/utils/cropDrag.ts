import { clampCrop } from './geometry'
import type { NormRect } from './geometry'

/** Which part of the crop box a drag took hold of: the box itself, an edge,
 *  or a corner (compass points). */
export type CropHandle = 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'

export const CORNER_HANDLES: CropHandle[] = ['nw', 'ne', 'sw', 'se']
export const EDGE_HANDLES: CropHandle[] = ['n', 's', 'e', 'w']

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

/**
 * The crop after dragging `handle` by (dx, dy) — all in normalized frame
 * units — from where it was when the drag began (PHOTO-009's crop tool).
 *
 * `ratio` locks the box's proportions, as normalized width ÷ height; only
 * the corners resize then (an edge alone can't keep a ratio), anchored on the
 * opposite corner and never leaving the frame. `min` is the smallest box
 * size allowed along each axis.
 */
export function dragCrop(
  start: NormRect,
  handle: CropHandle,
  dx: number,
  dy: number,
  ratio: number | null,
  min: { w: number; h: number },
): NormRect {
  if (handle === 'move') {
    return {
      ...start,
      x: clamp(start.x + dx, 0, 1 - start.w),
      y: clamp(start.y + dy, 0, 1 - start.h),
    }
  }

  const east = handle.includes('e')
  const west = handle.includes('w')
  const south = handle.includes('s')
  const north = handle.includes('n')

  if (ratio !== null && (east || west) && (north || south)) {
    const sx = east ? 1 : -1
    const sy = south ? 1 : -1
    // The corner that stays put, and the one under the pointer.
    const ax = east ? start.x : start.x + start.w
    const ay = south ? start.y : start.y + start.h
    const px = (east ? start.x + start.w : start.x) + dx
    const py = (south ? start.y + start.h : start.y) + dy
    const maxW = Math.min(east ? 1 - ax : ax, (south ? 1 - ay : ay) * ratio)
    const minW = Math.max(min.w, min.h * ratio)
    // Follow whichever axis the pointer has moved further along.
    const w = clamp(Math.max((px - ax) * sx, (py - ay) * sy * ratio), Math.min(minW, maxW), maxW)
    const h = w / ratio
    return { x: sx > 0 ? ax : ax - w, y: sy > 0 ? ay : ay - h, w, h }
  }

  let left = start.x
  let right = start.x + start.w
  let top = start.y
  let bottom = start.y + start.h
  if (west) left = clamp(left + dx, 0, right - min.w)
  if (east) right = clamp(right + dx, left + min.w, 1)
  if (north) top = clamp(top + dy, 0, bottom - min.h)
  if (south) bottom = clamp(bottom + dy, top + min.h, 1)
  return clampCrop({ x: left, y: top, w: right - left, h: bottom - top })
}
