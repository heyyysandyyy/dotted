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

/** Inject the Google Fonts stylesheet for one family and wait for glyphs. */
export function loadGoogleFont(family: string): Promise<void> {
  if (loaded.has(family)) return Promise.resolve()
  loaded.add(family)

  const id = 'gf-' + family.replace(/\s+/g, '-')
  if (!document.getElementById(id)) {
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
      family,
    )}:wght@400;700&display=swap`
    document.head.appendChild(link)
  }

  // Ensure the font is actually ready before the canvas re-renders with it.
  if (document.fonts && document.fonts.load) {
    return Promise.all([
      document.fonts.load(`400 16px "${family}"`),
      document.fonts.load(`700 16px "${family}"`),
    ]).then(() => undefined)
  }
  return Promise.resolve()
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
