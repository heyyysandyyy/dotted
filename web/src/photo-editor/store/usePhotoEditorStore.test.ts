import { describe, it, expect, beforeEach } from 'vitest'
import { usePhotoEditorStore, type PhotoEditorSourceRef } from './usePhotoEditorStore'

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
    usePhotoEditorStore.setState({ image: null, sourceRef: null })
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
    usePhotoEditorStore.setState({ image: null, sourceRef: null })
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
    usePhotoEditorStore.setState({ image: null, sourceRef: null, adjustments: { brightness: 0, contrast: 0 } })
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
