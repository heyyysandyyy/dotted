import { describe, it, expect, beforeEach } from 'vitest'
import * as fabric from 'fabric'
import { isEffectClone, syncEffectClones, removeEffectClones, repositionEffectClones } from './effectsEngine'
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
