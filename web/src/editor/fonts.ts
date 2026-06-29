/** Popular Google Fonts. Loaded lazily, one at a time, never in bulk. */
export const GOOGLE_FONTS: string[] = [
  'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Inter', 'Oswald',
  'Raleway', 'Nunito', 'Merriweather', 'Playfair Display', 'Ubuntu', 'Roboto Condensed',
  'Roboto Slab', 'PT Sans', 'PT Serif', 'Noto Sans', 'Noto Serif', 'Rubik',
  'Work Sans', 'Quicksand', 'Mukta', 'Fira Sans', 'Josefin Sans', 'Karla',
  'Source Sans 3', 'Barlow', 'Inconsolata', 'Bebas Neue', 'Dancing Script',
  'Pacifico', 'Lobster', 'Anton', 'Caveat', 'Shadows Into Light', 'Abril Fatface',
  'Comfortaa', 'Cabin', 'Teko', 'Titillium Web', 'Heebo', 'Libre Baskerville',
  'Arimo', 'DM Sans', 'DM Serif Display', 'Crimson Text', 'Bitter', 'Dosis',
  'Archivo', 'Exo 2', 'Manrope', 'Space Grotesk', 'Cormorant Garamond',
  'Permanent Marker', 'Indie Flower', 'Satisfy', 'Righteous', 'Sacramento',
]

const LAST_FONT_KEY = 'dotted:lastFont'
const loaded = new Set<string>()

/** Actually fetch the glyphs for a family (both weights) and resolve when ready. */
function loadFaces(family: string): Promise<void> {
  if (!document.fonts || !document.fonts.load) return Promise.resolve()
  return Promise.all([
    document.fonts.load(`400 16px "${family}"`),
    document.fonts.load(`700 16px "${family}"`),
  ])
    .then(() => undefined)
    .catch(() => undefined)
}

/**
 * Inject the Google Fonts stylesheet for one family and resolve once its glyphs
 * are loaded. `document.fonts.load` only loads faces the browser already knows
 * about, so we must wait for the stylesheet `<link>` to finish loading (its
 * `@font-face` rules) *before* requesting the faces — otherwise it resolves
 * having loaded nothing and the canvas paints with a fallback font (BUG-001).
 */
export function loadGoogleFont(family: string): Promise<void> {
  if (loaded.has(family)) return Promise.resolve()
  loaded.add(family)

  const id = 'gf-' + family.replace(/\s+/g, '-')
  const existing = document.getElementById(id) as HTMLLinkElement | null
  if (existing) return loadFaces(family)

  return new Promise<void>((resolve) => {
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
      family,
    )}:wght@400;700&display=swap`
    // Only request the faces once the stylesheet (its @font-face rules) is parsed.
    link.onload = () => loadFaces(family).then(resolve)
    link.onerror = () => resolve()
    document.head.appendChild(link)
  })
}

export function getLastFont(): string | null {
  try {
    return localStorage.getItem(LAST_FONT_KEY)
  } catch {
    return null
  }
}

export function setLastFont(family: string) {
  try {
    localStorage.setItem(LAST_FONT_KEY, family)
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}
