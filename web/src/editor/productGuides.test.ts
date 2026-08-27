import { describe, it, expect, vi } from 'vitest'
import {
  drawProductCutLines,
  drawProductGuides,
  productCellCentres,
  productCutLinesSVG,
  PRINT_CUT_LINE_STYLE,
} from './productGuides'
import { buildSheetLayout, findProductTemplate, productCanvasSize, productGuideSpec } from './products'

function mockCtx() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    clip: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
  } as unknown as CanvasRenderingContext2D
}

const PIN = findProductTemplate('pin-2-25')!
const SPEC = productGuideSpec(PIN)
const SIZE = productCanvasSize(PIN)

describe('drawProductGuides (PROD-001)', () => {
  it('tints the whole artboard and clears the trim circle out of it', () => {
    const ctx = mockCtx()
    drawProductGuides(ctx, { x: 0, y: 0, width: SIZE.width, height: SIZE.height }, SPEC, 1)

    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, SIZE.width, SIZE.height)
    expect(ctx.clip).toHaveBeenCalled()
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, SIZE.width, SIZE.height)
    // The clip is scoped, or every later stroke would be confined to the circle.
    expect(ctx.save).toHaveBeenCalled()
    expect(ctx.restore).toHaveBeenCalled()
  })

  it('draws the trim and safe-zone circles concentric on the artboard centre', () => {
    const ctx = mockCtx()
    drawProductGuides(ctx, { x: 0, y: 0, width: SIZE.width, height: SIZE.height }, SPEC, 1)

    const centre = SIZE.width / 2
    const radii = vi.mocked(ctx.arc).mock.calls.map((call) => [call[0], call[1], call[2]])
    // The clip circle, the trim circle, then the safe-zone circle.
    expect(radii).toEqual([
      [centre, centre, SPEC.diameterPx / 2],
      [centre, centre, SPEC.diameterPx / 2],
      [centre, centre, SPEC.diameterPx / 2 - SPEC.safeZonePx],
    ])
    expect(ctx.stroke).toHaveBeenCalledTimes(2)
  })

  it('scales every radius, and offsets from the box, for a zoomed or preview-sized draw', () => {
    const ctx = mockCtx()
    const scale = 0.2
    drawProductGuides(
      ctx,
      { x: 40, y: 10, width: SIZE.width * scale, height: SIZE.height * scale },
      SPEC,
      scale,
    )

    const [cx, cy, trimRadius] = vi.mocked(ctx.arc).mock.calls[1]
    expect(cx).toBe(40 + (SIZE.width * scale) / 2)
    expect(cy).toBe(10 + (SIZE.height * scale) / 2)
    expect(trimRadius).toBe((SPEC.diameterPx / 2) * scale)
  })

  it('draws nothing at a scale where the trim circle has no radius left', () => {
    const ctx = mockCtx()
    drawProductGuides(ctx, { x: 0, y: 0, width: 0, height: 0 }, SPEC, 0)

    expect(ctx.fillRect).not.toHaveBeenCalled()
    expect(ctx.arc).not.toHaveBeenCalled()
  })

  it('skips the safe-zone circle when the safe zone would swallow the whole face', () => {
    const ctx = mockCtx()
    drawProductGuides(
      ctx,
      { x: 0, y: 0, width: SIZE.width, height: SIZE.height },
      { ...SPEC, safeZonePx: SPEC.diameterPx },
      1,
    )

    expect(ctx.stroke).toHaveBeenCalledTimes(1)
  })

  it('leaves no dash pattern set behind it for the next drawing pass', () => {
    const ctx = mockCtx()
    drawProductGuides(ctx, { x: 0, y: 0, width: SIZE.width, height: SIZE.height }, SPEC, 1)

    const lastDash = vi.mocked(ctx.setLineDash).mock.calls.at(-1)
    expect(lastDash).toEqual([[]])
  })
})

describe('productCellCentres (PROD-001 multi-up)', () => {
  it('centres a single product on the artboard', () => {
    expect(productCellCentres({ x: 0, y: 0, width: 825, height: 825 }, SPEC, 1)).toEqual([
      { x: 412.5, y: 412.5 },
    ])
  })

  it('lays a grid out cell by cell and centres the whole block on the sheet', () => {
    const layout = buildSheetLayout(PIN, { sheetId: 'letter', count: 6 })!
    const spec = productGuideSpec(PIN, layout)
    const sheet = { x: 0, y: 0, width: 2550, height: 3300 }

    const centres = productCellCentres(sheet, spec, 1)

    expect(centres).toHaveLength(6)
    // 2 columns x 3 rows of 825px cells = 1650 x 2475, centred on 2550 x 3300.
    expect(centres[0]).toEqual({ x: 450 + 412.5, y: 412.5 + 412.5 })
    expect(centres[1].x - centres[0].x).toBe(825)
    expect(centres[2].y - centres[0].y).toBe(825)
    // Symmetric: the last cell's centre mirrors the first about the sheet.
    expect(centres[5].x).toBe(sheet.width - centres[0].x)
    expect(centres[5].y).toBe(sheet.height - centres[0].y)
  })

  it('stops at the count, leaving a partial last row', () => {
    const layout = buildSheetLayout(PIN, { sheetId: 'letter', count: 5 })!
    const centres = productCellCentres(
      { x: 0, y: 0, width: 2550, height: 3300 },
      productGuideSpec(PIN, layout),
      1,
    )

    expect(centres).toHaveLength(5)
    // Three rows, the last holding one cell in the first column.
    expect(centres[4].x).toBe(centres[0].x)
    expect(centres[4].y - centres[0].y).toBe(1650)
  })

  it('scales cell spacing with everything else', () => {
    const layout = buildSheetLayout(PIN, { sheetId: 'letter', count: 4 })!
    const centres = productCellCentres(
      { x: 0, y: 0, width: 255, height: 330 },
      productGuideSpec(PIN, layout),
      0.1,
    )

    expect(centres[1].x - centres[0].x).toBeCloseTo(82.5)
  })
})

describe('drawProductGuides — multi-up sheets (PROD-001)', () => {
  it('draws a trim and safe-zone circle for every product on the sheet, in two strokes', () => {
    const ctx = mockCtx()
    const layout = buildSheetLayout(PIN, { sheetId: 'letter', count: 6 })!

    drawProductGuides(
      ctx,
      { x: 0, y: 0, width: 2550, height: 3300 },
      productGuideSpec(PIN, layout),
      1,
    )

    // 6 clip circles + 6 trim + 6 safe zone.
    expect(ctx.arc).toHaveBeenCalledTimes(18)
    // Batched into one path per kind rather than one stroke per circle.
    expect(ctx.stroke).toHaveBeenCalledTimes(2)
  })

  it('starts every circle as its own subpath, so the sheet isn’t strung together with chords', () => {
    const ctx = mockCtx()
    const layout = buildSheetLayout(PIN, { sheetId: 'letter', count: 6 })!

    drawProductGuides(
      ctx,
      { x: 0, y: 0, width: 2550, height: 3300 },
      productGuideSpec(PIN, layout),
      1,
    )

    expect(ctx.moveTo).toHaveBeenCalledTimes(18)
  })

  it('clears every trim circle out of the tint, not just the first', () => {
    const ctx = mockCtx()
    const layout = buildSheetLayout(PIN, { sheetId: 'letter', count: 4 })!

    drawProductGuides(
      ctx,
      { x: 0, y: 0, width: 2550, height: 3300 },
      productGuideSpec(PIN, layout),
      1,
    )

    // One clip, one clearRect — the clip takes the union of its four subpaths.
    expect(ctx.clip).toHaveBeenCalledTimes(1)
    expect(ctx.clearRect).toHaveBeenCalledTimes(1)
    expect(vi.mocked(ctx.arc).mock.calls.slice(0, 4).map((c) => [c[0], c[1]])).toEqual(
      productCellCentres(
        { x: 0, y: 0, width: 2550, height: 3300 },
        productGuideSpec(PIN, layout),
        1,
      ).map((c) => [c.x, c.y]),
    )
  })
})

describe('drawProductCutLines (PROD-001 print output)', () => {
  it('strokes the trim circles and nothing else — no tint, no safe zone', () => {
    const ctx = mockCtx()
    drawProductCutLines(ctx, { x: 0, y: 0, width: SIZE.width, height: SIZE.height }, SPEC, 1)

    expect(ctx.fillRect).not.toHaveBeenCalled()
    expect(ctx.clip).not.toHaveBeenCalled()
    expect(ctx.clearRect).not.toHaveBeenCalled()
    expect(ctx.stroke).toHaveBeenCalledTimes(1)
    expect(vi.mocked(ctx.arc).mock.calls).toEqual([
      [SIZE.width / 2, SIZE.height / 2, SPEC.diameterPx / 2, 0, Math.PI * 2],
    ])
  })

  it('draws one per product across a sheet', () => {
    const ctx = mockCtx()
    const layout = buildSheetLayout(PIN, { sheetId: 'letter', count: 6 })!

    drawProductCutLines(
      ctx,
      { x: 0, y: 0, width: 2550, height: 3300 },
      productGuideSpec(PIN, layout),
      1,
    )

    expect(ctx.arc).toHaveBeenCalledTimes(6)
    expect(ctx.stroke).toHaveBeenCalledTimes(1)
  })

  it('scales its stroke and dashes with the artwork, unlike the screen guides', () => {
    const ctx = mockCtx()
    drawProductCutLines(ctx, { x: 0, y: 0, width: 1650, height: 1650 }, SPEC, 2)

    expect(ctx.lineWidth).toBe(PRINT_CUT_LINE_STYLE.widthPx * 2)
    expect(vi.mocked(ctx.setLineDash).mock.calls[0][0]).toEqual(
      PRINT_CUT_LINE_STYLE.dash.map((d) => d * 2),
    )
  })

  it('never leaves a dash pattern or colour behind on the export canvas', () => {
    const ctx = mockCtx()
    drawProductCutLines(ctx, { x: 0, y: 0, width: SIZE.width, height: SIZE.height }, SPEC, 1)

    expect(ctx.save).toHaveBeenCalledTimes(1)
    expect(ctx.restore).toHaveBeenCalledTimes(1)
  })

  it('draws nothing when the trim circle has no radius', () => {
    const ctx = mockCtx()
    drawProductCutLines(ctx, { x: 0, y: 0, width: 0, height: 0 }, SPEC, 0)

    expect(ctx.stroke).not.toHaveBeenCalled()
  })
})

describe('productCutLinesSVG (PROD-001 vector export)', () => {
  it('emits one dashed circle per product, at artboard coordinates', () => {
    const layout = buildSheetLayout(PIN, { sheetId: 'letter', count: 4 })!
    const markup = productCutLinesSVG(productGuideSpec(PIN, layout), { width: 2550, height: 3300 })

    expect(markup.match(/<circle /g)).toHaveLength(4)
    expect(markup).toContain(`r="${SPEC.diameterPx / 2}"`)
    expect(markup).toContain('stroke-dasharray="24 16"')
    expect(markup).toContain('fill="none"')
  })

  it('carries the cut line only — the safe-zone radius appears nowhere in it', () => {
    const markup = productCutLinesSVG(SPEC, SIZE)
    const safeRadius = SPEC.diameterPx / 2 - SPEC.safeZonePx

    expect(markup.match(/<circle /g)).toHaveLength(1)
    expect(markup).not.toContain(`r="${safeRadius}"`)
  })

  it('is empty for a spec with no radius, rather than a stray empty group', () => {
    expect(productCutLinesSVG({ ...SPEC, diameterPx: 0 }, SIZE)).toBe('')
  })
})
