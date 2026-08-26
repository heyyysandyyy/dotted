import { describe, it, expect } from 'vitest'
import {
  PRODUCT_TEMPLATES,
  PRODUCT_DPI,
  findProductTemplate,
  productCanvasSize,
  productGuideSpec,
  productsInCategory,
  pxToInches,
} from './products'

describe('PRODUCT_TEMPLATES (PROD-001)', () => {
  it('ships the six pin and magnet sizes the ticket calls for', () => {
    expect(productsInCategory('pin').map((t) => t.diameterIn)).toEqual([1, 1.5, 2.25, 3])
    expect(productsInCategory('magnet').map((t) => t.diameterIn)).toEqual([2, 3])
    expect(PRODUCT_TEMPLATES).toHaveLength(6)
  })

  it('gives every template a unique id, a print dpi and a positive bleed and safe zone', () => {
    const ids = new Set(PRODUCT_TEMPLATES.map((t) => t.id))
    expect(ids.size).toBe(PRODUCT_TEMPLATES.length)
    for (const t of PRODUCT_TEMPLATES) {
      expect(t.dpi).toBe(PRODUCT_DPI)
      expect(t.shape).toBe('circle')
      expect(t.bleedIn).toBeGreaterThan(0)
      expect(t.safeZoneIn).toBeGreaterThan(0)
      // A safe zone that ate the whole face would leave nothing designable.
      expect(t.safeZoneIn).toBeLessThan(t.diameterIn / 2)
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

  it('is square for every circular product', () => {
    for (const t of PRODUCT_TEMPLATES) {
      const { width, height } = productCanvasSize(t)
      expect(width).toBe(height)
      expect(width).toBe(Math.round((t.diameterIn + t.bleedIn * 2) * t.dpi))
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
      diameterPx: 600,
      bleedPx: 37.5,
      safeZonePx: 37.5,
      dpi: 300,
    })
  })

  it('leaves the trim circle inside the artboard, with the bleed as the margin around it', () => {
    for (const t of PRODUCT_TEMPLATES) {
      const spec = productGuideSpec(t)
      const { width } = productCanvasSize(t)
      expect(spec.diameterPx + spec.bleedPx * 2).toBe(width)
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
