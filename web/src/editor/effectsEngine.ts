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
 * peeks out. A clone is the same size as the host — spread doesn't scale it
 * (see shadowOptions in utils.ts for why: scaling would create a hard-edged
 * un-blurred band instead of a soft halo).
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

type WithHostTag = fabric.FabricObject & {
  effectHostId?: string
  effectSlot?: number
  effectRole?: 'outer' | 'inner'
}
type WithId = fabric.FabricObject & { id?: string }

function tagOf(obj: fabric.FabricObject): WithHostTag {
  return obj as WithHostTag
}

/** True for any synthetic effect visual (an outer-effect clone or the inner-
 *  shadow overlay) — excluded from the layers panel and from selection/
 *  grouping (it's already selectable:false/evented:false, but callers that
 *  enumerate canvas.getObjects() need this too). */
export function isEffectClone(obj: fabric.FabricObject): boolean {
  return typeof tagOf(obj).effectHostId === 'string'
}

/** Remove this host's outer-effect clones (drop/glow) only — the inner-
 *  shadow overlay (if any) has its own lifecycle via removeInnerShadow,
 *  since it's tagged the same way for isEffectClone's purposes but rebuilt
 *  independently (an outer-effect edit shouldn't tear down and rebuild the
 *  unrelated inner shadow, and vice versa). */
export function removeEffectClones(canvas: fabric.Canvas, hostId: string): void {
  const clones = canvas.getObjects().filter((o) => tagOf(o).effectHostId === hostId && tagOf(o).effectRole !== 'inner')
  if (clones.length > 0) canvas.remove(...clones)
}

/** Remove every synthetic effect visual for this host, outer and inner alike
 *  — used when the host itself is being removed entirely (delete/group). */
export function removeAllEffectVisuals(canvas: fabric.Canvas, hostId: string): void {
  const all = canvas.getObjects().filter((o) => tagOf(o).effectHostId === hostId)
  if (all.length > 0) canvas.remove(...all)
}

async function buildEffectClone(host: WithId, effect: ShadowEffect, slot: number): Promise<fabric.FabricObject> {
  const clone = await host.clone()
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
    scaleX: host.scaleX ?? 1,
    scaleY: host.scaleY ?? 1,
    shadow: new fabric.Shadow(shadowOptions(effect)),
  })
  const tagged = tagOf(clone)
  tagged.effectHostId = host.id
  tagged.effectSlot = slot
  tagged.effectRole = 'outer'
  ;(clone as unknown as { name?: string }).name = `Effect ${slot}`
  clone.setCoords()
  return clone
}

/**
 * Build (or rebuild) every synthetic clone `effects` needs beyond the host's
 * own native shadow (UX-020). `effects[0]` is assumed to already be set as
 * the host's native `shadow` by the caller (setShadowEffect) — every effect
 * after the first always needs a clone, since there's no second native
 * shadow slot to put it in. Spread never needs a clone on its own — it folds
 * into the blur radius (shadowOptions in utils.ts), so it's already correct
 * on whichever slot the effect is in, clone or not.
 */
export async function syncEffectClones(
  canvas: fabric.Canvas,
  host: WithId,
  effects: ShadowEffect[],
): Promise<void> {
  if (!host.id) return
  if (effects.length <= 1) {
    removeEffectClones(canvas, host.id)
    canvas.requestRenderAll()
    return
  }
  const clones = await Promise.all(
    effects.slice(1).map((effect, i) => buildEffectClone(host, effect, i + 1)),
  )
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
  const center = host.getCenterPoint()
  for (const clone of clones) {
    if (tagOf(clone).effectRole === 'inner') {
      // The inner-shadow overlay is always positioned by centre (see
      // syncInnerShadow) regardless of the host's own origin, since its
      // texture is padded symmetrically around the host's silhouette.
      clone.set({ angle: host.angle, flipX: host.flipX, flipY: host.flipY })
      clone.setPositionByOrigin(center, 'center', 'center')
    } else {
      clone.set({
        left: host.left,
        top: host.top,
        originX: host.originX,
        originY: host.originY,
        angle: host.angle,
        flipX: host.flipX,
        flipY: host.flipY,
      })
    }
    clone.setCoords()
  }
}

/**
 * Inner shadow (UX-020 phase 3). Canvas 2D shadows are physically incapable
 * of casting inward — a shadow always paints outside the casting shape's own
 * pixels — so this can't reuse the native-shadow-clone trick the other two
 * kinds use at all. Instead it's real raster compositing:
 *
 * 1. Render the host's own silhouette (solid opaque fill, no stroke) at its
 *    native local size plus padding for the blur to spread into.
 * 2. Fill a same-size canvas with the shadow colour, then punch a hole in it
 *    with `destination-out` using the silhouette shifted by the effect's own
 *    (x, y) offset — this leaves colour visible only in the "crescent" the
 *    shifted copy doesn't cover, on the side opposite the offset (offset
 *    (4, 4) — shifted right/down — leaves colour on the top/left, matching
 *    CSS's own `inset` shadow convention).
 * 3. Clip that crescent back down to the host's own (unshifted) silhouette
 *    with `destination-in`, so nothing spills outside the shape.
 * 4. Blur it, then clip to the silhouette a second time — blurring spreads
 *    colour past the original edge, which has to be cut back to the shape's
 *    actual boundary or the "inner" shadow would bleed outside the object.
 *
 * The result is wrapped as a real fabric.Image positioned exactly over the
 * host and inserted *above* it (unlike outer-effect clones, which sit
 * behind) — inner shadows render on top of the fill, inset from the edges.
 * Built from a canvas element directly (`new fabric.FabricImage(canvasEl)`),
 * not a data URL via `.fromURL()`/`setSrc()` — the same synchronous
 * canvas-source construction already relied on elsewhere in this app, and
 * unlike loading a real image resource, it doesn't hang in a test
 * environment that can't decode real image bytes.
 *
 * Known limitations (same root cause as the outer-effect clones' own):
 * - A host with internal transparency (gaps between/inside text glyphs, a
 *   transparent PNG's alpha holes) has those gaps baked into the silhouette
 *   too, which is correct — but a *painted-over* transparent region (rare)
 *   wouldn't be distinguishable from a true gap.
 * - No `spread` control, matching the original UX-011 spec for this kind
 *   (X / Y / Blur / Color only) — CSS's inset spread widens the crescent by
 *   scaling the shifted copy rather than just moving it, which would need
 *   its own compositing step; not implemented in this phase.
 */
async function renderSilhouette(host: WithId, pad: number): Promise<HTMLCanvasElement> {
  const w = Math.max(1, Math.round(host.width ?? 1))
  const h = Math.max(1, Math.round(host.height ?? 1))
  const clone = await host.clone()
  clone.set({
    fill: '#000',
    stroke: undefined,
    strokeWidth: 0,
    opacity: 1,
    shadow: null,
    angle: 0,
    scaleX: 1,
    scaleY: 1,
    originX: 'center',
    originY: 'center',
    left: pad + w / 2,
    top: pad + h / 2,
  })
  clone.setCoords()
  const el = document.createElement('canvas')
  el.width = w + pad * 2
  el.height = h + pad * 2
  // enableRetinaScaling defaults to true and would otherwise multiply el's
  // own width/height attributes by devicePixelRatio on this temporary
  // canvas — buildInnerShadowTexture/syncInnerShadow size everything else
  // (the work/blurred canvases, the final overlay's pixel dimensions) off
  // of el.width/el.height directly, so that silent multiplication made the
  // whole texture (and the FabricImage built from it) devicePixelRatio
  // times too large on any HiDPI display, bleeding the "inner" shadow out
  // past the host's own edges instead of clipping inside them.
  const sc = new fabric.StaticCanvas(el, { width: el.width, height: el.height, enableRetinaScaling: false })
  sc.add(clone)
  sc.renderAll()
  // Deliberately not calling sc.dispose(): unlike bookExport.ts's own
  // temporary StaticCanvas (which extracts a dataURL *string* first),
  // this function returns the canvas element itself — disposing clears
  // the element's own content in place, wiping out the render this
  // function exists to produce. The StaticCanvas has no other referrers
  // once this function returns, so it's still collectible.
  return el
}

async function buildInnerShadowTexture(host: WithId, effect: ShadowEffect): Promise<HTMLCanvasElement> {
  const pad = Math.ceil(effect.blur) + Math.ceil(Math.max(Math.abs(effect.x), Math.abs(effect.y))) + 4
  const mask = await renderSilhouette(host, pad)

  const work = document.createElement('canvas')
  work.width = mask.width
  work.height = mask.height
  const ctx = work.getContext('2d')!
  ctx.fillStyle = effect.color
  ctx.fillRect(0, 0, work.width, work.height)
  ctx.globalCompositeOperation = 'destination-out'
  ctx.drawImage(mask, effect.x, effect.y)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(mask, 0, 0)

  const blurred = document.createElement('canvas')
  blurred.width = mask.width
  blurred.height = mask.height
  const bctx = blurred.getContext('2d')!
  bctx.filter = `blur(${effect.blur}px)`
  bctx.drawImage(work, 0, 0)
  bctx.filter = 'none'
  bctx.globalCompositeOperation = 'destination-in'
  bctx.drawImage(mask, 0, 0)
  return blurred
}

/** Remove this host's inner-shadow overlay, if any. */
export function removeInnerShadow(canvas: fabric.Canvas, hostId: string): void {
  const existing = canvas.getObjects().find((o) => tagOf(o).effectHostId === hostId && tagOf(o).effectRole === 'inner')
  if (existing) canvas.remove(existing)
}

/** Build (or rebuild) the host's inner-shadow overlay, or remove it when
 *  `effect` is null. Independent of syncEffectClones/removeEffectClones —
 *  an inner shadow's own edits shouldn't touch unrelated outer effects and
 *  vice versa (see removeEffectClones's doc comment). */
export async function syncInnerShadow(canvas: fabric.Canvas, host: WithId, effect: ShadowEffect | null): Promise<void> {
  if (!host.id) return
  if (!effect) {
    removeInnerShadow(canvas, host.id)
    canvas.requestRenderAll()
    return
  }
  const texture = await buildInnerShadowTexture(host, effect)
  const overlay = new fabric.FabricImage(texture, {
    selectable: false,
    evented: false,
    hasControls: false,
    angle: host.angle,
    scaleX: host.scaleX ?? 1,
    scaleY: host.scaleY ?? 1,
  })
  // The texture is padded symmetrically around the host's own silhouette
  // (room for the blur to spread), so its centre is exactly the host's own
  // centre regardless of either object's originX/originY setting — using
  // getCenterPoint()/setPositionByOrigin sidesteps having to convert between
  // whatever origin the host itself happens to use.
  overlay.setPositionByOrigin(host.getCenterPoint(), 'center', 'center')
  overlay.setCoords()
  const tagged = tagOf(overlay)
  tagged.effectHostId = host.id
  tagged.effectRole = 'inner'
  ;(overlay as unknown as { name?: string }).name = 'Inner shadow'

  // Remove again, right before inserting: a rapid slider drag fires this
  // repeatedly, and building the texture is async, so a second call can
  // start before this one's overlay lands. Cleaning up immediately
  // pre-insert — whichever call finishes last always wins — guarantees
  // exactly one overlay survives regardless of resolution order (same
  // pattern as syncEffectClones).
  removeInnerShadow(canvas, host.id)
  const hostIndex = canvas.getObjects().indexOf(host)
  canvas.insertAt(hostIndex + 1, overlay)
  canvas.requestRenderAll()
}
