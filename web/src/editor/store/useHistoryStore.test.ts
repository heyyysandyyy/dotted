import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fabric from 'fabric'
import { useHistoryStore } from './useHistoryStore'
import { useCanvasStore } from './useCanvasStore'

function projectRaw(id: string): string | null {
  return localStorage.getItem('dotted:project:' + id)
}

describe('useHistoryStore — flushPendingSave (data-loss fix for route navigation)', () => {
  let canvas: fabric.Canvas

  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    canvas = new fabric.Canvas(document.createElement('canvas'), { width: 100, height: 100 })
    useCanvasStore.setState({
      canvas,
      currentProjectId: 'proj-1',
      designName: 'Test',
      width: 100,
      height: 100,
      pages: [{ id: 'page-1', canvas: canvas.toObject() }],
      activePageId: 'page-1',
    })
    useHistoryStore.setState({
      stack: [],
      labels: [],
      index: -1,
      canUndo: false,
      canRedo: false,
      pendingLabel: '',
      isRestoring: false,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('scheduleRecord does not persist until the 300ms debounce elapses', () => {
    useHistoryStore.getState().scheduleRecord('Added image')
    expect(projectRaw('proj-1')).toBeNull()

    vi.advanceTimersByTime(299)
    expect(projectRaw('proj-1')).toBeNull()

    vi.advanceTimersByTime(1)
    expect(projectRaw('proj-1')).not.toBeNull()
  })

  it('flushPendingSave persists immediately, before the debounce would otherwise fire', () => {
    useHistoryStore.getState().scheduleRecord('Added image')
    expect(projectRaw('proj-1')).toBeNull() // still inside the window — this is the bug scenario

    useHistoryStore.getState().flushPendingSave()
    expect(projectRaw('proj-1')).not.toBeNull()
  })

  it('cancels the pending timer so the debounce does not also fire redundantly afterwards', () => {
    useHistoryStore.getState().scheduleRecord('Added image')
    useHistoryStore.getState().flushPendingSave()
    const afterFlush = useHistoryStore.getState().stack.length

    // If the original timer weren't cancelled, this would try to record again —
    // record() is a no-op on an unchanged snapshot, so the stack must not grow.
    vi.advanceTimersByTime(400)
    expect(useHistoryStore.getState().stack.length).toBe(afterFlush)
  })
})
