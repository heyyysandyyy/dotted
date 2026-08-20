import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePanelCollapse } from './usePanelCollapse'

const KEY = 'test-panel'
const STORAGE_KEY = 'dotted:panel:' + KEY

describe('usePanelCollapse (UX-027)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to open when nothing is stored', () => {
    const { result } = renderHook(() => usePanelCollapse(KEY))
    expect(result.current[0]).toBe(true)
  })

  it('honours an explicit defaultOpen=false when nothing is stored', () => {
    const { result } = renderHook(() => usePanelCollapse(KEY, false))
    expect(result.current[0]).toBe(false)
  })

  it('toggling flips the state and persists it', () => {
    const { result } = renderHook(() => usePanelCollapse(KEY))

    act(() => result.current[1]())

    expect(result.current[0]).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('closed')

    act(() => result.current[1]())

    expect(result.current[0]).toBe(true)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('open')
  })

  it('a fresh mount picks up a previously persisted collapsed state', () => {
    localStorage.setItem(STORAGE_KEY, 'closed')

    const { result } = renderHook(() => usePanelCollapse(KEY, true))

    // The stored choice wins over defaultOpen, the same way useThemeStore's
    // stored theme wins over the OS-preference fallback.
    expect(result.current[0]).toBe(false)
  })

  it('different keys are independent', () => {
    const a = renderHook(() => usePanelCollapse('panel-a'))
    const b = renderHook(() => usePanelCollapse('panel-b'))

    act(() => a.result.current[1]())

    expect(a.result.current[0]).toBe(false)
    expect(b.result.current[0]).toBe(true)
  })
})
