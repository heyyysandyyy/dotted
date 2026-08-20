import { describe, it, expect } from 'vitest'
import { cssFilterFor } from './adjustmentFilter'

describe('cssFilterFor', () => {
  it('is a no-op filter at neutral (0, 0)', () => {
    expect(cssFilterFor({ brightness: 0, contrast: 0 })).toBe('brightness(1) contrast(1)')
  })

  it('maps +100 to double and -100 to zero on each scale', () => {
    expect(cssFilterFor({ brightness: 100, contrast: 100 })).toBe('brightness(2) contrast(2)')
    expect(cssFilterFor({ brightness: -100, contrast: -100 })).toBe('brightness(0) contrast(0)')
  })

  it('maps intermediate values proportionally', () => {
    expect(cssFilterFor({ brightness: 50, contrast: -50 })).toBe('brightness(1.5) contrast(0.5)')
  })
})
