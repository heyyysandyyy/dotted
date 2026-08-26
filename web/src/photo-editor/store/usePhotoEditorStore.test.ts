import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { usePhotoEditorStore, DEFAULT_ADJUSTMENTS, type PhotoEditorSourceRef } from './usePhotoEditorStore'

const NEUTRAL_HISTORY = { historyStack: [DEFAULT_ADJUSTMENTS], historyIndex: 0 }

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

describe('usePhotoEditorStore — adjustments (PHOTO-004 + PHOTO-007 tone controls)', () => {
  beforeEach(() => {
    // setAdjustment schedules a debounced (real setTimeout) history push
    // (PHOTO-005) on a module-level timer — fake timers keep that pending
    // callback from firing later, mid-assertion, in some other test.
    vi.useFakeTimers()
    usePhotoEditorStore.setState({ image: null, sourceRef: null, adjustments: DEFAULT_ADJUSTMENTS, ...NEUTRAL_HISTORY })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts neutral', () => {
    expect(usePhotoEditorStore.getState().adjustments).toEqual(DEFAULT_ADJUSTMENTS)
  })

  it('setAdjustment updates just the given key', () => {
    usePhotoEditorStore.getState().setAdjustment('brightness', 40)
    expect(usePhotoEditorStore.getState().adjustments).toEqual({ ...DEFAULT_ADJUSTMENTS, brightness: 40 })

    usePhotoEditorStore.getState().setAdjustment('contrast', -25)
    expect(usePhotoEditorStore.getState().adjustments).toEqual({ ...DEFAULT_ADJUSTMENTS, brightness: 40, contrast: -25 })
  })

  it('setAdjustment works for the PHOTO-007 tone controls too', () => {
    usePhotoEditorStore.getState().setAdjustment('exposure', 20)
    usePhotoEditorStore.getState().setAdjustment('highlights', -15)
    usePhotoEditorStore.getState().setAdjustment('shadows', 35)
    expect(usePhotoEditorStore.getState().adjustments).toEqual({
      ...DEFAULT_ADJUSTMENTS,
      exposure: 20,
      highlights: -15,
      shadows: 35,
    })
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
    expect(usePhotoEditorStore.getState().adjustments).toEqual({ ...DEFAULT_ADJUSTMENTS, contrast: -25 })
  })

  it('a fresh setImage resets adjustments back to neutral', () => {
    usePhotoEditorStore.getState().setAdjustment('brightness', 40)
    usePhotoEditorStore.getState().setImage('data:image/png;base64,new')
    expect(usePhotoEditorStore.getState().adjustments).toEqual(DEFAULT_ADJUSTMENTS)
  })

  it('openFromCanvas also resets adjustments back to neutral', () => {
    usePhotoEditorStore.getState().setAdjustment('contrast', 40)
    usePhotoEditorStore.getState().openFromCanvas('data:image/png;base64,new', REF)
    expect(usePhotoEditorStore.getState().adjustments).toEqual(DEFAULT_ADJUSTMENTS)
  })
})

describe('usePhotoEditorStore — colour adjustments (PHOTO-007 colour controls)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    usePhotoEditorStore.setState({ image: null, sourceRef: null, adjustments: DEFAULT_ADJUSTMENTS, ...NEUTRAL_HISTORY })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sets each colour slider independently', () => {
    usePhotoEditorStore.getState().setAdjustment('saturation', 40)
    usePhotoEditorStore.getState().setAdjustment('vibrance', -20)
    usePhotoEditorStore.getState().setAdjustment('hue', 75)
    usePhotoEditorStore.getState().setAdjustment('temperature', -35)
    usePhotoEditorStore.getState().setAdjustment('tint', 15)
    usePhotoEditorStore.getState().setAdjustment('redBalance', 10)
    usePhotoEditorStore.getState().setAdjustment('greenBalance', -10)
    usePhotoEditorStore.getState().setAdjustment('blueBalance', 5)

    expect(usePhotoEditorStore.getState().adjustments).toEqual({
      ...DEFAULT_ADJUSTMENTS,
      saturation: 40,
      vibrance: -20,
      hue: 75,
      temperature: -35,
      tint: 15,
      redBalance: 10,
      greenBalance: -10,
      blueBalance: 5,
    })
  })

  it('clamps colour sliders to -100..100 like every other adjustment', () => {
    usePhotoEditorStore.getState().setAdjustment('hue', 900)
    expect(usePhotoEditorStore.getState().adjustments.hue).toBe(100)

    usePhotoEditorStore.getState().setAdjustment('temperature', -900)
    expect(usePhotoEditorStore.getState().adjustments.temperature).toBe(-100)
  })

  it('setToggle flips black & white and invert without touching anything else', () => {
    usePhotoEditorStore.getState().setAdjustment('saturation', 30)
    usePhotoEditorStore.getState().setToggle('blackAndWhite', true)
    usePhotoEditorStore.getState().setToggle('invert', true)
    expect(usePhotoEditorStore.getState().adjustments).toEqual({
      ...DEFAULT_ADJUSTMENTS,
      saturation: 30,
      blackAndWhite: true,
      invert: true,
    })

    usePhotoEditorStore.getState().setToggle('blackAndWhite', false)
    expect(usePhotoEditorStore.getState().adjustments.blackAndWhite).toBe(false)
    expect(usePhotoEditorStore.getState().adjustments.invert).toBe(true)
  })

  it('resetAdjustment returns a toggle to its default, not to 0', () => {
    usePhotoEditorStore.getState().setToggle('invert', true)
    usePhotoEditorStore.getState().resetAdjustment('invert')
    expect(usePhotoEditorStore.getState().adjustments.invert).toBe(false)
  })

  it('a toggle is undoable on the same debounced path as a slider', () => {
    usePhotoEditorStore.getState().setToggle('blackAndWhite', true)
    vi.advanceTimersByTime(300)
    expect(usePhotoEditorStore.getState().historyStack).toHaveLength(2)

    usePhotoEditorStore.getState().undo()
    expect(usePhotoEditorStore.getState().adjustments.blackAndWhite).toBe(false)

    usePhotoEditorStore.getState().redo()
    expect(usePhotoEditorStore.getState().adjustments.blackAndWhite).toBe(true)
  })

  it('a new image resets the colour controls too', () => {
    usePhotoEditorStore.getState().setAdjustment('saturation', 50)
    usePhotoEditorStore.getState().setToggle('invert', true)
    usePhotoEditorStore.getState().setImage('data:image/png;base64,new')
    expect(usePhotoEditorStore.getState().adjustments).toEqual(DEFAULT_ADJUSTMENTS)
  })
})

const HISTORY_DEBOUNCE_MS = 300

describe('usePhotoEditorStore — undo/redo (PHOTO-005)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    usePhotoEditorStore.setState({ image: null, sourceRef: null, adjustments: DEFAULT_ADJUSTMENTS, ...NEUTRAL_HISTORY })
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
      DEFAULT_ADJUSTMENTS,
      { ...DEFAULT_ADJUSTMENTS, brightness: 40 },
    ])
  })

  it('undo steps back to the previous committed value', () => {
    usePhotoEditorStore.getState().setAdjustment('brightness', 40)
    vi.advanceTimersByTime(HISTORY_DEBOUNCE_MS)
    usePhotoEditorStore.getState().setAdjustment('contrast', -30)
    vi.advanceTimersByTime(HISTORY_DEBOUNCE_MS)

    usePhotoEditorStore.getState().undo()

    expect(usePhotoEditorStore.getState().adjustments).toEqual({ ...DEFAULT_ADJUSTMENTS, brightness: 40 })
  })

  it('redo re-applies the step undo just backed out of', () => {
    usePhotoEditorStore.getState().setAdjustment('brightness', 40)
    vi.advanceTimersByTime(HISTORY_DEBOUNCE_MS)
    usePhotoEditorStore.getState().undo()

    usePhotoEditorStore.getState().redo()

    expect(usePhotoEditorStore.getState().adjustments).toEqual({ ...DEFAULT_ADJUSTMENTS, brightness: 40 })
  })

  it('undo at the start of history is a no-op', () => {
    usePhotoEditorStore.getState().undo()
    expect(usePhotoEditorStore.getState().adjustments).toEqual(DEFAULT_ADJUSTMENTS)
    expect(usePhotoEditorStore.getState().historyIndex).toBe(0)
  })

  it('redo at the end of history is a no-op', () => {
    usePhotoEditorStore.getState().setAdjustment('brightness', 40)
    vi.advanceTimersByTime(HISTORY_DEBOUNCE_MS)
    usePhotoEditorStore.getState().redo()
    expect(usePhotoEditorStore.getState().adjustments).toEqual({ ...DEFAULT_ADJUSTMENTS, brightness: 40 })
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
      DEFAULT_ADJUSTMENTS,
      { ...DEFAULT_ADJUSTMENTS, brightness: 40 },
      { ...DEFAULT_ADJUSTMENTS, brightness: 15 },
    ])
    usePhotoEditorStore.getState().redo() // nothing to redo — the 80 branch is gone
    expect(usePhotoEditorStore.getState().adjustments.brightness).toBe(15)
  })

  it('setImage clears the history stack back to a single neutral entry', () => {
    usePhotoEditorStore.getState().setAdjustment('brightness', 40)
    vi.advanceTimersByTime(HISTORY_DEBOUNCE_MS)
    usePhotoEditorStore.getState().setImage('data:image/png;base64,new')

    expect(usePhotoEditorStore.getState().historyStack).toEqual([DEFAULT_ADJUSTMENTS])
    expect(usePhotoEditorStore.getState().historyIndex).toBe(0)
  })

  it('a pending debounced push is cancelled by setImage, not applied to the new session', () => {
    usePhotoEditorStore.getState().setAdjustment('brightness', 40) // still pending
    usePhotoEditorStore.getState().setImage('data:image/png;base64,new')
    vi.advanceTimersByTime(HISTORY_DEBOUNCE_MS)

    expect(usePhotoEditorStore.getState().historyStack).toEqual([DEFAULT_ADJUSTMENTS])
  })
})
