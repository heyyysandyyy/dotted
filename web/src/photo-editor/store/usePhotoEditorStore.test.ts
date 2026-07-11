import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { usePhotoEditorStore, type PhotoEditorSourceRef } from './usePhotoEditorStore'

const NEUTRAL_HISTORY = { historyStack: [{ brightness: 0, contrast: 0 }], historyIndex: 0 }

const REF: PhotoEditorSourceRef = {
  pageId: 'page-1',
  objectId: 'obj-1',
  left: 10,
  top: 20,
  scaleX: 1,
  scaleY: 1,
  angle: 0,
  zIndex: 2,
}

describe('usePhotoEditorStore (PHOTO-001)', () => {
  beforeEach(() => {
    usePhotoEditorStore.setState({ image: null, sourceRef: null, ...NEUTRAL_HISTORY })
  })

  it('starts with no image loaded', () => {
    expect(usePhotoEditorStore.getState().image).toBeNull()
  })

  it('setImage stores the given data URL', () => {
    usePhotoEditorStore.getState().setImage('data:image/png;base64,abc')
    expect(usePhotoEditorStore.getState().image).toBe('data:image/png;base64,abc')
  })

  it('setImage(null) clears it back to the empty state', () => {
    usePhotoEditorStore.getState().setImage('data:image/png;base64,abc')
    usePhotoEditorStore.getState().setImage(null)
    expect(usePhotoEditorStore.getState().image).toBeNull()
  })
})

describe('usePhotoEditorStore — openFromCanvas (PHOTO-003)', () => {
  beforeEach(() => {
    usePhotoEditorStore.setState({ image: null, sourceRef: null, ...NEUTRAL_HISTORY })
  })

  it('stores both the image and the source reference', () => {
    usePhotoEditorStore.getState().openFromCanvas('data:image/png;base64,abc', REF)
    expect(usePhotoEditorStore.getState().image).toBe('data:image/png;base64,abc')
    expect(usePhotoEditorStore.getState().sourceRef).toEqual(REF)
  })

  it('a plain setImage (direct upload) has no source reference', () => {
    usePhotoEditorStore.getState().openFromCanvas('data:image/png;base64,abc', REF)
    usePhotoEditorStore.getState().setImage('data:image/png;base64,def')
    expect(usePhotoEditorStore.getState().sourceRef).toBeNull()
  })
})

describe('usePhotoEditorStore — adjustments (PHOTO-004)', () => {
  beforeEach(() => {
    // setAdjustment schedules a debounced (real setTimeout) history push
    // (PHOTO-005) on a module-level timer — fake timers keep that pending
    // callback from firing later, mid-assertion, in some other test.
    vi.useFakeTimers()
    usePhotoEditorStore.setState({ image: null, sourceRef: null, adjustments: { brightness: 0, contrast: 0 }, ...NEUTRAL_HISTORY })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts neutral', () => {
    expect(usePhotoEditorStore.getState().adjustments).toEqual({ brightness: 0, contrast: 0 })
  })

  it('setAdjustment updates just the given key', () => {
    usePhotoEditorStore.getState().setAdjustment('brightness', 40)
    expect(usePhotoEditorStore.getState().adjustments).toEqual({ brightness: 40, contrast: 0 })

    usePhotoEditorStore.getState().setAdjustment('contrast', -25)
    expect(usePhotoEditorStore.getState().adjustments).toEqual({ brightness: 40, contrast: -25 })
  })

  it('clamps to -100..100', () => {
    usePhotoEditorStore.getState().setAdjustment('brightness', 500)
    expect(usePhotoEditorStore.getState().adjustments.brightness).toBe(100)

    usePhotoEditorStore.getState().setAdjustment('brightness', -500)
    expect(usePhotoEditorStore.getState().adjustments.brightness).toBe(-100)
  })

  it('resetAdjustment zeroes just that one control', () => {
    usePhotoEditorStore.getState().setAdjustment('brightness', 40)
    usePhotoEditorStore.getState().setAdjustment('contrast', -25)
    usePhotoEditorStore.getState().resetAdjustment('brightness')
    expect(usePhotoEditorStore.getState().adjustments).toEqual({ brightness: 0, contrast: -25 })
  })

  it('a fresh setImage resets adjustments back to neutral', () => {
    usePhotoEditorStore.getState().setAdjustment('brightness', 40)
    usePhotoEditorStore.getState().setImage('data:image/png;base64,new')
    expect(usePhotoEditorStore.getState().adjustments).toEqual({ brightness: 0, contrast: 0 })
  })

  it('openFromCanvas also resets adjustments back to neutral', () => {
    usePhotoEditorStore.getState().setAdjustment('contrast', 40)
    usePhotoEditorStore.getState().openFromCanvas('data:image/png;base64,new', REF)
    expect(usePhotoEditorStore.getState().adjustments).toEqual({ brightness: 0, contrast: 0 })
  })
})

const HISTORY_DEBOUNCE_MS = 300

describe('usePhotoEditorStore — undo/redo (PHOTO-005)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    usePhotoEditorStore.setState({ image: null, sourceRef: null, adjustments: { brightness: 0, contrast: 0 }, ...NEUTRAL_HISTORY })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not push a history step until the debounce settles', () => {
    usePhotoEditorStore.getState().setAdjustment('brightness', 40)
    expect(usePhotoEditorStore.getState().historyStack).toHaveLength(1)

    vi.advanceTimersByTime(HISTORY_DEBOUNCE_MS)
    expect(usePhotoEditorStore.getState().historyStack).toHaveLength(2)
  })

  it('a drag (many onChange calls) collapses into one history step', () => {
    usePhotoEditorStore.getState().setAdjustment('brightness', 10)
    vi.advanceTimersByTime(100)
    usePhotoEditorStore.getState().setAdjustment('brightness', 25)
    vi.advanceTimersByTime(100)
    usePhotoEditorStore.getState().setAdjustment('brightness', 40)
    vi.advanceTimersByTime(HISTORY_DEBOUNCE_MS)

    expect(usePhotoEditorStore.getState().historyStack).toEqual([
      { brightness: 0, contrast: 0 },
      { brightness: 40, contrast: 0 },
    ])
  })

  it('undo steps back to the previous committed value', () => {
    usePhotoEditorStore.getState().setAdjustment('brightness', 40)
    vi.advanceTimersByTime(HISTORY_DEBOUNCE_MS)
    usePhotoEditorStore.getState().setAdjustment('contrast', -30)
    vi.advanceTimersByTime(HISTORY_DEBOUNCE_MS)

    usePhotoEditorStore.getState().undo()

    expect(usePhotoEditorStore.getState().adjustments).toEqual({ brightness: 40, contrast: 0 })
  })

  it('redo re-applies the step undo just backed out of', () => {
    usePhotoEditorStore.getState().setAdjustment('brightness', 40)
    vi.advanceTimersByTime(HISTORY_DEBOUNCE_MS)
    usePhotoEditorStore.getState().undo()

    usePhotoEditorStore.getState().redo()

    expect(usePhotoEditorStore.getState().adjustments).toEqual({ brightness: 40, contrast: 0 })
  })

  it('undo at the start of history is a no-op', () => {
    usePhotoEditorStore.getState().undo()
    expect(usePhotoEditorStore.getState().adjustments).toEqual({ brightness: 0, contrast: 0 })
    expect(usePhotoEditorStore.getState().historyIndex).toBe(0)
  })

  it('redo at the end of history is a no-op', () => {
    usePhotoEditorStore.getState().setAdjustment('brightness', 40)
    vi.advanceTimersByTime(HISTORY_DEBOUNCE_MS)
    usePhotoEditorStore.getState().redo()
    expect(usePhotoEditorStore.getState().adjustments).toEqual({ brightness: 40, contrast: 0 })
  })

  it('a new edit after undo drops the redo branch', () => {
    usePhotoEditorStore.getState().setAdjustment('brightness', 40)
    vi.advanceTimersByTime(HISTORY_DEBOUNCE_MS)
    usePhotoEditorStore.getState().setAdjustment('brightness', 80)
    vi.advanceTimersByTime(HISTORY_DEBOUNCE_MS)
    usePhotoEditorStore.getState().undo() // back to 40, with 80 as a redo step

    usePhotoEditorStore.getState().setAdjustment('brightness', 15)
    vi.advanceTimersByTime(HISTORY_DEBOUNCE_MS)

    expect(usePhotoEditorStore.getState().historyStack).toEqual([
      { brightness: 0, contrast: 0 },
      { brightness: 40, contrast: 0 },
      { brightness: 15, contrast: 0 },
    ])
    usePhotoEditorStore.getState().redo() // nothing to redo — the 80 branch is gone
    expect(usePhotoEditorStore.getState().adjustments.brightness).toBe(15)
  })

  it('setImage clears the history stack back to a single neutral entry', () => {
    usePhotoEditorStore.getState().setAdjustment('brightness', 40)
    vi.advanceTimersByTime(HISTORY_DEBOUNCE_MS)
    usePhotoEditorStore.getState().setImage('data:image/png;base64,new')

    expect(usePhotoEditorStore.getState().historyStack).toEqual([{ brightness: 0, contrast: 0 }])
    expect(usePhotoEditorStore.getState().historyIndex).toBe(0)
  })

  it('a pending debounced push is cancelled by setImage, not applied to the new session', () => {
    usePhotoEditorStore.getState().setAdjustment('brightness', 40) // still pending
    usePhotoEditorStore.getState().setImage('data:image/png;base64,new')
    vi.advanceTimersByTime(HISTORY_DEBOUNCE_MS)

    expect(usePhotoEditorStore.getState().historyStack).toEqual([{ brightness: 0, contrast: 0 }])
  })
})
