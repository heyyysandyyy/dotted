import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { usePhotoEditorStore, DEFAULT_ADJUSTMENTS, type PhotoEditorSourceRef } from './usePhotoEditorStore'
import { DEFAULT_CURVES, IDENTITY_CURVE } from '../utils/levelsCurves'

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

describe('usePhotoEditorStore — levels and curves (PHOTO-007 levels/curves)', () => {
  beforeEach(() => {
    // Same fake-timer guard as the slider suites above: setLevel/setCurve
    // funnel through the shared debounced history push.
    vi.useFakeTimers()
    usePhotoEditorStore.setState({ adjustments: DEFAULT_ADJUSTMENTS, ...NEUTRAL_HISTORY })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('setLevel clamps each field to its own limits', () => {
    usePhotoEditorStore.getState().setLevel('black', -20)
    expect(usePhotoEditorStore.getState().adjustments.levels.black).toBe(0)

    usePhotoEditorStore.getState().setLevel('gamma', 9)
    expect(usePhotoEditorStore.getState().adjustments.levels.gamma).toBe(3)

    usePhotoEditorStore.getState().setLevel('white', 400)
    expect(usePhotoEditorStore.getState().adjustments.levels.white).toBe(255)
  })

  it('a black point pushed up to the white point shoves the white point out of its way', () => {
    usePhotoEditorStore.getState().setLevel('black', 255)
    expect(usePhotoEditorStore.getState().adjustments.levels).toEqual({ black: 254, white: 255, gamma: 1 })
  })

  it('a white point pushed down onto the black point shoves the black point down', () => {
    usePhotoEditorStore.getState().setLevel('black', 100)
    usePhotoEditorStore.getState().setLevel('white', 100)
    expect(usePhotoEditorStore.getState().adjustments.levels).toEqual({ black: 99, white: 100, gamma: 1 })
  })

  it('resetLevel restores one field and leaves the others alone', () => {
    usePhotoEditorStore.getState().setLevel('black', 30)
    usePhotoEditorStore.getState().setLevel('gamma', 1.8)
    usePhotoEditorStore.getState().resetLevel('gamma')

    expect(usePhotoEditorStore.getState().adjustments.levels).toEqual({ black: 30, white: 255, gamma: 1 })
  })

  it('setCurve normalizes the points on the way in', () => {
    usePhotoEditorStore.getState().setCurve('rgb', [
      { x: 255, y: 255 },
      { x: 128, y: 300 },
      { x: 0, y: -40 },
    ])

    expect(usePhotoEditorStore.getState().adjustments.curves.rgb).toEqual([
      { x: 0, y: 0 },
      { x: 128, y: 255 },
      { x: 255, y: 255 },
    ])
  })

  it('setCurve touches only the channel it names', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 200, y: 100 },
      { x: 255, y: 255 },
    ]
    usePhotoEditorStore.getState().setCurve('r', points)

    const { curves } = usePhotoEditorStore.getState().adjustments
    expect(curves.r).toEqual(points)
    expect(curves.rgb).toEqual(DEFAULT_CURVES.rgb)
    expect(curves.g).toEqual(DEFAULT_CURVES.g)
    expect(curves.b).toEqual(DEFAULT_CURVES.b)
  })

  it('resetCurve puts one channel back to the identity curve', () => {
    usePhotoEditorStore.getState().setCurve('g', [
      { x: 0, y: 40 },
      { x: 255, y: 255 },
    ])
    usePhotoEditorStore.getState().resetCurve('g')

    expect(usePhotoEditorStore.getState().adjustments.curves.g).toEqual(IDENTITY_CURVE)
  })

  it('a curve edit is undoable and redoable like any other adjustment', () => {
    const bent = [
      { x: 0, y: 0 },
      { x: 128, y: 190 },
      { x: 255, y: 255 },
    ]
    usePhotoEditorStore.getState().setCurve('rgb', bent)
    vi.advanceTimersByTime(HISTORY_DEBOUNCE_MS)

    usePhotoEditorStore.getState().undo()
    expect(usePhotoEditorStore.getState().adjustments.curves.rgb).toEqual(IDENTITY_CURVE)

    usePhotoEditorStore.getState().redo()
    expect(usePhotoEditorStore.getState().adjustments.curves.rgb).toEqual(bent)
  })

  it('re-committing structurally identical levels/curves adds no history step', () => {
    usePhotoEditorStore.getState().setLevel('black', 20)
    vi.advanceTimersByTime(HISTORY_DEBOUNCE_MS)
    // A fresh object with the same values every time — an identity check
    // would push a second, indistinguishable undo step here.
    usePhotoEditorStore.getState().setCurve('rgb', [
      { x: 0, y: 0 },
      { x: 255, y: 255 },
    ])
    vi.advanceTimersByTime(HISTORY_DEBOUNCE_MS)

    expect(usePhotoEditorStore.getState().historyStack).toHaveLength(2)
  })

  it('a new image resets levels and curves with everything else', () => {
    usePhotoEditorStore.getState().setLevel('white', 200)
    usePhotoEditorStore.getState().setCurve('b', [
      { x: 0, y: 60 },
      { x: 255, y: 255 },
    ])
    usePhotoEditorStore.getState().setImage('data:image/png;base64,new')

    expect(usePhotoEditorStore.getState().adjustments).toEqual(DEFAULT_ADJUSTMENTS)
  })
})

describe('usePhotoEditorStore — detail adjustments (PHOTO-008)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    usePhotoEditorStore.setState({ image: null, sourceRef: null, adjustments: DEFAULT_ADJUSTMENTS, ...NEUTRAL_HISTORY })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('setAdjustment drives the sharpen, blur and noise controls', () => {
    const store = () => usePhotoEditorStore.getState()
    store().setAdjustment('sharpen', 60)
    store().setAdjustment('blur', 25)
    store().setAdjustment('motionBlur', 40)
    store().setAdjustment('motionBlurAngle', -70)
    store().setAdjustment('noiseReduction', 30)
    store().setAdjustment('grain', 15)

    expect(store().adjustments).toMatchObject({
      sharpen: 60,
      blur: 25,
      motionBlur: 40,
      motionBlurAngle: -70,
      noiseReduction: 30,
      grain: 15,
    })
  })

  it.each(['sharpen', 'sharpenRadius', 'blur', 'motionBlur', 'noiseReduction', 'grain'] as const)(
    'clamps %s to 0..100 — these are one-directional strengths, not signed ones',
    (key) => {
      usePhotoEditorStore.getState().setAdjustment(key, -40)
      expect(usePhotoEditorStore.getState().adjustments[key]).toBe(0)

      usePhotoEditorStore.getState().setAdjustment(key, 500)
      expect(usePhotoEditorStore.getState().adjustments[key]).toBe(100)
    },
  )

  it('keeps motionBlurAngle signed — it is a direction, not a strength', () => {
    usePhotoEditorStore.getState().setAdjustment('motionBlurAngle', -100)
    expect(usePhotoEditorStore.getState().adjustments.motionBlurAngle).toBe(-100)

    usePhotoEditorStore.getState().setAdjustment('motionBlurAngle', -500)
    expect(usePhotoEditorStore.getState().adjustments.motionBlurAngle).toBe(-100)
  })

  it('resets the sharpen radius to its mid-scale default, not to zero', () => {
    usePhotoEditorStore.getState().setAdjustment('sharpenRadius', 90)
    usePhotoEditorStore.getState().resetAdjustment('sharpenRadius')
    expect(usePhotoEditorStore.getState().adjustments.sharpenRadius).toBe(DEFAULT_ADJUSTMENTS.sharpenRadius)
    expect(usePhotoEditorStore.getState().adjustments.sharpenRadius).toBeGreaterThan(0)
  })

  it('folds the new controls into the same undo stack as every other adjustment', () => {
    usePhotoEditorStore.getState().setAdjustment('grain', 50)
    vi.advanceTimersByTime(300)
    expect(usePhotoEditorStore.getState().adjustments.grain).toBe(50)

    usePhotoEditorStore.getState().undo()
    expect(usePhotoEditorStore.getState().adjustments.grain).toBe(0)

    usePhotoEditorStore.getState().redo()
    expect(usePhotoEditorStore.getState().adjustments.grain).toBe(50)
  })
})
