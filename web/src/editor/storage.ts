import type * as fabric from 'fabric'

/** localStorage key for the single in-progress design (auto-save). */
export const CURRENT_DESIGN_KEY = 'dotted:currentDesign'

/** Fabric props persisted beyond the defaults (custom ids/names, lock flags). */
export const EXTRA_PROPS = ['selectable', 'name', 'id', 'lockUniScaling']

export interface SerializedDesign {
  width: number
  height: number
  canvas: object
}

export function serializeDesign(
  canvas: fabric.Canvas,
  width: number,
  height: number,
): SerializedDesign {
  // fabric 7: toJSON() no longer takes propertiesToInclude; toObject() does.
  return { width, height, canvas: canvas.toObject(EXTRA_PROPS) }
}

export function saveCurrentDesign(
  canvas: fabric.Canvas,
  width: number,
  height: number,
): boolean {
  try {
    const data = serializeDesign(canvas, width, height)
    localStorage.setItem(CURRENT_DESIGN_KEY, JSON.stringify(data))
    return true
  } catch {
    // Quota exceeded or storage unavailable — fail soft.
    return false
  }
}

export function loadCurrentDesign(): SerializedDesign | null {
  try {
    const raw = localStorage.getItem(CURRENT_DESIGN_KEY)
    if (!raw) return null
    return JSON.parse(raw) as SerializedDesign
  } catch {
    return null
  }
}
