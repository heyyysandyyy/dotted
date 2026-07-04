import { describe, it, expect, beforeEach } from 'vitest'
import * as fabric from 'fabric'
import {
  isEffectClone,
  syncSpreadClone,
  removeSpreadClone,
  repositionSpreadClone,
} from './effectsEngine'
import type { ShadowEffect } from './utils'

const effect = (overrides: Partial<ShadowEffect> = {}): ShadowEffect => ({
  kind: 'drop',
  x: 4,
  y: 4,
  blur: 8,
  spread: 0,
  color: 'rgba(0,0,0,0.3)',
  ...overrides,
})

describe('effectsEngine (UX-020 phase 1)', () => {
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

  it('does not create a clone for spread 0 — the host keeps rendering its own native shadow alone', async () => {
    await syncSpreadClone(canvas, host, effect({ spread: 0 }))
    expect(canvas.getObjects()).toHaveLength(1)
    expect(canvas.getObjects()).toEqual([host])
  })

  it('creates a tagged clone behind the host for spread > 0', async () => {
    await syncSpreadClone(canvas, host, effect({ spread: 10 }))
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
    await syncSpreadClone(canvas, host, effect({ spread: 10 }))
    await syncSpreadClone(canvas, host, effect({ spread: 20 }))
    const clones = canvas.getObjects().filter((o) => isEffectClone(o))
    expect(clones).toHaveLength(1)
  })

  it('never leaves two clones behind when calls overlap (a fast slider drag fires setShadowEffect repeatedly without awaiting the previous call)', async () => {
    const calls = [10, 15, 20, 25, 30].map((spread) => syncSpreadClone(canvas, host, effect({ spread })))
    await Promise.all(calls)
    const clones = canvas.getObjects().filter((o) => isEffectClone(o))
    expect(clones).toHaveLength(1)
  })

  it('removeSpreadClone removes the clone and nothing else', async () => {
    await syncSpreadClone(canvas, host, effect({ spread: 10 }))
    removeSpreadClone(canvas, 'host-1')
    expect(canvas.getObjects()).toEqual([host])
  })

  it('repositionSpreadClone keeps the clone locked to the host after it moves', async () => {
    await syncSpreadClone(canvas, host, effect({ spread: 10 }))
    host.set({ left: 200, top: 150, angle: 30 })
    repositionSpreadClone(canvas, host)
    const clone = canvas.getObjects().find((o) => isEffectClone(o))!
    expect(clone.left).toBe(200)
    expect(clone.top).toBe(150)
    expect(clone.angle).toBe(30)
  })
})
