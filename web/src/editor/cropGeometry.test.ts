import { describe, it, expect } from 'vitest'
import { rotateVector, rotateAround, localToScene, sceneDeltaToLocal } from './cropGeometry'

function closeVec(a: { x: number; y: number }, b: { x: number; y: number }, precision = 6) {
  expect(a.x).toBeCloseTo(b.x, precision)
  expect(a.y).toBeCloseTo(b.y, precision)
}

describe('rotateVector', () => {
  it('is the identity at 0 degrees', () => {
    closeVec(rotateVector({ x: 3, y: -5 }, 0), { x: 3, y: -5 })
  })
  it('rotates +x toward +y at 90 degrees (clockwise in y-down space, matching fabric)', () => {
    closeVec(rotateVector({ x: 10, y: 0 }, 90), { x: 0, y: 10 })
  })
  it('negates both axes at 180 degrees', () => {
    closeVec(rotateVector({ x: 4, y: -2 }, 180), { x: -4, y: 2 })
  })
  it('360 degrees is the identity', () => {
    closeVec(rotateVector({ x: 7, y: 11 }, 360), { x: 7, y: 11 })
  })
  it('composes: rotating by θ then -θ returns the original vector', () => {
    const v = { x: 12, y: -8 }
    closeVec(rotateVector(rotateVector(v, 37), -37), v)
  })
})

describe('rotateAround', () => {
  it('is the identity at 0 degrees regardless of pivot', () => {
    closeVec(rotateAround({ x: 5, y: 5 }, { x: 100, y: -50 }, 0), { x: 5, y: 5 })
  })
  it('leaves the pivot itself fixed', () => {
    const pivot = { x: 20, y: 30 }
    closeVec(rotateAround(pivot, pivot, 73), pivot)
  })
  it('rotates a point 90 degrees around a non-origin pivot', () => {
    // Point directly right of the pivot moves to directly below it.
    closeVec(rotateAround({ x: 110, y: 50 }, { x: 100, y: 50 }, 90), { x: 100, y: 60 })
  })
  it('round-trips: rotate then rotate back by -angle returns the original point', () => {
    const pivot = { x: 40, y: -10 }
    const point = { x: 15, y: 62 }
    closeVec(rotateAround(rotateAround(point, pivot, 51), pivot, -51), point)
  })
})

describe('localToScene', () => {
  const centre = { translateX: 200, translateY: 150, angle: 0 }

  it('at angle 0, a local offset just adds onto the scene centre', () => {
    closeVec(localToScene(30, -20, centre), { x: 230, y: 130 })
  })
  it('the local origin (0,0) always maps to the scene centre, any angle', () => {
    closeVec(localToScene(0, 0, { ...centre, angle: 47 }), { x: 200, y: 150 })
  })
  it('a rotated image maps a local offset through the rotation', () => {
    // Local "10 right of centre" on a 90-degree-rotated image lands 10 below
    // the scene centre — matches rotateVector's own 90-degree case.
    closeVec(localToScene(10, 0, { ...centre, angle: 90 }), { x: 200, y: 160 })
  })
})

describe('sceneDeltaToLocal', () => {
  it('is the identity at angle 0', () => {
    closeVec(sceneDeltaToLocal({ x: 5, y: -8 }, 0), { x: 5, y: -8 })
  })
  it('is the inverse rotation of localToScene\'s own angle, so a drag along the image\'s local axis is recovered regardless of on-screen rotation', () => {
    const t = { translateX: 0, translateY: 0, angle: 35 }
    const localDelta = { x: 12, y: -4 }
    const sceneDelta = localToScene(localDelta.x, localDelta.y, t) // translateX/Y are 0, so this is a pure vector rotation
    closeVec(sceneDeltaToLocal(sceneDelta, t.angle), localDelta)
  })
})
