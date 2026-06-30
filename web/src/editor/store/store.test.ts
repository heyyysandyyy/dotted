import { describe, it, expect } from 'vitest'
import { useCanvasStore } from './useCanvasStore'

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
