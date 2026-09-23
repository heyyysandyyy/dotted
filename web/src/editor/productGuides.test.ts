import { describe, it, expect, vi } from 'vitest'
import {
  cornerMarkSegments,
  drawProductCutLines,
  drawProductGuides,
  productCellCentres,
  productCutLinesSVG,
  PRINT_CUT_LINE_STYLE,
} from './productGuides'
import {
  buildSheetLayout,
  customProductTemplate,
  findProductTemplate,
  productArtboardSize,
  productCanvasSize,
  productGuideSpec,
  trimSizePx,
} from './products'

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
    rect: vi.fn(),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineTo: vi.fn(),
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
      [centre, centre, SPEC.trimWidthPx / 2],
      [centre, centre, SPEC.trimWidthPx / 2],
      [centre, centre, SPEC.trimWidthPx / 2 - SPEC.safeZonePx],
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
    expect(trimRadius).toBe((SPEC.trimWidthPx / 2) * scale)
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
      { ...SPEC, safeZonePx: SPEC.trimWidthPx },
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
      [SIZE.width / 2, SIZE.height / 2, SPEC.trimWidthPx / 2, 0, Math.PI * 2],
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
    expect(markup).toContain(`r="${SPEC.trimWidthPx / 2}"`)
    expect(markup).toContain('stroke-dasharray="24 16"')
    expect(markup).toContain('fill="none"')
  })

  it('carries the cut line only — the safe-zone radius appears nowhere in it', () => {
    const markup = productCutLinesSVG(SPEC, SIZE)
    const safeRadius = SPEC.trimWidthPx / 2 - SPEC.safeZonePx

    expect(markup.match(/<circle /g)).toHaveLength(1)
    expect(markup).not.toContain(`r="${safeRadius}"`)
  })

  it('is empty for a spec with no radius, rather than a stray empty group', () => {
    expect(productCutLinesSVG({ ...SPEC, trimWidthPx: 0, trimHeightPx: 0 }, SIZE)).toBe('')
  })
})

describe('rectangular products (PROD-001 custom sizes)', () => {
  const MAGNET = customProductTemplate('magnet', 'rect', 2, 3)
  const RECT_SPEC = productGuideSpec(MAGNET)
  const RECT_SIZE = productCanvasSize(MAGNET)

  it('outlines the trim as a rectangle centred on its cell, not a circle', () => {
    const ctx = mockCtx()
    drawProductCutLines(ctx, { x: 0, y: 0, ...RECT_SIZE }, RECT_SPEC, 1)

    expect(ctx.arc).not.toHaveBeenCalled()
    // 600 × 900px of trim inside a 675 × 975px artboard: a 37.5px bleed all round.
    expect(vi.mocked(ctx.rect).mock.calls).toEqual([[37.5, 37.5, 600, 900]])
  })

  it('insets the safe zone off both axes, so it stays a rectangle', () => {
    const ctx = mockCtx()
    drawProductGuides(ctx, { x: 0, y: 0, ...RECT_SIZE }, RECT_SPEC, 1)

    // Trim twice (the tint's clip path, then the dashed outline), then the
    // safe zone: 0.125in off every edge of the 600 × 900 face.
    const safe = vi.mocked(ctx.rect).mock.calls.at(-1)
    expect(safe).toEqual([75, 75, 525, 825])
  })

  it('lays a sheet of them out on the grid its own cell size gives', () => {
    const layout = buildSheetLayout(MAGNET, { sheetId: 'letter', count: 9 })!
    const ctx = mockCtx()

    drawProductCutLines(
      ctx,
      { x: 0, y: 0, width: 2550, height: 3300 },
      productGuideSpec(MAGNET, layout),
      1,
    )

    expect(layout).toMatchObject({ columns: 3, rows: 3, count: 9 })
    expect(ctx.rect).toHaveBeenCalledTimes(9)
  })

  it('exports as SVG rects rather than circles', () => {
    const markup = productCutLinesSVG(RECT_SPEC, RECT_SIZE)

    expect(markup).not.toContain('<circle')
    expect(markup).toContain('<rect x="37.5" y="37.5" width="600" height="900"')
  })
})

describe('corner crop marks (PROD-003)', () => {
  const pad = findProductTemplate('notepad-a6')!
  const spec = productGuideSpec(pad)
  const trim = trimSizePx(spec)
  const centre = { x: 500, y: 700 }

  it('puts two marks at each corner, clear of the trim and running outward', () => {
    const segs = cornerMarkSegments(centre, trim.width, trim.height, spec.bleedPx)
    expect(segs).toHaveLength(8)
    const left = centre.x - trim.width / 2
    const top = centre.y - trim.height / 2
    // The pair at the top-left corner: one along the top edge going left, one
    // along the left edge going up. Neither touches the trim corner itself.
    const horizontal = segs.find((s) => s.y1 === top && s.y2 === top && s.x2 < left)!
    const vertical = segs.find((s) => s.x1 === left && s.x2 === left && s.y2 < top)!
    expect(horizontal.x1).toBeLessThan(left)
    expect(vertical.y1).toBeLessThan(top)
    expect(left - horizontal.x1).toBeCloseTo(top - vertical.y1)
  })

  it('never reaches across into the next product on a ganged sheet', () => {
    const segs = cornerMarkSegments(centre, trim.width, trim.height, spec.bleedPx)
    const left = centre.x - trim.width / 2
    const furthest = Math.min(...segs.map((s) => Math.min(s.x1, s.x2)))
    // Two bleeds is the whole gap between neighbouring trims.
    expect(left - furthest).toBeLessThanOrEqual(spec.bleedPx * 2)
  })

  it('draws nothing at all when there is no bleed to put marks in', () => {
    expect(cornerMarkSegments(centre, trim.width, trim.height, 0)).toEqual([])
  })

  it('composites marks, not an outline, into a raster export', () => {
    const ctx = mockCtx()
    drawProductCutLines(ctx, { x: 0, y: 0, width: 1300, height: 1800 }, spec, 1)
    expect(ctx.rect).not.toHaveBeenCalled()
    expect(ctx.arc).not.toHaveBeenCalled()
    expect(ctx.moveTo).toHaveBeenCalledTimes(8)
    expect(ctx.lineTo).toHaveBeenCalledTimes(8)
    // Solid, not dashed: a blade is lined up against these.
    expect(ctx.setLineDash).toHaveBeenCalledWith([])
  })

  it('writes marks into the SVG export too', () => {
    const svg = productCutLinesSVG(spec, productCanvasSize(pad))
    expect(svg.match(/<line /g)).toHaveLength(8)
    expect(svg).not.toContain('<rect')
    expect(svg).not.toContain('stroke-dasharray')
  })

  it('still outlines a pin, on both export paths', () => {
    const pin = productGuideSpec(findProductTemplate('pin-2-25')!)
    const ctx = mockCtx()
    drawProductCutLines(ctx, { x: 0, y: 0, width: 825, height: 825 }, pin, 1)
    expect(ctx.arc).toHaveBeenCalledTimes(1)
    expect(productCutLinesSVG(pin, productCanvasSize(findProductTemplate('pin-2-25')!))).toContain('<circle')
  })

  it('marks every cell of a ganged sheet', () => {
    const sheet = buildSheetLayout(pad, { sheetId: 'letter', count: 4 })!
    const ganged = productGuideSpec(pad, sheet)
    const svg = productCutLinesSVG(ganged, productArtboardSize(pad, sheet))
    expect(svg.match(/<line /g)).toHaveLength(8 * sheet.count)
  })
})

describe('a ganged sheet laid out on its side (PROD-003)', () => {
  const pad = findProductTemplate('notepad-half-letter')!
  const layout = buildSheetLayout(pad, { sheetId: 'letter', count: 2 })!
  const spec = productGuideSpec(pad, layout)
  const size = productArtboardSize(pad, layout)

  it('draws each cell turned a quarter, marks and all', () => {
    const svg = productCutLinesSVG(spec, size)
    const marks = [...svg.matchAll(/<line x1="(-?[\d.]+)" y1="(-?[\d.]+)" x2="(-?[\d.]+)" y2="(-?[\d.]+)"/g)]
    expect(marks).toHaveLength(16)
    // The cut line the two pads share runs across the sheet's middle, so the
    // marks around it sit just above and below it at both ends.
    const middle = size.height / 2
    const nearMiddle = marks.filter(([, , y1]) => Math.abs(Number(y1) - middle) < spec.bleedPx * 2)
    expect(nearMiddle.length).toBeGreaterThan(0)
  })

  it('tiles the sheet edge to edge, leaving no waste band between pads', () => {
    const centres = productCellCentres({ x: 0, y: 0, ...size }, spec, 1)
    expect(centres).toHaveLength(2)
    expect(centres[0].y).toBeCloseTo(size.height / 4)
    expect(centres[1].y).toBeCloseTo((size.height * 3) / 4)
    expect(centres[0].x).toBeCloseTo(size.width / 2)
  })

  it('turns the screen guides too, so what is drawn matches what is cut', () => {
    const ctx = mockCtx()
    drawProductGuides(ctx, { x: 0, y: 0, ...size }, spec, 1)
    // Cells are wider than they are tall once turned: 8.5 × 5.5in.
    const rects = (ctx.rect as unknown as { mock: { calls: number[][] } }).mock.calls
    expect(rects.length).toBeGreaterThan(0)
    for (const [, , w, h] of rects) expect(w).toBeGreaterThan(h)
  })
})
