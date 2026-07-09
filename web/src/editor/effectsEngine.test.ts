import { describe, it, expect, beforeEach } from 'vitest'
import * as fabric from 'fabric'
import {
  isEffectClone,
  syncEffectClones,
  removeEffectClones,
  removeAllEffectVisuals,
  repositionEffectClones,
  syncInnerShadow,
} from './effectsEngine'
import { EXTRA_PROPS } from './storage'
import type { ShadowEffect } from './utils'

const dropEffect = (overrides: Partial<ShadowEffect> = {}): ShadowEffect => ({
  kind: 'drop',
  x: 4,
  y: 4,
  blur: 8,
  spread: 0,
  color: 'rgba(0,0,0,0.3)',
  ...overrides,
})
const glowEffect = (overrides: Partial<ShadowEffect> = {}): ShadowEffect => ({
  kind: 'glow',
  x: 0,
  y: 0,
  blur: 12,
  spread: 0,
  color: 'rgba(255,255,255,0.6)',
  ...overrides,
})
const innerEffect = (overrides: Partial<ShadowEffect> = {}): ShadowEffect => ({
  kind: 'inner',
  x: 10,
  y: 10,
  blur: 0,
  spread: 0,
  color: 'rgba(255,0,0,1)',
  ...overrides,
})

describe('effectsEngine — single effect (UX-020 phase 1)', () => {
  let canvas: fabric.Canvas
  let host: fabric.Rect & { id?: string }

  beforeEach(() => {
    canvas = new fabric.Canvas(document.createElement('canvas'), { width: 400, height: 400 })
    host = new fabric.Rect({ left: 50, top: 50, width: 100, height: 60, fill: '#f00' })
    ;(host as unknown as { id: string }).id = 'host-1'
    canvas.add(host)
  })

  it('isEffectClone is false for a plain object', () => {
    expect(isEffectClone(host)).toBe(false)
  })

  it('never creates a clone for a single effect, regardless of spread — spread folds into blur on whichever slot the effect is in', async () => {
    await syncEffectClones(canvas, host, [dropEffect({ spread: 0 })])
    expect(canvas.getObjects()).toEqual([host])

    await syncEffectClones(canvas, host, [dropEffect({ spread: 25 })])
    expect(canvas.getObjects()).toEqual([host])
  })

  it('removing all effects is a no-op when there was never a clone', async () => {
    await syncEffectClones(canvas, host, [dropEffect({ spread: 10 })])
    await syncEffectClones(canvas, host, [])
    expect(canvas.getObjects()).toEqual([host])
  })
})

describe('effectsEngine — multiple simultaneous effects (UX-020 phase 2)', () => {
  let canvas: fabric.Canvas
  let host: fabric.Rect & { id?: string }

  beforeEach(() => {
    canvas = new fabric.Canvas(document.createElement('canvas'), { width: 400, height: 400 })
    host = new fabric.Rect({ left: 50, top: 50, width: 100, height: 60, fill: '#f00' })
    ;(host as unknown as { id: string }).id = 'host-1'
    canvas.add(host)
  })

  it('a second effect always gets a clone, even with no spread of its own', async () => {
    await syncEffectClones(canvas, host, [dropEffect({ spread: 0 }), glowEffect({ spread: 0 })])
    const objs = canvas.getObjects()
    const clones = objs.filter((o) => isEffectClone(o))
    expect(clones).toHaveLength(1)
    expect((clones[0] as unknown as { effectSlot?: number }).effectSlot).toBe(1)
    expect((clones[0] as unknown as { effectHostId?: string }).effectHostId).toBe('host-1')
    // Behind the host in stacking order (lower index = drawn first/further back).
    expect(objs.indexOf(clones[0])).toBeLessThan(objs.indexOf(host))
    // Not selectable/interactive — purely a rendering artifact.
    expect(clones[0].selectable).toBe(false)
    expect(clones[0].evented).toBe(false)
  })

  it("the clone matches the host's own size — spread widens its blur, not its silhouette", async () => {
    await syncEffectClones(canvas, host, [dropEffect(), glowEffect({ spread: 20 })])
    const clone = canvas.getObjects().find((o) => isEffectClone(o))!
    expect(clone.scaleX).toBe(host.scaleX ?? 1)
    expect(clone.scaleY).toBe(host.scaleY ?? 1)
    // blur + spread, per shadowOptions in utils.ts.
    expect((clone.shadow as fabric.Shadow).blur).toBe(12 + 20)
  })

  it('only the second effect gets a clone even when the first also has spread — the first stays on the host\'s own native shadow', async () => {
    await syncEffectClones(canvas, host, [dropEffect({ spread: 10 }), glowEffect({ spread: 20 })])
    const clones = canvas.getObjects().filter((o) => isEffectClone(o))
    expect(clones).toHaveLength(1)
    expect((clones[0] as unknown as { effectSlot?: number }).effectSlot).toBe(1)
  })

  it('rebuilding on a spread change replaces the old clone rather than accumulating clones', async () => {
    await syncEffectClones(canvas, host, [dropEffect(), glowEffect({ spread: 10 })])
    await syncEffectClones(canvas, host, [dropEffect(), glowEffect({ spread: 20 })])
    const clones = canvas.getObjects().filter((o) => isEffectClone(o))
    expect(clones).toHaveLength(1)
    expect((clones[0].shadow as fabric.Shadow).blur).toBe(12 + 20)
  })

  it('never leaves two clones behind when calls overlap (a fast slider drag fires setShadowEffect repeatedly without awaiting the previous call)', async () => {
    const calls = [10, 15, 20, 25, 30].map((spread) =>
      syncEffectClones(canvas, host, [dropEffect(), glowEffect({ spread })]),
    )
    await Promise.all(calls)
    const clones = canvas.getObjects().filter((o) => isEffectClone(o))
    expect(clones).toHaveLength(1)
  })

  it('dropping back to one effect removes the second clone', async () => {
    await syncEffectClones(canvas, host, [dropEffect(), glowEffect()])
    await syncEffectClones(canvas, host, [dropEffect()])
    const clones = canvas.getObjects().filter((o) => isEffectClone(o))
    expect(clones).toHaveLength(0)
  })

  it('removeEffectClones removes the clone and nothing else', async () => {
    await syncEffectClones(canvas, host, [dropEffect(), glowEffect()])
    removeEffectClones(canvas, 'host-1')
    expect(canvas.getObjects()).toEqual([host])
  })

  it('repositionEffectClones keeps the clone locked to the host after it moves', async () => {
    await syncEffectClones(canvas, host, [dropEffect(), glowEffect()])
    host.set({ left: 200, top: 150, angle: 30 })
    repositionEffectClones(canvas, host)
    const clone = canvas.getObjects().find((o) => isEffectClone(o))!
    expect(clone.left).toBe(200)
    expect(clone.top).toBe(150)
    expect(clone.angle).toBe(30)
  })
})

describe('effects survive a save/reload round trip (EXTRA_PROPS)', () => {
  // Bug: undo/redo and project save/load both serialize via
  // canvas.toObject(EXTRA_PROPS) then canvas.loadFromJSON(...) — anything
  // not listed in EXTRA_PROPS silently vanishes on reload. Before `effects`/
  // `effectHostId`/`effectSlot` were added there, a host's second active
  // effect lost its data, and its clone reloaded as a plain, untagged
  // object — isEffectClone() stopped recognizing it, so it never moved
  // again when the (former) host was transformed. Reproduced by hand via a
  // real undo in the browser before fixing EXTRA_PROPS in storage.ts.
  it('a second effect and its clone both survive toObject/loadFromJSON', async () => {
    const canvas = new fabric.Canvas(document.createElement('canvas'), { width: 400, height: 400 })
    const host = new fabric.Rect({ left: 50, top: 50, width: 100, height: 60, fill: '#f00' }) as fabric.Rect & {
      id: string
    }
    host.id = 'host-1'
    ;(host as unknown as { effects?: ShadowEffect[] }).effects = [dropEffect(), glowEffect()]
    canvas.add(host)
    await syncEffectClones(canvas, host, [dropEffect(), glowEffect()])
    expect(canvas.getObjects().filter((o) => isEffectClone(o))).toHaveLength(1)

    const json = canvas.toObject(EXTRA_PROPS)
    const reloaded = new fabric.Canvas(document.createElement('canvas'), { width: 400, height: 400 })
    await reloaded.loadFromJSON(json)

    const reloadedHost = reloaded.getObjects().find((o) => !isEffectClone(o)) as
      | (fabric.FabricObject & { effects?: ShadowEffect[] })
      | undefined
    expect(reloadedHost?.effects).toHaveLength(2)

    const reloadedClones = reloaded.getObjects().filter((o) => isEffectClone(o))
    expect(reloadedClones).toHaveLength(1)
    expect((reloadedClones[0] as unknown as { effectHostId?: string }).effectHostId).toBe('host-1')

    // The reload didn't just preserve the tag — the clone is still
    // trackable: a host transform after reload still finds and moves it.
    reloadedHost!.set({ left: 300, top: 250 })
    repositionEffectClones(reloaded, reloadedHost as fabric.FabricObject & { id?: string })
    expect(reloadedClones[0].left).toBe(300)
    expect(reloadedClones[0].top).toBe(250)
  })

  it("an object's own opacity (UX-025) survives the same round trip without needing to be added to EXTRA_PROPS — it's already one of fabric's own default-serialized properties", async () => {
    const canvas = new fabric.Canvas(document.createElement('canvas'), { width: 400, height: 400 })
    const rect = new fabric.Rect({ left: 20, top: 20, width: 40, height: 40, fill: '#0f0', opacity: 0.42 })
    canvas.add(rect)

    const json = canvas.toObject(EXTRA_PROPS)
    const reloaded = new fabric.Canvas(document.createElement('canvas'), { width: 400, height: 400 })
    await reloaded.loadFromJSON(json)

    expect(reloaded.getObjects()[0].opacity).toBeCloseTo(0.42, 5)
  })
})

describe('syncInnerShadow (UX-020 phase 3)', () => {
  let canvas: fabric.Canvas
  let host: fabric.Rect & { id?: string }

  beforeEach(() => {
    canvas = new fabric.Canvas(document.createElement('canvas'), { width: 400, height: 400 })
    host = new fabric.Rect({ left: 50, top: 50, width: 100, height: 60, fill: '#00f' })
    ;(host as unknown as { id: string }).id = 'host-1'
    canvas.add(host)
  })

  function innerOverlay(): (fabric.FabricObject & { effectRole?: string }) | undefined {
    return canvas.getObjects().find((o) => (o as unknown as { effectRole?: string }).effectRole === 'inner')
  }

  it('adds a real fabric.Image overlay, tagged and positioned above the host', async () => {
    await syncInnerShadow(canvas, host, innerEffect())
    const overlay = innerOverlay()
    expect(overlay).toBeInstanceOf(fabric.FabricImage)
    expect(isEffectClone(overlay!)).toBe(true)
    expect(overlay!.selectable).toBe(false)
    const objs = canvas.getObjects()
    expect(objs.indexOf(overlay!)).toBeGreaterThan(objs.indexOf(host))
  })

  it('removes the overlay when the effect is set to null', async () => {
    await syncInnerShadow(canvas, host, innerEffect())
    await syncInnerShadow(canvas, host, null)
    expect(innerOverlay()).toBeUndefined()
    expect(canvas.getObjects()).toEqual([host])
  })

  it('never leaves two overlays behind when calls overlap (a fast slider drag)', async () => {
    const calls = [4, 8, 12, 16, 20].map((x) => syncInnerShadow(canvas, host, innerEffect({ x })))
    await Promise.all(calls)
    const overlays = canvas.getObjects().filter((o) => (o as unknown as { effectRole?: string }).effectRole === 'inner')
    expect(overlays).toHaveLength(1)
  })

  it("removeEffectClones (outer-only) doesn't touch the inner-shadow overlay, but removeAllEffectVisuals does", async () => {
    await syncInnerShadow(canvas, host, innerEffect())
    removeEffectClones(canvas, 'host-1')
    expect(innerOverlay()).toBeDefined()
    removeAllEffectVisuals(canvas, 'host-1')
    expect(innerOverlay()).toBeUndefined()
  })

  it('repositions by centre, independent of the host\'s own origin, when the host moves', async () => {
    await syncInnerShadow(canvas, host, innerEffect())
    host.set({ left: 300, top: 250 })
    repositionEffectClones(canvas, host)
    const overlay = innerOverlay()!
    const hostCenter = host.getCenterPoint()
    const overlayCenter = overlay.getCenterPoint()
    expect(overlayCenter.x).toBeCloseTo(hostCenter.x, 5)
    expect(overlayCenter.y).toBeCloseTo(hostCenter.y, 5)
  })

  it('renders the shadow crescent on the side opposite the offset (CSS inset-shadow convention)', async () => {
    // blur 0 and a fully opaque colour make the crescent's edge exact, so
    // pixel checks don't have to account for antialiasing/blur softening.
    await syncInnerShadow(canvas, host, innerEffect({ x: 10, y: 10, blur: 0 }))
    const overlay = innerOverlay() as fabric.FabricImage
    const el = overlay.getElement() as HTMLCanvasElement
    const ctx = el.getContext('2d')!

    // The host is 100x60 with the texture padded by 14px on every side (see
    // effectsEngine.ts's pad formula: ceil(blur) + ceil(max(|x|,|y|)) + 4 =
    // 0 + 10 + 4), so the host's own silhouette sits at (14,14)-(114,74)
    // within the texture. An offset of (10, 10) erases everything except a
    // 10px-thick strip along the top and left edges (see the worked-through
    // math in this test file's commit message / PR description).
    const alphaAt = (x: number, y: number) => ctx.getImageData(x, y, 1, 1).data[3]

    // Near the top-left corner, inside the shape: shadow colour present.
    expect(alphaAt(16, 16)).toBeGreaterThan(200)
    // Along the top edge, away from the corner: still present (top strip).
    expect(alphaAt(100, 16)).toBeGreaterThan(200)
    // Along the left edge, away from the corner: still present (left strip).
    expect(alphaAt(16, 60)).toBeGreaterThan(200)
    // Near the centre and the bottom-right corner: erased (opposite side).
    expect(alphaAt(64, 44)).toBeLessThan(50)
    expect(alphaAt(100, 60)).toBeLessThan(50)
  })

  it('is excluded from the layers panel / history the same way outer-effect clones are', async () => {
    await syncInnerShadow(canvas, host, innerEffect())
    const overlay = innerOverlay()!
    // isEffectClone is the single predicate every exclusion in the app
    // (layers panel, history recording, self-heal) is built on.
    expect(isEffectClone(overlay)).toBe(true)
  })
})

describe('host opacity does not cascade to effect visuals (UX-025)', () => {
  let canvas: fabric.Canvas
  let host: fabric.Rect & { id?: string }

  beforeEach(() => {
    canvas = new fabric.Canvas(document.createElement('canvas'), { width: 400, height: 400 })
    host = new fabric.Rect({ left: 50, top: 50, width: 100, height: 60, fill: '#f00' })
    ;(host as unknown as { id: string }).id = 'host-1'
    canvas.add(host)
  })

  it("an outer-effect clone stays fully opaque when the host's own opacity is lowered", async () => {
    // Two simultaneous effects so the second one gets a real clone (a single
    // effect just uses the host's own native shadow — see the phase 1 tests).
    await syncEffectClones(canvas, host, [dropEffect(), glowEffect()])
    const clone = canvas.getObjects().find((o) => isEffectClone(o))!
    host.set({ opacity: 0.3 }) // simulates updateActive({ opacity: 0.3 }) on the host
    expect(clone.opacity).toBe(1)
    // Rebuilding the clone (e.g. from a subsequent effect edit) must not pick
    // up the host's lowered opacity either — buildEffectClone always pins it.
    await syncEffectClones(canvas, host, [dropEffect(), glowEffect({ blur: 20 })])
    const rebuilt = canvas.getObjects().find((o) => isEffectClone(o))!
    expect(rebuilt.opacity).toBe(1)
  })

  it("the inner-shadow overlay stays fully opaque when the host's own opacity is lowered", async () => {
    await syncInnerShadow(canvas, host, innerEffect())
    const overlayBefore = canvas.getObjects().find((o) => (o as unknown as { effectRole?: string }).effectRole === 'inner')!
    host.set({ opacity: 0.4 })
    expect(overlayBefore.opacity).toBe(1)
    // Rebuilding the overlay must not inherit the host's lowered opacity either.
    await syncInnerShadow(canvas, host, innerEffect({ x: 12 }))
    const overlayAfter = canvas.getObjects().find((o) => (o as unknown as { effectRole?: string }).effectRole === 'inner')!
    expect(overlayAfter.opacity).toBe(1)
  })
})
