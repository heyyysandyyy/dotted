import * as fabric from 'fabric'
import { shadowOptions, type ShadowEffect } from './utils'

/** This lives outside components/ so EffectsPanel/CanvasStage don't need to
 *  import the fabric value for this logic directly (the architecture lint
 *  rule already covers CanvasStage's own direct fabric usage as the canvas
 *  owner; this keeps the effect-clone mechanics in one place either way).
 *
 * Fabric objects have exactly one native `shadow` slot, so multiple
 * simultaneous effects (UX-020 phase 2) can't all live on the host directly:
 * the first effect uses the host's own native shadow (cheap, and already
 * correct for the common single-effect case); every additional effect gets
 * its own synthetic clone — a solid duplicate of the host in the effect's own
 * colour (opaque, since canvas 2D can't cast a shadow from a transparent
 * fill), with its own native shadow, positioned directly behind the host so
 * the host's real rendering covers the clone's body and only its shadow
 * peeks out. A clone also handles that effect's own spread (scaling the
 * clone up), so "needs a clone for spread" (phase 1) and "needs a clone
 * because it's a second effect" (phase 2) are the same mechanism.
 *
 * Known limitations:
 * - A host with internal transparency (gaps between/inside text glyphs, a
 *   PNG's alpha holes) can show a clone through those gaps instead of true
 *   transparency. Fine for solid vector shapes.
 * - Grouping a host with any clone-backed effect removes its clone(s)
 *   (CanvasStage cleans up on `object:removed`, which fires when the host
 *   leaves canvas root to enter the new group) and they aren't regenerated
 *   automatically on group/ungroup — those halos disappear until the next
 *   edit to that effect. The effect data itself stays intact on the host. */

type WithHostTag = fabric.FabricObject & { effectHostId?: string; effectSlot?: number }
type WithId = fabric.FabricObject & { id?: string }

function tagOf(obj: fabric.FabricObject): WithHostTag {
  return obj as WithHostTag
}

/** True for a synthetic effect clone — excluded from the layers panel and
 *  from selection/grouping (it's already selectable:false/evented:false, but
 *  callers that enumerate canvas.getObjects() need this too). */
export function isEffectClone(obj: fabric.FabricObject): boolean {
  return typeof tagOf(obj).effectHostId === 'string'
}

/** Remove every clone belonging to this host, across all effect slots. */
export function removeEffectClones(canvas: fabric.Canvas, hostId: string): void {
  const clones = canvas.getObjects().filter((o) => tagOf(o).effectHostId === hostId)
  if (clones.length > 0) canvas.remove(...clones)
}

async function buildEffectClone(
  host: WithId,
  effect: ShadowEffect,
  slot: number,
): Promise<fabric.FabricObject> {
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
    shadow: new fabric.Shadow(shadowOptions(effect)),
  })
  const tagged = tagOf(clone)
  tagged.effectHostId = host.id
  tagged.effectSlot = slot
  ;(clone as unknown as { name?: string }).name = `Effect ${slot}`
  clone.setCoords()
  return clone
}

/**
 * Build (or rebuild) every synthetic clone `effects` needs beyond the host's
 * own native shadow (UX-020). `effects[0]` is assumed to already be set as
 * the host's native `shadow` by the caller (setShadowEffect) — it only gets
 * a clone here if it has spread. Every effect after the first always needs
 * one, since there's no second native shadow slot to put it in.
 */
export async function syncEffectClones(
  canvas: fabric.Canvas,
  host: WithId,
  effects: ShadowEffect[],
): Promise<void> {
  if (!host.id) return
  if (effects.length === 0) {
    removeEffectClones(canvas, host.id)
    canvas.requestRenderAll()
    return
  }
  const needsClone = effects
    .map((effect, slot) => ({ effect, slot }))
    .filter(({ effect, slot }) => slot > 0 || effect.spread > 0)

  if (needsClone.length === 0) {
    removeEffectClones(canvas, host.id)
    canvas.requestRenderAll()
    return
  }
  const clones = await Promise.all(needsClone.map(({ effect, slot }) => buildEffectClone(host, effect, slot)))
  // Remove existing clones right before inserting the new ones: a rapid
  // slider drag fires this repeatedly, and clone() is async, so a second
  // call can start (and finish its own remove, which finds nothing yet)
  // before this one's clones land. Cleaning up immediately pre-insert —
  // whichever call finishes last always wins — guarantees exactly the
  // latest call's clones survive regardless of resolution order.
  removeEffectClones(canvas, host.id)
  const hostIndex = Math.max(0, canvas.getObjects().indexOf(host))
  canvas.insertAt(hostIndex, ...clones)
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
export function repositionEffectClones(canvas: fabric.Canvas, host: WithId): void {
  if (!host.id) return
  const clones = canvas.getObjects().filter((o) => tagOf(o).effectHostId === host.id)
  for (const clone of clones) {
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
}
