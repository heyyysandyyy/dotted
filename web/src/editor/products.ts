/**
 * Print-product templates (PROD-001) — the presets behind the new-design
 * modal's product entry point.
 *
 * Unlike SIZE_PRESETS (constants.ts), which are screen-space px at 96dpi,
 * a product is described in real-world inches at print resolution: a 2.25"
 * pin is 2.25 inches across whatever the screen is doing. Everything here
 * therefore carries its own `dpi` and converts to px only at the edges.
 */

export const PRODUCT_CATEGORIES = ['pin', 'magnet'] as const
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number]

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  pin: 'Pins & buttons',
  magnet: 'Magnets',
}

/** Product outline. Only circular products ship in PROD-001; the union exists
 *  so PROD-002's die-cut/rounded-rect families extend it rather than reworking
 *  every consumer's type. */
export type ProductShape = 'circle'

/**
 * One product a design can be started from: what it is, how big, and how much
 * of it survives manufacturing.
 *
 * - `diameterIn` is the finished product's own size (the trim circle).
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
  diameterIn: number
  bleedIn: number
  safeZoneIn: number
  dpi: number
}

/** Print resolution every product template is built at. */
export const PRODUCT_DPI = 300

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

const pin = (diameterIn: number, label: string): PresetTemplate => ({
  id: `pin-${String(diameterIn).replace('.', '-')}`,
  category: 'pin',
  label,
  shape: 'circle',
  diameterIn,
  bleedIn: 0.25,
  safeZoneIn: 0.25,
  dpi: PRODUCT_DPI,
})

const magnet = (diameterIn: number, label: string): PresetTemplate => ({
  id: `magnet-${String(diameterIn).replace('.', '-')}`,
  category: 'magnet',
  label,
  shape: 'circle',
  diameterIn,
  bleedIn: 0.125,
  safeZoneIn: 0.125,
  dpi: PRODUCT_DPI,
})

/** The six products PROD-001 ships, in the order the picker shows them. */
export const PRODUCT_TEMPLATES: PresetTemplate[] = [
  pin(1, '1″ pin'),
  pin(1.5, '1.5″ pin'),
  pin(2.25, '2.25″ pin'),
  pin(3, '3″ pin'),
  magnet(2, '2″ magnet'),
  magnet(3, '3″ magnet'),
]

export function productsInCategory(category: ProductCategory): PresetTemplate[] {
  return PRODUCT_TEMPLATES.filter((t) => t.category === category)
}

export function findProductTemplate(id: string): PresetTemplate | null {
  return PRODUCT_TEMPLATES.find((t) => t.id === id) ?? null
}

/**
 * The artboard a product design is created at: the trim size plus bleed on
 * every side, in px at the template's own dpi. Square for a circular product
 * — the artwork is a square sheet the shape is cut out of, which is also why
 * the guides (productGuides.ts) matter: nothing on screen shows where that
 * cut lands without them.
 */
export function productCanvasSize(template: PresetTemplate): { width: number; height: number } {
  const px = Math.round((template.diameterIn + template.bleedIn * 2) * template.dpi)
  return { width: px, height: px }
}

/**
 * What a page carries so its guides can be drawn: the same geometry, resolved
 * to px once, at creation time.
 *
 * Deliberately not just the template id — a saved design keeps the shape it
 * was made at even if the preset list is later edited or renumbered
 * (PROD-002 extends this list), and the drawing code never has to look a
 * preset up. The id rides along for display and future re-templating.
 */
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

export interface ProductGuideSpec {
  templateId: string
  label: string
  shape: ProductShape
  /** Finished (trim) diameter in px. */
  diameterPx: number
  /** Bleed margin outside the trim, per side, in px. */
  bleedPx: number
  /** Safe-zone inset inside the trim, in px. */
  safeZonePx: number
  dpi: number
  /** Multi-up layout (absent for a single product on its own artboard). */
  sheet?: ProductSheetLayout
}

/** A sheet's size in px at a template's print resolution. */
export function sheetSizePx(sheetId: SheetId, dpi: number): { width: number; height: number } {
  const sheet = findSheet(sheetId)
  return { width: Math.round(sheet.widthIn * dpi), height: Math.round(sheet.heightIn * dpi) }
}

/**
 * How many of a product fit on a sheet, as a grid. Cells sit edge to edge:
 * each one already carries its own bleed, so the space between two trim
 * circles is two bleeds wide — enough to cut both — and adding a gutter on top
 * would only cost yield.
 */
export function sheetCapacity(
  template: PresetTemplate,
  sheetId: SheetId,
): { columns: number; rows: number; max: number } {
  const cell = productCanvasSize(template).width
  const sheet = sheetSizePx(sheetId, template.dpi)
  const margin = Math.round(SHEET_MARGIN_IN * template.dpi)
  const columns = Math.max(0, Math.floor((sheet.width - margin * 2) / cell))
  const rows = Math.max(0, Math.floor((sheet.height - margin * 2) / cell))
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
 *  the product's own square artboard. */
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
  const diameterPx = Math.round(template.diameterIn * template.dpi)
  return {
    templateId: template.id,
    label: template.label,
    shape: template.shape,
    diameterPx,
    // Derived from the artboard rather than from bleedIn directly, so the trim
    // circle plus its margin always adds up to exactly the canvas the design
    // is created at. Rounding the two independently doesn't: a 2" magnet's
    // 0.125in bleed is 37.5px, and rounding that to 38 would put the tinted
    // margin a pixel outside the artboard on each side.
    bleedPx: (productCanvasSize(template).width - diameterPx) / 2,
    // Left unrounded on purpose, like bleedPx above: a magnet's 0.125in is
    // 37.5px, and rounding it would both shift the drawn circle by half a
    // pixel and make the panel report it back as "0.127 in".
    safeZonePx: template.safeZoneIn * template.dpi,
    dpi: template.dpi,
    ...(layout ? { sheet: layout } : {}),
  }
}

/** One product's square cell — the trim circle plus its bleed margin. */
export function cellSizePx(spec: ProductGuideSpec): number {
  return spec.diameterPx + spec.bleedPx * 2
}

/** Format a px length back to inches for display (e.g. "0.25 in"). */
export function pxToInches(px: number, dpi: number): string {
  return `${(px / dpi).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')} in`
}
