import { describe, it, expect } from 'vitest'
import { bookSizeLabel, BOOK_BLEED_PX } from './constants'

describe('bookSizeLabel', () => {
  it('matches a known book preset by trim size and shows its marketing name', () => {
    // US Trade preset trim is 1800x2700; a cover page bakes bleed in on both edges.
    const cover = { width: 1800 + BOOK_BLEED_PX * 2, height: 2700 + BOOK_BLEED_PX * 2, bleed: BOOK_BLEED_PX }
    expect(bookSizeLabel(cover)).toBe('US Trade 6×9 in')
  })

  it('falls back to bare dimensions when no preset matches (a custom/resized trim)', () => {
    const cover = { width: 1800 + BOOK_BLEED_PX * 2, height: 2400 + BOOK_BLEED_PX * 2, bleed: BOOK_BLEED_PX }
    expect(bookSizeLabel(cover)).toBe('6×8 in')
  })

  it('handles a missing bleed as zero', () => {
    const cover = { width: 900, height: 1200 }
    expect(bookSizeLabel(cover)).toBe('3×4 in')
  })
})
