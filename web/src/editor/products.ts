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
}

export function productGuideSpec(template: PresetTemplate): ProductGuideSpec {
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
  }
}

/** Format a px length back to inches for display (e.g. "0.25 in"). */
export function pxToInches(px: number, dpi: number): string {
  return `${(px / dpi).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')} in`
}
