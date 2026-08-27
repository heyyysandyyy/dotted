/**
 * Print-product templates (PROD-001) — the presets behind the new-design
 * modal's product entry point.
 *
 * Unlike SIZE_PRESETS (constants.ts), which are screen-space px at 96dpi,
 * a product is described in real-world inches at print resolution: a 2.25"
 * pin is 2.25 inches across whatever the screen is doing. Everything here
 * therefore carries its own `dpi` and converts to px only at the edges.
 */

/** Trim a trailing zero off a size for display: 2.25 → "2.25", 2.0 → "2". */
export function formatIn(value: number): string {
  return String(Number(value.toFixed(3)))
}

export const PRODUCT_CATEGORIES = ['pin', 'magnet'] as const
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number]

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  pin: 'Pins & buttons',
  magnet: 'Magnets',
}

/** Product outline. The stock presets are all round; a custom size can be
 *  either, since a 2 × 3" magnet is a rectangle and a 2.5" pin is not.
 *  PROD-002's die-cut/rounded-rect families extend this union rather than
 *  reworking every consumer's type. */
export type ProductShape = 'circle' | 'rect'

/**
 * One product a design can be started from: what it is, how big, and how much
 * of it survives manufacturing.
 *
 * - `widthIn`/`heightIn` are the finished product's own size (the trim line).
 *   They're equal for a round product, where either one is its diameter.
 * - `bleedIn` is the extra artwork needed *outside* the trim on every side.
 *   For a pin that's the wrap: the paper folds around the shell's edge and
 *   under the back, so a quarter inch of artwork disappears from the face.
 *   For a magnet it's an ordinary print bleed for cutting tolerance.
 * - `safeZoneIn` is how far *inside* the trim to keep anything that must stay
 *   readable — the curve over a pin's edge hides more than a flat magnet's
 *   cut tolerance does, so the two differ.
 */
export interface PresetTemplate {
  id: string
  category: ProductCategory
  label: string
  shape: ProductShape
  widthIn: number
  heightIn: number
  bleedIn: number
  safeZoneIn: number
  dpi: number
}

/** Print resolution every product template is built at. */
export const PRODUCT_DPI = 300

/**
 * How much a category loses around the edge, whatever size it's ordered at.
 * A custom product is still a pin or a magnet — it wraps or gets cut the same
 * way — so the margins come from the category rather than being invented per
 * template or asked of the user.
 */
export const CATEGORY_MARGINS: Record<ProductCategory, { bleedIn: number; safeZoneIn: number }> = {
  pin: { bleedIn: 0.25, safeZoneIn: 0.25 },
  magnet: { bleedIn: 0.125, safeZoneIn: 0.125 },
}

/**
 * Categories whose presets can be ordered in more than one outline. A pin is
 * a shell the artwork wraps around, so round is the only thing it can be; a
 * magnet is cut from sheet stock, where a square is as ordinary as a circle.
 */
export const SHAPEABLE_CATEGORIES: readonly ProductCategory[] = ['magnet']

export function canChooseShape(category: ProductCategory): boolean {
  return SHAPEABLE_CATEGORIES.includes(category)
}

/**
 * A preset in the other outline it can be ordered in: a 2″ magnet as a 2 × 2″
 * square. The side length is the diameter it replaces — that's the size the
 * product is sold at either way — so the artwork area grows but the bleed,
 * safe zone and sheet maths are the ones the category already had.
 */
export function productWithShape(template: PresetTemplate, shape: ProductShape): PresetTemplate {
  if (template.shape === shape) return template
  const side = template.widthIn
  const noun = template.category === 'pin' ? 'pin' : 'magnet'
  return shape === 'rect'
    ? {
        ...template,
        id: `${template.id}-square`,
        label: `${formatIn(side)}″ square ${noun}`,
        shape: 'rect',
        heightIn: side,
      }
    : { ...template, shape: 'circle', heightIn: side }
}

/** Bounds on a custom product's own size, in inches. The floor is about the
 *  smallest thing worth designing artwork for; the ceiling is past the long
 *  edge of any sheet, so an oversized entry lands as "doesn't fit on a page"
 *  (capacity 0) instead of being silently clamped to something else. */
export const MIN_PRODUCT_IN = 0.5
export const MAX_PRODUCT_IN = 12

/** Paper a multi-up sheet can be laid out on. Inches, because that's what the
 *  products are described in; A4 is its millimetre size converted once here. */
export const SHEET_SIZES = [
  { id: 'letter', label: 'US Letter', widthIn: 8.5, heightIn: 11 },
  { id: 'a4', label: 'A4', widthIn: 210 / 25.4, heightIn: 297 / 25.4 },
] as const
export type SheetId = (typeof SHEET_SIZES)[number]['id']

/** Unprintable margin kept clear on every edge of a sheet. Home and office
 *  printers can't reach the paper's edge, and a pin whose bleed lands in that
 *  band comes out with a white crescent — so it's taken off the usable area
 *  before working out how many fit. */
export const SHEET_MARGIN_IN = 0.25

export function findSheet(id: SheetId) {
  return SHEET_SIZES.find((s) => s.id === id) ?? SHEET_SIZES[0]
}

const round = (category: ProductCategory, diameterIn: number, label: string): PresetTemplate => ({
  id: `${category}-${String(diameterIn).replace('.', '-')}`,
  category,
  label,
  shape: 'circle',
  widthIn: diameterIn,
  heightIn: diameterIn,
  ...CATEGORY_MARGINS[category],
  dpi: PRODUCT_DPI,
})

/** The six stock products PROD-001 ships, in the order the picker shows them.
 *  Any other size is reachable as a custom one (customProductTemplate). */
export const PRODUCT_TEMPLATES: PresetTemplate[] = [
  round('pin', 1, '1″ pin'),
  round('pin', 1.5, '1.5″ pin'),
  round('pin', 2.25, '2.25″ pin'),
  round('pin', 3, '3″ pin'),
  round('magnet', 2, '2″ magnet'),
  round('magnet', 3, '3″ magnet'),
]

export function productsInCategory(category: ProductCategory): PresetTemplate[] {
  return PRODUCT_TEMPLATES.filter((t) => t.category === category)
}

export function findProductTemplate(id: string): PresetTemplate | null {
  return PRODUCT_TEMPLATES.find((t) => t.id === id) ?? null
}

/** Whether a custom entry is a size something can actually be made at. NaN
 *  and empty inputs fail this too, since every comparison against NaN is
 *  false. */
export function isValidProductSize(value: number): boolean {
  return value >= MIN_PRODUCT_IN && value <= MAX_PRODUCT_IN
}

/**
 * A product at a size the user typed rather than one of the six presets
 * (PROD-001). The dimensions are the *product's* — a 2 × 3 magnet is a magnet
 * you could hold, not a 2 × 3 page — so everything downstream (artboard size,
 * guides, how many fit on a sheet) falls out of the same maths the presets go
 * through, and the sheet is what decides the page size.
 *
 * Sizes are clamped rather than rejected: the panel keeps the raw text so
 * half-typed input isn't fought with, and the template it builds is always
 * makeable.
 */
export function customProductTemplate(
  category: ProductCategory,
  shape: ProductShape,
  widthIn: number,
  heightIn: number,
): PresetTemplate {
  const clamp = (v: number) => Math.min(MAX_PRODUCT_IN, Math.max(MIN_PRODUCT_IN, v || MIN_PRODUCT_IN))
  const w = clamp(widthIn)
  // A circle is stored as equal sides so no consumer has to special-case it;
  // the width input is the diameter the panel shows.
  const h = shape === 'circle' ? w : clamp(heightIn)
  const noun = category === 'pin' ? 'pin' : 'magnet'
  return {
    id: `custom-${category}`,
    category,
    label: shape === 'circle' ? `${formatIn(w)}″ ${noun}` : `${formatIn(w)} × ${formatIn(h)}″ ${noun}`,
    shape,
    widthIn: w,
    heightIn: h,
    ...CATEGORY_MARGINS[category],
    dpi: PRODUCT_DPI,
  }
}

/** Whether a template came from the custom-size inputs rather than the preset
 *  grid — the panel's chips key off this, and so does the modal's thumbnail. */
export function isCustomProduct(template: PresetTemplate): boolean {
  return template.id.startsWith('custom-')
}

/**
 * The artboard a product design is created at: the trim size plus bleed on
 * every side, in px at the template's own dpi. Square for a round product —
 * the artwork is a sheet the shape is cut out of, which is also why the guides
 * (productGuides.ts) matter: nothing on screen shows where that cut lands
 * without them.
 */
export function productCanvasSize(template: PresetTemplate): { width: number; height: number } {
  return {
    width: Math.round((template.widthIn + template.bleedIn * 2) * template.dpi),
    height: Math.round((template.heightIn + template.bleedIn * 2) * template.dpi),
  }
}

/**
 * How many of a product are ganged up on one sheet, and in what grid.
 *
 * Only the shape of the grid is stored, not the cell positions: the grid is
 * always centred in the artboard, so every consumer can recompute the same
 * positions from this plus the page size (see productCellCentres). Absent
 * means one product on its own artboard.
 */
export interface ProductSheetLayout {
  sheetId: SheetId
  label: string
  columns: number
  rows: number
  /** How many cells are actually in use — the last row can be partial. */
  count: number
}

/** What the setup panel hands to the store: a sheet and how many to put on it. */
export interface ProductSheetChoice {
  sheetId: SheetId
  count: number
}

/**
 * What a page carries so its guides can be drawn: the same geometry, resolved
 * to px once, at creation time.
 *
 * Deliberately not just the template id — a saved design keeps the shape it
 * was made at even if the preset list is later edited or renumbered
 * (PROD-002 extends this list), a custom size has no preset to look up at all,
 * and the drawing code never has to resolve anything. The id rides along for
 * display and future re-templating.
 */
export interface ProductGuideSpec {
  templateId: string
  label: string
  shape: ProductShape
  /** Finished (trim) size in px. Equal on both axes for a round product. */
  trimWidthPx: number
  trimHeightPx: number
  /** Bleed margin outside the trim, per side, in px. */
  bleedPx: number
  /** Safe-zone inset inside the trim, in px. */
  safeZonePx: number
  dpi: number
  /** Multi-up layout (absent for a single product on its own artboard). */
  sheet?: ProductSheetLayout
  /**
   * Pre-custom-size designs stored one diameter instead of a trim size, and
   * they're sitting in localStorage — trimSizePx below reads this when the
   * pair above is missing. Written by nothing; only ever read.
   *
   * @deprecated superseded by trimWidthPx/trimHeightPx.
   */
  diameterPx?: number
}

/** A spec's trim size, tolerating the pre-custom-size shape that carried a
 *  single `diameterPx` (see above) so old saved designs still draw. */
export function trimSizePx(spec: ProductGuideSpec): { width: number; height: number } {
  const width = spec.trimWidthPx ?? spec.diameterPx ?? 0
  const height = spec.trimHeightPx ?? spec.diameterPx ?? 0
  return { width, height }
}

/** A sheet's size in px at a template's print resolution. */
export function sheetSizePx(sheetId: SheetId, dpi: number): { width: number; height: number } {
  const sheet = findSheet(sheetId)
  return { width: Math.round(sheet.widthIn * dpi), height: Math.round(sheet.heightIn * dpi) }
}

/**
 * How many of a product fit on a sheet, as a grid. Cells sit edge to edge:
 * each one already carries its own bleed, so the space between two trim lines
 * is two bleeds wide — enough to cut both — and adding a gutter on top would
 * only cost yield.
 *
 * Cells keep the orientation they were typed in. Rotating a rectangle 90° can
 * fit more per sheet (a 2 × 3 gets 9 either way, but a 2 × 4 gets 6 upright
 * and 8 on its side), which is a yield optimisation PROD-002 can make once
 * there's a UI to say which way up the artwork is meant to be.
 */
export function sheetCapacity(
  template: PresetTemplate,
  sheetId: SheetId,
): { columns: number; rows: number; max: number } {
  const cell = productCanvasSize(template)
  const sheet = sheetSizePx(sheetId, template.dpi)
  const margin = Math.round(SHEET_MARGIN_IN * template.dpi)
  const columns = Math.max(0, Math.floor((sheet.width - margin * 2) / cell.width))
  const rows = Math.max(0, Math.floor((sheet.height - margin * 2) / cell.height))
  return { columns, rows, max: columns * rows }
}

/**
 * Resolve a sheet choice into the layout stored on the page, clamping the
 * count to what actually fits. Returns null when the product doesn't fit on
 * that sheet at all, so callers fall back to a single-product artboard rather
 * than creating a page with a zero-column grid.
 */
export function buildSheetLayout(
  template: PresetTemplate,
  choice: ProductSheetChoice,
): ProductSheetLayout | null {
  const { columns, max } = sheetCapacity(template, choice.sheetId)
  if (max <= 0) return null
  const count = Math.max(1, Math.min(Math.round(choice.count) || 1, max))
  return {
    sheetId: choice.sheetId,
    label: findSheet(choice.sheetId).label,
    columns,
    // Only as many rows as the count actually reaches, so the grid centres on
    // what's there instead of leaving a blank band where unused rows would be.
    rows: Math.ceil(count / columns),
    count,
  }
}

/** The page size for a product design: the sheet when ganging up, otherwise
 *  the product's own artboard. */
export function productArtboardSize(
  template: PresetTemplate,
  layout: ProductSheetLayout | null,
): { width: number; height: number } {
  return layout ? sheetSizePx(layout.sheetId, template.dpi) : productCanvasSize(template)
}

export function productGuideSpec(
  template: PresetTemplate,
  layout: ProductSheetLayout | null = null,
): ProductGuideSpec {
  const trimWidthPx = Math.round(template.widthIn * template.dpi)
  const trimHeightPx = Math.round(template.heightIn * template.dpi)
  const canvas = productCanvasSize(template)
  return {
    templateId: template.id,
    label: template.label,
    shape: template.shape,
    trimWidthPx,
    trimHeightPx,
    // Derived from the artboard rather than from bleedIn directly, so the trim
    // line plus its margin always adds up to exactly the canvas the design is
    // created at. Rounding the two independently doesn't: a 2" magnet's
    // 0.125in bleed is 37.5px, and rounding that to 38 would put the tinted
    // margin a pixel outside the artboard on each side.
    bleedPx: (canvas.width - trimWidthPx) / 2,
    // Left unrounded on purpose, like bleedPx above: a magnet's 0.125in is
    // 37.5px, and rounding it would both shift the drawn outline by half a
    // pixel and make the panel report it back as "0.127 in".
    safeZonePx: template.safeZoneIn * template.dpi,
    dpi: template.dpi,
    ...(layout ? { sheet: layout } : {}),
  }
}

/** One product's cell — the trim size plus its bleed margin on every side. */
export function cellSizePx(spec: ProductGuideSpec): { width: number; height: number } {
  const trim = trimSizePx(spec)
  return { width: trim.width + spec.bleedPx * 2, height: trim.height + spec.bleedPx * 2 }
}

/** Format a px length back to inches for display (e.g. "0.25 in"). */
export function pxToInches(px: number, dpi: number): string {
  return `${(px / dpi).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')} in`
}
