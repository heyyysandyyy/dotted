import { describe, it, expect } from 'vitest'
import { warpImageData } from './warp'
import { renderAdjustedImage } from './renderAdjustedImage'
import { DEFAULT_GEOMETRY, IDENTITY, planGeometry } from './geometry'
import type { PhotoGeometry } from './geometry'
import { DEFAULT_ADJUSTMENTS } from '../store/usePhotoEditorStore'

const RED = [255, 0, 0, 255]
const BLUE = [0, 0, 255, 255]

function imageData(width: number, height: number, pixels: number[][]): ImageData {
  return { width, height, data: new Uint8ClampedArray(pixels.flat()), colorSpace: 'srgb' } as ImageData
}
const blank = (width: number, height: number) =>
  ({ width, height, data: new Uint8ClampedArray(width * height * 4), colorSpace: 'srgb' }) as ImageData
const px = (d: ImageData, x: number, y: number) => Array.from(d.data.slice((y * d.width + x) * 4, (y * d.width + x) * 4 + 4))

describe('warpImageData (PHOTO-009)', () => {
  it('copies straight through an identity map', () => {
    const src = imageData(2, 1, [RED, BLUE])
    const out = blank(2, 1)
    warpImageData(src, out, IDENTITY, false)
    expect(px(out, 0, 0)).toEqual(RED)
    expect(px(out, 1, 0)).toEqual(BLUE)
  })

  it('samples through the map: a mirror swaps the pixels', () => {
    const src = imageData(2, 1, [RED, BLUE])
    const out = blank(2, 1)
    warpImageData(src, out, [-1, 0, 2, 0, 1, 0, 0, 0, 1], true)
    expect(px(out, 0, 0)).toEqual(BLUE)
    expect(px(out, 1, 0)).toEqual(RED)
  })

  it('blends neighbours when smooth, picks one when nearest', () => {
    const src = imageData(2, 1, [
      [0, 0, 0, 255],
      [200, 200, 200, 255],
    ])
    // One output pixel whose centre lands exactly between the two sources.
    const halfway = [1, 0, 0.5, 0, 1, 0, 0, 0, 1] as const
    const smooth = blank(1, 1)
    warpImageData(src, smooth, halfway, true)
    expect(px(smooth, 0, 0)).toEqual([100, 100, 100, 255])
    const nearest = blank(1, 1)
    warpImageData(src, nearest, halfway, false)
    expect([0, 200]).toContain(px(nearest, 0, 0)[0])
  })

  it('leaves pixels that map outside the source clear', () => {
    const src = imageData(1, 1, [RED])
    const out = blank(2, 1)
    warpImageData(src, out, IDENTITY, true)
    expect(px(out, 0, 0)).toEqual(RED)
    expect(px(out, 1, 0)).toEqual([0, 0, 0, 0])
  })
})

/** A real canvas (node-canvas under jsdom): red left half, blue right half. */
function splitSource(width = 20, height = 10) {
  const el = document.createElement('canvas')
  el.width = width
  el.height = height
  const ctx = el.getContext('2d')!
  ctx.fillStyle = '#ff0000'
  ctx.fillRect(0, 0, width / 2, height)
  ctx.fillStyle = '#0000ff'
  ctx.fillRect(width / 2, 0, width / 2, height)
  return el
}

function render(geometry: Partial<PhotoGeometry>, source = splitSource()) {
  const plan = planGeometry({ ...DEFAULT_GEOMETRY, ...geometry }, source.width, source.height)
  const out = document.createElement('canvas')
  const adjustments = { ...DEFAULT_ADJUSTMENTS, geometry: { ...DEFAULT_GEOMETRY, ...geometry } }
  expect(renderAdjustedImage(out, source, plan.width, plan.height, adjustments, plan)).toBe(true)
  const data = out.getContext('2d')!.getImageData(0, 0, out.width, out.height)
  return { plan, out, at: (x: number, y: number) => px(data, x, y) }
}

describe('renderAdjustedImage through a geometry plan (PHOTO-009)', () => {
  it('turns the image a quarter clockwise: the left half ends up on top', () => {
    const r = render({ quarterTurns: 1 })
    expect([r.out.width, r.out.height]).toEqual([10, 20])
    expect(r.at(5, 2)).toEqual(RED)
    expect(r.at(5, 17)).toEqual(BLUE)
  })

  it('flips left to right', () => {
    const r = render({ flipH: true })
    expect(r.at(2, 5)).toEqual(BLUE)
    expect(r.at(17, 5)).toEqual(RED)
  })

  it('crops to the right half', () => {
    const r = render({ crop: { x: 0.5, y: 0, w: 0.5, h: 1 } })
    expect([r.out.width, r.out.height]).toEqual([10, 10])
    expect(r.at(1, 1)).toEqual(BLUE)
    expect(r.at(8, 8)).toEqual(BLUE)
  })

  it('resizes with nearest resampling and keeps the edge crisp', () => {
    const r = render({ resizeScale: 2, resample: 'nearest' })
    expect([r.out.width, r.out.height]).toEqual([40, 20])
    expect(r.at(19, 10)).toEqual(RED)
    expect(r.at(20, 10)).toEqual(BLUE)
  })

  it('leaves the corners of a free rotation clear', () => {
    const r = render({ angle: 45 })
    expect(r.plan.transparent).toBe(true)
    expect(r.at(0, 0)[3]).toBe(0)
    expect(r.at(Math.floor(r.out.width / 2), Math.floor(r.out.height / 2))[3]).toBe(255)
  })

  it('fills the whole frame after a keystone correction', () => {
    const r = render({ perspectiveV: 80 })
    expect([r.out.width, r.out.height]).toEqual([20, 10])
    for (const [x, y] of [[0, 0], [19, 0], [0, 9], [19, 9]]) expect(r.at(x, y)[3]).toBe(255)
    expect(r.at(1, 5)).toEqual(RED)
    expect(r.at(18, 5)).toEqual(BLUE)
  })
})
