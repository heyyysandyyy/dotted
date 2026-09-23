import { describe, it, expect } from 'vitest'
import {
  MAX_PRODUCT_IN,
  MIN_PRODUCT_IN,
  PRODUCT_TEMPLATES,
  PRODUCT_DPI,
  buildSheetLayout,
  cellSizePx,
  canChooseShape,
  customProductTemplate,
  isCustomProduct,
  productWithShape,
  isValidProductSize,
  trimSizePx,
  findProductTemplate,
  productArtboardSize,
  productCanvasSize,
  productGuideSpec,
  productMarks,
  productsInCategory,
  pxToInches,
  sheetCapacity,
  sheetCellSize,
  sheetSizePx,
} from './products'

describe('PRODUCT_TEMPLATES (PROD-001)', () => {
  it('ships the pin and magnet sizes the ticket calls for, each category ascending', () => {
    expect(productsInCategory('pin').map((t) => t.widthIn)).toEqual([1, 1.25, 1.5, 2.25, 3])
    expect(productsInCategory('magnet').map((t) => t.widthIn)).toEqual([2, 3])
  })

  it('ships the pad sizes, smallest first, all rectangular (PROD-003)', () => {
    const pads = productsInCategory('notepad')
    expect(pads.map((t) => t.label)).toEqual([
      '3 × 5″ memo pad',
      'Quarter-letter pad',
      '4 × 6″ pad',
      'A6 pad',
      '5 × 7″ pad',
      'Half-letter pad',
      'A5 pad',
    ])
    for (const pad of pads) {
      expect(pad.shape).toBe('rect')
      expect(pad.heightIn).toBeGreaterThan(pad.widthIn)
    }
    // Areas ascend, which is the order the picker shows them in.
    const areas = pads.map((t) => t.widthIn * t.heightIn)
    expect([...areas].sort((a, b) => a - b)).toEqual(areas)
  })

  it('marks a pad at its corners and a pin on its outline (PROD-003)', () => {
    expect(productMarks('notepad')).toBe('corner')
    expect(productMarks('pin')).toBe('outline')
    expect(productMarks('magnet')).toBe('outline')
    expect(productGuideSpec(findProductTemplate('notepad-a6')!).marks).toBe('corner')
    expect(productGuideSpec(findProductTemplate('pin-1')!).marks).toBe('outline')
  })

  it('gives every template a unique id, a print dpi and a positive bleed and safe zone', () => {
    const ids = new Set(PRODUCT_TEMPLATES.map((t) => t.id))
    expect(ids.size).toBe(PRODUCT_TEMPLATES.length)
    for (const t of PRODUCT_TEMPLATES) {
      expect(t.dpi).toBe(PRODUCT_DPI)
      expect(t.shape).toBe(t.category === 'notepad' ? 'rect' : 'circle')
      expect(t.bleedIn).toBeGreaterThan(0)
      expect(t.safeZoneIn).toBeGreaterThan(0)
      // A safe zone that ate the whole face would leave nothing designable.
      expect(t.safeZoneIn).toBeLessThan(t.widthIn / 2)
    }
  })

  it('finds a template by id and reports nothing for an unknown one', () => {
    expect(findProductTemplate(PRODUCT_TEMPLATES[0].id)).toBe(PRODUCT_TEMPLATES[0])
    expect(findProductTemplate('pin-42')).toBeNull()
  })
})

describe('productCanvasSize', () => {
  it('is the trim size plus bleed on both sides, at the template dpi', () => {
    const pin = findProductTemplate('pin-2-25')!
    // 2.25in + 2 x 0.25in bleed = 2.75in at 300dpi.
    expect(productCanvasSize(pin)).toEqual({ width: 825, height: 825 })
  })

  it('is the product plus its bleed on each side, square only when the product is', () => {
    for (const t of PRODUCT_TEMPLATES) {
      const { width, height } = productCanvasSize(t)
      expect(width).toBe(Math.round((t.widthIn + t.bleedIn * 2) * t.dpi))
      expect(height).toBe(Math.round((t.heightIn + t.bleedIn * 2) * t.dpi))
      if (t.shape === 'circle') expect(width).toBe(height)
    }
  })
})

describe('productGuideSpec', () => {
  it('resolves the inch measurements to px once, keeping the id and label', () => {
    const magnet = findProductTemplate('magnet-2')!
    expect(productGuideSpec(magnet)).toEqual({
      templateId: 'magnet-2',
      label: '2″ magnet',
      shape: 'circle',
      trimWidthPx: 600,
      trimHeightPx: 600,
      bleedPx: 37.5,
      safeZonePx: 37.5,
      dpi: 300,
      marks: 'outline',
    })
  })

  it('leaves the trim circle inside the artboard, with the bleed as the margin around it', () => {
    for (const t of PRODUCT_TEMPLATES) {
      const spec = productGuideSpec(t)
      const { width } = productCanvasSize(t)
      expect(spec.trimWidthPx + spec.bleedPx * 2).toBe(width)
    }
  })
})

describe('pxToInches', () => {
  it('formats a px length back to inches without trailing zeros', () => {
    expect(pxToInches(75, 300)).toBe('0.25 in')
    expect(pxToInches(300, 300)).toBe('1 in')
    expect(pxToInches(37.5, 300)).toBe('0.125 in')
  })
})

describe('multi-up sheets (PROD-001)', () => {
  const pin = findProductTemplate('pin-2-25')!

  it('sizes each paper at the product’s own print resolution', () => {
    expect(sheetSizePx('letter', 300)).toEqual({ width: 2550, height: 3300 })
    expect(sheetSizePx('a4', 300)).toEqual({ width: 2480, height: 3508 })
  })

  it('fits as many whole cells as the paper allows once its margin is taken off', () => {
    // 2.75in cells on 8.5x11in with a 0.25in margin all round: 8in / 2.75 = 2
    // across, 10.5in / 2.75 = 3 down.
    expect(sheetCapacity(pin, 'letter')).toMatchObject({ columns: 2, rows: 3, max: 6 })
    // A4 is narrower but taller, so the same pin gets an extra row.
    expect(sheetCapacity(pin, 'a4')).toMatchObject({ columns: 2, rows: 4, max: 8 })
    expect(sheetCapacity(findProductTemplate('pin-1')!, 'letter').max).toBe(35)
  })

  it('builds a grid only as tall as the count reaches', () => {
    expect(buildSheetLayout(pin, { sheetId: 'letter', count: 3 })).toEqual({
      sheetId: 'letter',
      label: 'US Letter',
      columns: 2,
      rows: 2,
      count: 3,
      rotated: false,
    })
  })

  it('clamps the count to what fits, and to at least one', () => {
    expect(buildSheetLayout(pin, { sheetId: 'letter', count: 99 })?.count).toBe(6)
    expect(buildSheetLayout(pin, { sheetId: 'letter', count: 0 })?.count).toBe(1)
  })

  it('reports no layout at all for a product too big to gang up', () => {
    const oversized = { ...pin, widthIn: 20, heightIn: 20 }
    expect(sheetCapacity(oversized, 'letter').max).toBe(0)
    expect(buildSheetLayout(oversized, { sheetId: 'letter', count: 2 })).toBeNull()
  })

  it('makes the artboard the paper when ganging up, and the product itself otherwise', () => {
    const layout = buildSheetLayout(pin, { sheetId: 'letter', count: 6 })
    expect(productArtboardSize(pin, layout)).toEqual({ width: 2550, height: 3300 })
    expect(productArtboardSize(pin, null)).toEqual({ width: 825, height: 825 })
  })

  it('carries the layout on the guide spec, leaving a single product without one', () => {
    const layout = buildSheetLayout(pin, { sheetId: 'a4', count: 8 })
    expect(productGuideSpec(pin, layout).sheet).toEqual(layout)
    expect(productGuideSpec(pin).sheet).toBeUndefined()
  })

  it('keeps the cell size the product’s own artboard, sheet or not', () => {
    const layout = buildSheetLayout(pin, { sheetId: 'letter', count: 6 })
    expect(cellSizePx(productGuideSpec(pin, layout))).toEqual({ width: 825, height: 825 })
    expect(cellSizePx(productGuideSpec(pin))).toEqual({ width: 825, height: 825 })
  })
})

describe('customProductTemplate (PROD-001)', () => {
  it('takes the typed size as the product’s own, not the page’s', () => {
    const magnet = customProductTemplate('magnet', 'rect', 2, 3)

    expect(magnet).toMatchObject({ shape: 'rect', widthIn: 2, heightIn: 3, category: 'magnet' })
    // The page is the product plus its bleed on all four sides — a 2 × 3in
    // magnet at 300dpi with a 0.125in magnet bleed.
    expect(productCanvasSize(magnet)).toEqual({ width: 675, height: 975 })
  })

  it('inherits the category’s margins rather than inventing its own', () => {
    expect(customProductTemplate('magnet', 'rect', 2, 3)).toMatchObject({
      bleedIn: 0.125,
      safeZoneIn: 0.125,
    })
    // A custom pin still wraps like a pin.
    expect(customProductTemplate('pin', 'circle', 2.5, 2.5)).toMatchObject({
      bleedIn: 0.25,
      safeZoneIn: 0.25,
    })
  })

  it('stores a round product as equal sides, so nothing downstream special-cases it', () => {
    const pin25 = customProductTemplate('pin', 'circle', 2.5, 99)

    expect(pin25).toMatchObject({ shape: 'circle', widthIn: 2.5, heightIn: 2.5 })
    expect(pin25.label).toBe('2.5″ pin')
  })

  it('names a rectangle by both sides', () => {
    expect(customProductTemplate('magnet', 'rect', 2, 3).label).toBe('2 × 3″ magnet')
  })

  it('clamps a size nothing could be made at, and reports which ones those are', () => {
    expect(customProductTemplate('magnet', 'rect', 0, 400)).toMatchObject({
      widthIn: MIN_PRODUCT_IN,
      heightIn: MAX_PRODUCT_IN,
    })
    expect(isValidProductSize(0)).toBe(false)
    expect(isValidProductSize(Number.NaN)).toBe(false)
    expect(isValidProductSize(2)).toBe(true)
  })

  it('is recognisable as custom, so the picker can tell it from a preset', () => {
    expect(isCustomProduct(customProductTemplate('magnet', 'rect', 2, 3))).toBe(true)
    expect(isCustomProduct(findProductTemplate('pin-1')!)).toBe(false)
  })

  it('works out how many of a custom size fit on a page, per axis', () => {
    const magnet = customProductTemplate('magnet', 'rect', 2, 3)

    // 2.25 × 3.25in cells on US Letter's 8 × 10.5in usable area.
    expect(sheetCapacity(magnet, 'letter')).toMatchObject({ columns: 3, rows: 3, max: 9 })
    expect(cellSizePx(productGuideSpec(magnet))).toEqual({ width: 675, height: 975 })
  })

  it('makes a tall custom product fit fewer down the page than across it', () => {
    const tall = customProductTemplate('magnet', 'rect', 2, 5)

    expect(sheetCapacity(tall, 'letter')).toMatchObject({ columns: 3, rows: 2, max: 6 })
  })
})

describe('trimSizePx (PROD-001)', () => {
  it('reads a spec’s trim size', () => {
    expect(trimSizePx(productGuideSpec(findProductTemplate('pin-2-25')!))).toEqual({
      width: 675,
      height: 675,
    })
  })

  it('falls back to the diameter designs were saved with before custom sizes', () => {
    const legacy = { ...productGuideSpec(findProductTemplate('pin-2-25')!) }
    delete (legacy as { trimWidthPx?: number }).trimWidthPx
    delete (legacy as { trimHeightPx?: number }).trimHeightPx

    expect(trimSizePx({ ...legacy, diameterPx: 675 } as typeof legacy)).toEqual({
      width: 675,
      height: 675,
    })
  })
})

describe('productWithShape (PROD-001)', () => {
  const magnet2 = findProductTemplate('magnet-2')!

  it('is offered for magnets, which are cut from sheet, and not for pins, which are shells', () => {
    expect(canChooseShape('magnet')).toBe(true)
    expect(canChooseShape('pin')).toBe(false)
  })

  it('squares a preset off at the size it is sold at', () => {
    const square = productWithShape(magnet2, 'rect')

    expect(square).toMatchObject({ shape: 'rect', widthIn: 2, heightIn: 2, id: 'magnet-2-square' })
    expect(square.label).toBe('2″ square magnet')
    // A 2in square plus the magnet bleed, so the artboard stops being the
    // circle's bounding box and becomes the product itself.
    expect(productCanvasSize(square)).toEqual({ width: 675, height: 675 })
  })

  it('keeps the category’s margins — a square magnet is still a magnet', () => {
    expect(productWithShape(magnet2, 'rect')).toMatchObject({
      bleedIn: 0.125,
      safeZoneIn: 0.125,
      category: 'magnet',
    })
  })

  it('costs no yield: a square and a round magnet gang up the same', () => {
    const round3 = findProductTemplate('magnet-3')!
    expect(sheetCapacity(productWithShape(round3, 'rect'), 'letter')).toEqual(
      sheetCapacity(round3, 'letter'),
    )
  })

  it('hands back the preset untouched when it is already that shape', () => {
    expect(productWithShape(magnet2, 'circle')).toBe(magnet2)
  })

  it('rounds a squared preset back off', () => {
    const round = productWithShape(productWithShape(magnet2, 'rect'), 'circle')
    expect(round).toMatchObject({ shape: 'circle', widthIn: 2, heightIn: 2 })
  })
})

describe('ganging pads onto a sheet (PROD-003)', () => {
  const capacityOf = (id: string, sheet: 'letter' | 'a4' = 'letter') =>
    sheetCapacity(findProductTemplate(id)!, sheet)

  it('tiles pads across the whole sheet, since the guillotine trims its edges off', () => {
    // Quarter-letter is a quarter of US Letter: four of them, exactly.
    expect(capacityOf('notepad-quarter-letter')).toMatchObject({ columns: 2, rows: 2, max: 4 })
    // A6 is two across, one down — 5.83″ twice is taller than the sheet.
    expect(capacityOf('notepad-a6')).toMatchObject({ columns: 2, rows: 1, max: 2 })
    expect(capacityOf('notepad-half-letter')).toMatchObject({ columns: 1, rows: 2, max: 2 })
    expect(capacityOf('notepad-3x5')).toMatchObject({ max: 4 })
    // A5 on A4 is the same relationship as half-letter on Letter.
    expect(capacityOf('notepad-a5', 'a4')).toMatchObject({ columns: 1, rows: 2, max: 2 })
  })

  it('turns the pad a quarter where that gangs more of them', () => {
    // Half-letter on Letter and A5 on A4 are the classic two-ups, and both
    // only fit that way round.
    expect(capacityOf('notepad-half-letter').rotated).toBe(true)
    expect(capacityOf('notepad-a5', 'a4').rotated).toBe(true)
    // A6 fits two across upright, so it stays as it is.
    expect(capacityOf('notepad-a6').rotated).toBe(false)
    const layout = buildSheetLayout(findProductTemplate('notepad-half-letter')!, { sheetId: 'letter', count: 2 })!
    expect(layout).toMatchObject({ columns: 1, rows: 2, count: 2, rotated: true })
    // The cells are laid out on their side to match.
    const spec = productGuideSpec(findProductTemplate('notepad-half-letter')!, layout)
    expect(cellSizePx(spec)).toEqual({ width: 2550, height: 1650 })
  })

  it('keeps pins on their own margins and bleed, which they are cut out with', () => {
    const pin = findProductTemplate('pin-1')!
    const cell = productCanvasSize(pin)
    expect(sheetCellSize(pin)).toEqual(cell)
    // 1″ pin + 0.25″ bleed each side = 1.5″ cells inside an 8 × 10.5″ area.
    expect(sheetCapacity(pin, 'letter')).toMatchObject({ columns: 5, rows: 7, max: 35 })
  })

  it('lays a pad cell out at its trim size, so neighbours share one cut line', () => {
    const pad = findProductTemplate('notepad-a6')!
    expect(sheetCellSize(pad)).toEqual({ width: 1240, height: 1748 })
    expect(cellSizePx(productGuideSpec(pad))).toEqual(trimSizePx(productGuideSpec(pad)))
    // A pin's cell still carries its bleed on every side.
    const pinSpec = productGuideSpec(findProductTemplate('pin-1')!)
    expect(cellSizePx(pinSpec).width).toBe(trimSizePx(pinSpec).width + pinSpec.bleedPx * 2)
  })
})
