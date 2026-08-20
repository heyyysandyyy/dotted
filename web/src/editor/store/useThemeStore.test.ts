import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const THEME_KEY = 'dotted:theme'

/** useThemeStore computes its initial value once, at module load — every
 *  test that cares about that initial value has to reset the module
 *  registry and re-import fresh, rather than reuse the already-created
 *  store from a previous test. */
async function freshStore() {
  vi.resetModules()
  return import('./useThemeStore')
}

describe('useThemeStore (UX-026)', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  afterEach(() => {
    // @ts-expect-error -- test-only cleanup of a per-test matchMedia stub
    delete window.matchMedia
  })

  it("defaults to light when there's no stored choice and no matchMedia support", async () => {
    const { useThemeStore } = await freshStore()
    expect(useThemeStore.getState().theme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('falls back to the OS preference when there is no stored choice', async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    const { useThemeStore } = await freshStore()
    expect(useThemeStore.getState().theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('a stored choice overrides the OS preference', async () => {
    localStorage.setItem(THEME_KEY, 'light')
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    const { useThemeStore } = await freshStore()
    expect(useThemeStore.getState().theme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('setTheme applies the dark class, updates state, and persists the choice', async () => {
    const { useThemeStore } = await freshStore()

    useThemeStore.getState().setTheme('dark')

    expect(useThemeStore.getState().theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
  })

  it('toggleTheme flips between light and dark', async () => {
    const { useThemeStore } = await freshStore()
    expect(useThemeStore.getState().theme).toBe('light')

    useThemeStore.getState().toggleTheme()
    expect(useThemeStore.getState().theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    useThemeStore.getState().toggleTheme()
    expect(useThemeStore.getState().theme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('a later setTheme("light") removes the dark class again', async () => {
    const { useThemeStore } = await freshStore()
    useThemeStore.getState().setTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    useThemeStore.getState().setTheme('light')

    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
  })
})
