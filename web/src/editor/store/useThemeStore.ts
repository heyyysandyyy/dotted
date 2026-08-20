import { create } from 'zustand'

export type Theme = 'light' | 'dark'

const THEME_KEY = 'dotted:theme'

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
}

function readStoredTheme(): Theme | null {
  const raw = localStorage.getItem(THEME_KEY)
  return raw === 'light' || raw === 'dark' ? raw : null
}

/** Stored choice wins; otherwise fall back to the OS preference (UX-026). */
function initialTheme(): Theme {
  return readStoredTheme() ?? (systemPrefersDark() ? 'dark' : 'light')
}

/** The `dark` class drives every `dark:` Tailwind variant and the
 *  editor-* CSS custom properties (index.css) at once — this is the one
 *  place that has to run for a theme change to actually show up. */
function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initialTheme(),

  setTheme: (theme) => {
    localStorage.setItem(THEME_KEY, theme)
    applyTheme(theme)
    set({ theme })
  },

  toggleTheme: () => {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark')
  },
}))

// index.html's inline head script already applies the class before React
// mounts (avoiding a flash of the wrong theme) — this re-applies it against
// the store's own computed initial value so the two can never disagree,
// and covers the case where that inline script didn't run for some reason.
applyTheme(useThemeStore.getState().theme)
