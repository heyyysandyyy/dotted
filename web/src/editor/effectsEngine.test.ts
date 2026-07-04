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

  it('does not create a clone for a single effect with spread 0 — the host keeps rendering its own native shadow alone', async () => {
    await syncEffectClones(canvas, host, [dropEffect({ spread: 0 })])
    expect(canvas.getObjects()).toHaveLength(1)
    expect(canvas.getObjects()).toEqual([host])
  })

  it('creates a tagged clone behind the host when the first effect has spread > 0', async () => {
    await syncEffectClones(canvas, host, [dropEffect({ spread: 10 })])
    const objs = canvas.getObjects()
    expect(objs).toHaveLength(2)
    const clone = objs.find((o) => o !== host)!
    expect(isEffectClone(clone)).toBe(true)
    expect((clone as unknown as { effectHostId?: string }).effectHostId).toBe('host-1')
    // Behind the host in stacking order (lower index = drawn first/further back).
    expect(objs.indexOf(clone)).toBeLessThan(objs.indexOf(host))
    // Not selectable/interactive — purely a rendering artifact.
    expect(clone.selectable).toBe(false)
    expect(clone.evented).toBe(false)
    // Scaled up to fit the spread amount around the host's own silhouette.
    expect(clone.scaleX!).toBeGreaterThan(host.scaleX ?? 1)
    expect(clone.scaleY!).toBeGreaterThan(host.scaleY ?? 1)
  })

  it('rebuilding replaces the old clone rather than accumulating clones', async () => {
    await syncEffectClones(canvas, host, [dropEffect({ spread: 10 })])
    await syncEffectClones(canvas, host, [dropEffect({ spread: 20 })])
    const clones = canvas.getObjects().filter((o) => isEffectClone(o))
    expect(clones).toHaveLength(1)
  })

  it('never leaves two clones behind when calls overlap (a fast slider drag fires setShadowEffect repeatedly without awaiting the previous call)', async () => {
    const calls = [10, 15, 20, 25, 30].map((spread) => syncEffectClones(canvas, host, [dropEffect({ spread })]))
    await Promise.all(calls)
    const clones = canvas.getObjects().filter((o) => isEffectClone(o))
    expect(clones).toHaveLength(1)
  })

  it('removeEffectClones removes the clone and nothing else', async () => {
    await syncEffectClones(canvas, host, [dropEffect({ spread: 10 })])
    removeEffectClones(canvas, 'host-1')
    expect(canvas.getObjects()).toEqual([host])
  })

  it('repositionEffectClones keeps the clone locked to the host after it moves', async () => {
    await syncEffectClones(canvas, host, [dropEffect({ spread: 10 })])
    host.set({ left: 200, top: 150, angle: 30 })
    repositionEffectClones(canvas, host)
    const clone = canvas.getObjects().find((o) => isEffectClone(o))!
    expect(clone.left).toBe(200)
    expect(clone.top).toBe(150)
    expect(clone.angle).toBe(30)
  })

  it('removing all effects removes any clone', async () => {
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
    const clones = canvas.getObjects().filter((o) => isEffectClone(o))
    expect(clones).toHaveLength(1)
    expect((clones[0] as unknown as { effectSlot?: number }).effectSlot).toBe(1)
  })

  it('both effects can have spread — one clone per effect past the first', async () => {
    await syncEffectClones(canvas, host, [dropEffect({ spread: 10 }), glowEffect({ spread: 20 })])
    const clones = canvas.getObjects().filter((o) => isEffectClone(o))
    // effects[0] (spread > 0) gets a clone for its halo, effects[1] gets its
    // own clone since it has no native shadow slot to live on at all.
    expect(clones).toHaveLength(2)
    const slots = clones.map((c) => (c as unknown as { effectSlot?: number }).effectSlot).sort()
    expect(slots).toEqual([0, 1])
  })

  it('dropping back to one effect removes the second clone', async () => {
    await syncEffectClones(canvas, host, [dropEffect(), glowEffect()])
    await syncEffectClones(canvas, host, [dropEffect()])
    const clones = canvas.getObjects().filter((o) => isEffectClone(o))
    expect(clones).toHaveLength(0)
  })

  it('repositioning moves every clone, not just one', async () => {
    await syncEffectClones(canvas, host, [dropEffect({ spread: 10 }), glowEffect({ spread: 10 })])
    host.set({ left: 300, top: 250 })
    repositionEffectClones(canvas, host)
    const clones = canvas.getObjects().filter((o) => isEffectClone(o))
    expect(clones).toHaveLength(2)
    clones.forEach((c) => {
      expect(c.left).toBe(300)
      expect(c.top).toBe(250)
    })
  })
})
