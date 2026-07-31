import { describe, it, expect, vi } from 'vitest'
import type * as fabricType from 'fabric'
import * as fabric from 'fabric'
import {
  readStyle,
  applyStyle,
  distributeStarts,
  pageSize,
  labelForProps,
  migrateStrokeDefaults,
  strokeStyleOf,
  strokeDashProps,
  strokeAlignmentOf,
  displayStrokeWidth,
  applyStrokeAlignment,
} from './storeHelpers'

// Minimal object stub — these helpers only read props, set(), and type.
const obj = (props: Record<string, unknown>) =>
  ({ set: vi.fn(), setCoords: vi.fn(), ...props }) as unknown as fabricType.FabricObject

describe('readStyle', () => {
  it('reads only the style props the object defines', () => {
    const r = obj({ type: 'rect', fill: '#f00', stroke: '#111', strokeWidth: 2, opacity: 1 })
    expect(readStyle(r)).toEqual({ fill: '#f00', stroke: '#111', strokeWidth: 2, opacity: 1 })
  })
  it('keeps rx/ry only for rects', () => {
    expect(readStyle(obj({ type: 'rect', fill: '#000', rx: 8, ry: 8 }))).toMatchObject({ rx: 8, ry: 8 })
    // An ellipse's rx is a radius, not a border radius — don't copy it.
    expect(readStyle(obj({ type: 'ellipse', fill: '#000', rx: 50 })).rx).toBeUndefined()
  })
  it('carries dash style along with copyable stroke style (UX-028) — alignment is not copyable, see storeHelpers.ts', () => {
    const r = obj({ type: 'rect', strokeDashArray: [12, 8], strokeLineCap: 'butt' })
    expect(readStyle(r)).toMatchObject({ strokeDashArray: [12, 8], strokeLineCap: 'butt' })
  })
})

describe('applyStyle', () => {
  it('applies only props compatible with (already present on) the target', () => {
    const rect = obj({ type: 'rect', fill: '#000', stroke: '#000', opacity: 1 })
    applyStyle(rect, { fill: '#0f0', fontFamily: 'Roboto', opacity: 0.5 })
    // font props skipped (rect has no fontFamily); fill/opacity applied.
    expect(rect.set).toHaveBeenCalledWith({ fill: '#0f0', opacity: 0.5 })
  })
  it('skips rx/ry on non-rects', () => {
    const ellipse = obj({ type: 'ellipse', fill: '#000', rx: 50 })
    applyStyle(ellipse, { rx: 8, fill: '#fff' })
    expect(ellipse.set).toHaveBeenCalledWith({ fill: '#fff' })
  })
})

describe('strokeStyleOf / strokeDashProps (UX-028)', () => {
  it('reads solid off a null/absent dash array', () => {
    expect(strokeStyleOf(obj({ strokeDashArray: null }))).toBe('solid')
    expect(strokeStyleOf(obj({}))).toBe('solid')
  })
  it('reads dotted off a dash array starting with a zero-length dash', () => {
    expect(strokeStyleOf(obj({ strokeDashArray: [0, 8] }))).toBe('dotted')
  })
  it('reads dashed off a dash array whose dash is longer than its gap', () => {
    expect(strokeStyleOf(obj({ strokeDashArray: [12, 8] }))).toBe('dashed')
  })
  it('reads spaced off a dash array whose gap is longer than its dash', () => {
    expect(strokeStyleOf(obj({ strokeDashArray: [12, 20] }))).toBe('spaced')
  })

  it('derives solid as a null dash array with a butt cap', () => {
    expect(strokeDashProps('solid', 4)).toEqual({ strokeDashArray: null, strokeLineCap: 'butt' })
  })
  it('scales dashed proportionally to stroke width, butt cap', () => {
    expect(strokeDashProps('dashed', 4)).toEqual({ strokeDashArray: [12, 8], strokeLineCap: 'butt' })
    expect(strokeDashProps('dashed', 10)).toEqual({ strokeDashArray: [30, 20], strokeLineCap: 'butt' })
  })
  it('scales spaced proportionally to stroke width, wider gap than dash, butt cap', () => {
    expect(strokeDashProps('spaced', 4)).toEqual({ strokeDashArray: [12, 20], strokeLineCap: 'butt' })
    expect(strokeDashProps('spaced', 10)).toEqual({ strokeDashArray: [30, 50], strokeLineCap: 'butt' })
  })
  it('scales dotted proportionally to stroke width, round cap', () => {
    expect(strokeDashProps('dotted', 4)).toEqual({ strokeDashArray: [0, 8], strokeLineCap: 'round' })
    expect(strokeDashProps('dotted', 10)).toEqual({ strokeDashArray: [0, 20], strokeLineCap: 'round' })
  })
})

describe('strokeAlignmentOf / displayStrokeWidth (UX-028)', () => {
  it('reads center when there is no stroke-inset clip', () => {
    expect(strokeAlignmentOf(obj({}))).toBe('center')
    expect(strokeAlignmentOf(obj({ clipPath: undefined }))).toBe('center')
  })
  it('reads inside when a clipPath is present', () => {
    expect(strokeAlignmentOf(obj({ clipPath: obj({}) }))).toBe('inside')
  })
  it('shows strokeWidth as-is for center alignment', () => {
    expect(displayStrokeWidth(obj({ strokeWidth: 10 }))).toBe(10)
  })
  it('halves strokeWidth for inside alignment, since it stores the doubled internal value', () => {
    expect(displayStrokeWidth(obj({ strokeWidth: 20, clipPath: obj({}) }))).toBe(10)
  })
})

// applyStrokeAlignment calls the real Fabric clone()/set() machinery (not
// just reading props like the helpers above), so it's exercised against
// real fabric.Rect instances rather than the lightweight stub.
describe('applyStrokeAlignment (UX-028)', () => {
  it('center: strokeWidth as given, no clip', async () => {
    const rect = new fabric.Rect({ width: 100, height: 80 })
    const result = await applyStrokeAlignment(rect, 'center', 12)
    expect(result).toEqual({ strokeWidth: 12, clipPath: undefined })
  })

  it('inside: doubles strokeWidth and builds a clip matching the shape\'s own un-stroked geometry', async () => {
    const rect = new fabric.Rect({ width: 100, height: 80, angle: 30, scaleX: 2, scaleY: 1.5 })
    const result = await applyStrokeAlignment(rect, 'inside', 12)

    expect(result.strokeWidth).toBe(24)
    expect(result.clipPath).toBeDefined()
    const clip = result.clipPath!
    // Geometry matches the host (what makes it an accurate silhouette)...
    expect(clip.width).toBe(100)
    expect(clip.height).toBe(80)
    // ...but position/transform/stroke are reset to local-space identity —
    // a non-absolutePositioned clipPath is placed relative to the host's own
    // center and gets the host's live transform applied automatically, so it
    // must not carry its own leftover left/top/angle/scale/stroke.
    expect(clip.left).toBe(0)
    expect(clip.top).toBe(0)
    expect(clip.angle).toBe(0)
    expect(clip.scaleX).toBe(1)
    expect(clip.scaleY).toBe(1)
    expect(clip.strokeWidth).toBe(0)
  })

  it('inside: the clip carries a shape-specific field too (ellipse radius), not just rect width/height', async () => {
    const ellipse = new fabric.Ellipse({ rx: 40, ry: 25 })
    const result = await applyStrokeAlignment(ellipse, 'inside', 6)
    const clip = result.clipPath as fabric.Ellipse
    expect(clip.rx).toBe(40)
    expect(clip.ry).toBe(25)
  })
})

describe('labelForProps (UX-025)', () => {
  it('labels an opacity change distinctly from fill/stroke changes', () => {
    expect(labelForProps({ opacity: 0.5 })).toBe('Changed opacity')
  })
  it('labels dash-style and alignment changes as a stroke change too (UX-028)', () => {
    expect(labelForProps({ strokeDashArray: [12, 8] })).toBe('Changed stroke')
    expect(labelForProps({ strokeLineCap: 'round' })).toBe('Changed stroke')
    expect(labelForProps({ clipPath: undefined })).toBe('Changed stroke')
  })
  it('does not let opacity get shadowed by another key in the same call', () => {
    // updateActive is always called with a single prop from the opacity
    // slider, but guard the precedence order anyway: fill wins if ever combined.
    expect(labelForProps({ fill: '#000', opacity: 0.5 })).toBe('Changed fill color')
  })
})

describe('pageSize', () => {
  it('falls back to the project size when the page has no explicit size', () => {
    expect(pageSize({ id: 'a', canvas: {} }, { width: 800, height: 600 })).toEqual({
      width: 800,
      height: 600,
    })
  })
  it('uses the page\'s own size when set (book pages, UX-015)', () => {
    const spread = { id: 'a', canvas: {}, type: 'spread' as const, width: 3600, height: 2700 }
    expect(pageSize(spread, { width: 1800, height: 2700 })).toEqual({ width: 3600, height: 2700 })
  })
})

describe('migrateStrokeDefaults', () => {
  it('backfills strokeUniform/round joins onto a shape saved before that was the default', () => {
    const rect = obj({ type: 'rect' })
    const canvas = { getObjects: () => [rect] } as unknown as fabric.StaticCanvas
    migrateStrokeDefaults(canvas)
    expect(rect.set).toHaveBeenCalledWith({ strokeUniform: true, strokeLineJoin: 'round' })
  })

  it('skips text and images — the Style panel never offered them a stroke', () => {
    const text = obj({ type: 'textbox' })
    const image = obj({ type: 'image' })
    const canvas = { getObjects: () => [text, image] } as unknown as fabric.StaticCanvas
    migrateStrokeDefaults(canvas)
    expect(text.set).not.toHaveBeenCalled()
    expect(image.set).not.toHaveBeenCalled()
  })

  it('leaves effect clones alone — they force strokeWidth 0 on purpose', () => {
    const clone = obj({ type: 'rect', effectHostId: 'host-1' })
    const canvas = { getObjects: () => [clone] } as unknown as fabric.StaticCanvas
    migrateStrokeDefaults(canvas)
    expect(clone.set).not.toHaveBeenCalled()
  })

  it('recurses into group children so nested shapes get migrated too', () => {
    const child = obj({ type: 'triangle' })
    const group = obj({ type: 'group', getObjects: () => [child] })
    const canvas = { getObjects: () => [group] } as unknown as fabric.StaticCanvas
    migrateStrokeDefaults(canvas)
    expect(group.set).toHaveBeenCalledWith({ strokeUniform: true, strokeLineJoin: 'round' })
    expect(child.set).toHaveBeenCalledWith({ strokeUniform: true, strokeLineJoin: 'round' })
  })
})

describe('distributeStarts', () => {
  it('spaces equal-width items with equal gaps, outer edges fixed', () => {
    // three 10-wide items spanning 0..100 → gaps of (70/2)=35
    const out = distributeStarts([
      { start: 0, size: 10 },
      { start: 40, size: 10 },
      { start: 90, size: 10 },
    ])
    expect(out).toEqual([0, 45, 90])
  })
  it('accounts for differing sizes', () => {
    // sizes 10, 20, 10 across 0..100 → free space 60, gap 30
    const out = distributeStarts([
      { start: 0, size: 10 },
      { start: 30, size: 20 },
      { start: 90, size: 10 },
    ])
    expect(out).toEqual([0, 40, 90])
  })
})
