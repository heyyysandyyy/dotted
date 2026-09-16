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

  it('is a true no-op when nothing is pending — does not overwrite good data with the current (possibly transitional) state', () => {
    // Establish a real saved baseline first.
    useHistoryStore.getState().scheduleRecord('Added image')
    vi.advanceTimersByTime(DEBOUNCE_MS_FOR_TEST)
    const saved = projectRaw('proj-1')
    expect(saved).not.toBeNull()

    // Simulate the canvas being in some other transitional state — e.g. mid
    // reload, before an async project load has finished — with no edit ever
    // having scheduled a save for it.
    canvas.clear()

    useHistoryStore.getState().flushPendingSave()

    // Regression: this used to unconditionally record() and persist,
    // clobbering the real saved data with a snapshot of the empty canvas.
    expect(projectRaw('proj-1')).toBe(saved)
  })

  it('stays a no-op when a reset cancelled the pending timer — a cleared id must not still read as pending', () => {
    // Put real content on the canvas, so a later clear() is an observable
    // change rather than an empty-to-empty write that record() would skip
    // anyway on its unchanged-snapshot guard.
    canvas.add(new fabric.Rect({ left: 10, top: 10, width: 20, height: 20 }))

    // Baseline on disk, with the rect in it.
    useHistoryStore.getState().scheduleRecord('Added rect')
    vi.advanceTimersByTime(DEBOUNCE_MS_FOR_TEST)
    const saved = projectRaw('proj-1')
    expect(saved).toContain('"Rect"')

    // An edit arms the debounce, then a project open resets history while that
    // timer is still in flight. reset() cancels it, so nothing is pending.
    useHistoryStore.getState().scheduleRecord('Moved rect')
    useHistoryStore.getState().reset()

    // The transitional canvas: mid-load and empty, nothing scheduled for it.
    canvas.clear()
    useHistoryStore.getState().flushPendingSave()

    // Regression: reset() cleared the timeout but left the (now dead) timer id
    // non-null, so flushPendingSave's "nothing pending" guard read it as truthy
    // and recorded anyway, persisting the empty canvas over the real data.
    expect(projectRaw('proj-1')).toBe(saved)
  })
})

const DEBOUNCE_MS_FOR_TEST = 300
