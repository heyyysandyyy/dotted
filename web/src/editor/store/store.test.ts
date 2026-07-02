import { describe, it, expect } from 'vitest'
import { useCanvasStore } from './useCanvasStore'
import { BOOK_PRESETS, BOOK_BLEED_PX } from '../constants'

// Importing the store runs the slice composition and the lazy circular import
// with useHistoryStore — this guards against the store failing to initialize
// after the REFACTOR-001 split into slices.
describe('useCanvasStore composition', () => {
  const s = useCanvasStore.getState()

  it('has the default state from every slice', () => {
    // objects slice
    expect(s.canvas).toBeNull()
    expect(s.selection).toEqual([])
    expect(s.painterMode).toBe('off')
    // project slice
    expect(s.viewMode).toBe('single')
    expect(s.designName).toBe('Untitled design')
    expect(s.currentProjectId).toBeNull()
    // view slice
    expect(s.snapMode).toBe('guides')
    expect(s.showRulers).toBe(true)
    expect(s.grid.size).toBeGreaterThan(0)
  })

  it('exposes a representative action from every slice', () => {
    expect(typeof s.newProject).toBe('function') // project
    expect(typeof s.toggleGrid).toBe('function') // view
    expect(typeof s.addText).toBe('function') // objects
  })
})

describe('newBookProject (UX-015)', () => {
  it('builds one cover page + pageCount/2 spread pages, sized with bleed', () => {
    const preset = BOOK_PRESETS[0] // US Trade, 1800x2700
    useCanvasStore.getState().newBookProject(preset, 24)
    const { pages, activePageId, width, height } = useCanvasStore.getState()

    expect(pages).toHaveLength(1 + 12) // 1 cover + 24/2 spreads
    const cover = pages[0]
    expect(cover.type).toBe('cover')
    expect(cover.width).toBe(preset.width + BOOK_BLEED_PX * 2)
    expect(cover.height).toBe(preset.height + BOOK_BLEED_PX * 2)
    expect(activePageId).toBe(cover.id)
    // Active page's size mirrors onto the top-level width/height (every other
    // page-switch path in projectSlice relies on this invariant).
    expect(width).toBe(cover.width)
    expect(height).toBe(cover.height)

    const spread = pages[1]
    expect(spread.type).toBe('spread')
    expect(spread.width).toBe(preset.width * 2 + BOOK_BLEED_PX * 2)
    expect(spread.height).toBe(preset.height + BOOK_BLEED_PX * 2)
    // Every page has a distinct id.
    expect(new Set(pages.map((p) => p.id)).size).toBe(pages.length)
  })

  it('rounds an odd page count up to the next even number of spreads', () => {
    const preset = BOOK_PRESETS[0]
    useCanvasStore.getState().newBookProject(preset, 5)
    expect(useCanvasStore.getState().pages).toHaveLength(1 + 3) // ceil(5/2) = 3
  })
})
