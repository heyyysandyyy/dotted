import * as fabric from 'fabric'
import type { ShadowEffect } from './utils'

/** This lives outside components/ so EffectsPanel/CanvasStage don't need to
 *  import the fabric value for this logic directly (the architecture lint
 *  rule already covers CanvasStage's own direct fabric usage as the canvas
 *  owner; this keeps the effect-clone mechanics in one place either way).
 *
 * Known limitation: grouping a host that has spread active removes its clone
 * (CanvasStage cleans up on `object:removed`, which fires when the host
 * leaves canvas root to enter the new group) and it isn't regenerated
 * automatically on group/ungroup — the halo disappears until the next edit
 * to that effect. `shadowSpread`/`shadow` stay intact on the host itself, so
 * nothing is lost, and the effects panel keeps showing the correct value. */

type WithHostTag = fabric.FabricObject & { effectHostId?: string }
type WithId = fabric.FabricObject & { id?: string }

function tagOf(obj: fabric.FabricObject): WithHostTag {
  return obj as WithHostTag
}

/** True for a synthetic spread-halo clone — excluded from the layers panel
 *  and from selection/grouping (it's already selectable:false/evented:false,
 *  but callers that enumerate canvas.getObjects() need this too). */
export function isEffectClone(obj: fabric.FabricObject): boolean {
  return typeof tagOf(obj).effectHostId === 'string'
}

/** Remove any existing spread-halo clone(s) for this host id. */
export function removeSpreadClone(canvas: fabric.Canvas, hostId: string): void {
  const clones = canvas.getObjects().filter((o) => tagOf(o).effectHostId === hostId)
  if (clones.length > 0) canvas.remove(...clones)
}

/**
 * Build (or rebuild) the spread-halo clone for a shadow/glow effect with
 * spread > 0 (UX-020). A shadow/glow with no spread stays exactly as before —
 * the host's own native `shadow` property, no clone involved.
 *
 * Spread needs a second object: canvas 2D can't cast a shadow from a fully
 * transparent fill, so there's no way to draw "just a bigger shadow" on the
 * host itself. Instead this clones the host, fills the clone solid in the
 * effect's own colour (opaque, so it *can* cast a shadow), scales it up by
 * the spread amount, gives it its own native shadow matching blur/offset/
 * colour, and places it directly behind the host — the host's real
 * rendering covers the clone's body, so only the enlarged shadow halo peeks
 * out. Same trick browsers use for CSS box-shadow spread.
 *
 * Known limitation: for a host with internal transparency (gaps between/
 * inside text glyphs, a PNG's alpha holes), the solid clone can show through
 * those gaps instead of true transparency. Fine for solid vector shapes —
 * left as a follow-up rather than blocking spread support on it.
 */
export async function syncSpreadClone(
  canvas: fabric.Canvas,
  host: WithId,
  effect: ShadowEffect,
): Promise<void> {
  if (!host.id) return
  removeSpreadClone(canvas, host.id)
  if (effect.spread <= 0) {
    canvas.requestRenderAll()
    return
  }
  const clone = await host.clone()
  const w = clone.width || 1
  const h = clone.height || 1
  const factorX = (w + effect.spread * 2) / w
  const factorY = (h + effect.spread * 2) / h
  clone.set({
    fill: effect.color,
    stroke: undefined,
    strokeWidth: 0,
    opacity: 1,
    selectable: false,
    evented: false,
    hasControls: false,
    left: host.left,
    top: host.top,
    originX: host.originX,
    originY: host.originY,
    angle: host.angle,
    scaleX: (host.scaleX ?? 1) * factorX,
    scaleY: (host.scaleY ?? 1) * factorY,
    shadow: new fabric.Shadow({ color: effect.color, blur: effect.blur, offsetX: effect.x, offsetY: effect.y }),
  })
  const tagged = tagOf(clone)
  tagged.effectHostId = host.id
  ;(clone as unknown as { name?: string }).name = 'Shadow spread'
  clone.setCoords()
  // Remove again, right before inserting: a rapid slider drag fires this
  // repeatedly, and clone() is async, so a second call can start (and finish
  // its own remove, which finds nothing yet) before this one's clone lands.
  // Cleaning up immediately pre-insert — whichever call finishes last always
  // wins — guarantees exactly one clone survives regardless of resolution
  // order, instead of two calls' clones both landing.
  removeSpreadClone(canvas, host.id)
  const hostIndex = canvas.getObjects().indexOf(host)
  canvas.insertAt(Math.max(0, hostIndex), clone)
  canvas.requestRenderAll()
}

/**
 * Cheap position/rotation sync during a live drag or rotate — no rebuild, so
 * it's safe to call on every `object:moving`/`object:rotating` frame. Scale
 * changes (an active resize drag) are intentionally not tracked live here;
 * they're corrected by the full rebuild on `object:modified` (drag end), a
 * small transient rough edge during the drag itself rather than an async
 * clone rebuild on every resize frame.
 */
export function repositionSpreadClone(canvas: fabric.Canvas, host: WithId): void {
  if (!host.id) return
  const clone = canvas.getObjects().find((o) => tagOf(o).effectHostId === host.id)
  if (!clone) return
  clone.set({
    left: host.left,
    top: host.top,
    originX: host.originX,
    originY: host.originY,
    angle: host.angle,
    flipX: host.flipX,
    flipY: host.flipY,
  })
  clone.setCoords()
}
