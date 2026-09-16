import { GOOGLE_FONTS } from './fonts'

/**
 * Self-contained font embedding for SVG export.
 *
 * fabric's `toSVG` writes `font-family="Ubuntu"` and nothing else — the glyphs
 * themselves live in a Google Fonts stylesheet that only ever existed in the
 * editor's own document. Opened anywhere else the exported file has no such
 * face to resolve, so the viewer substitutes its default (typically a serif)
 * and the export does not match the design.
 *
 * The fix is to carry the faces inside the file: fetch the family's Google
 * Fonts CSS, inline each woff2 it points at as a base64 data URI, and inject
 * the resulting `@font-face` rules into the SVG.
 *
 * Best-effort throughout — a failed fetch (offline, blocked) degrades to
 * today's behaviour (a substituted font) rather than failing the export.
 */

/** The weights `loadGoogleFont` fetches for the editor; we embed the same two. */
type Weight = 400 | 700

interface FamilyUsage {
  weights: Set<Weight>
  /** The characters actually set in this family, for unicode-range filtering. */
  chars: Set<number>
}

/** fontWeight is 'normal' | 'bold' | 400 | '700' | … — collapse to what we load. */
function normalizeWeight(raw: unknown): Weight {
  if (typeof raw === 'number') return raw >= 600 ? 700 : 400
  if (typeof raw === 'string') {
    if (raw === 'bold' || raw === 'bolder') return 700
    const n = Number(raw)
    if (Number.isFinite(n)) return n >= 600 ? 700 : 400
  }
  return 400
}

interface TextLike {
  fontFamily?: string
  fontWeight?: unknown
  text?: string
  styles?: Record<string, Record<string, { fontFamily?: string; fontWeight?: unknown }>>
  _objects?: unknown[]
}

function record(usage: Map<string, FamilyUsage>, family: unknown, weight: unknown, text: string) {
  if (typeof family !== 'string' || !GOOGLE_FONTS.includes(family)) return
  let entry = usage.get(family)
  if (!entry) usage.set(family, (entry = { weights: new Set(), chars: new Set() }))
  entry.weights.add(normalizeWeight(weight))
  for (const ch of text) entry.chars.add(ch.codePointAt(0)!)
}

/**
 * Every Google font used by the canvas, with the weights and characters each
 * is set in. Recurses into groups (UX-016) and reads per-character style runs,
 * so a font used only inside a group or on a few characters is still embedded.
 */
export function collectFontUsage(objects: readonly unknown[]): Map<string, FamilyUsage> {
  const usage = new Map<string, FamilyUsage>()

  const visit = (obj: unknown) => {
    const o = obj as TextLike
    if (!o || typeof o !== 'object') return
    if (Array.isArray(o._objects)) o._objects.forEach(visit)
    if (typeof o.fontFamily !== 'string') return

    const text = typeof o.text === 'string' ? o.text : ''
    record(usage, o.fontFamily, o.fontWeight, text)
    // Per-character overrides carry their own family/weight. Their exact
    // character is not worth tracking down — the whole text is a safe superset.
    for (const row of Object.values(o.styles ?? {})) {
      for (const style of Object.values(row ?? {})) {
        record(usage, style?.fontFamily ?? o.fontFamily, style?.fontWeight ?? o.fontWeight, text)
      }
    }
  }

  objects.forEach(visit)
  return usage
}

/** Parse a `unicode-range` value (`U+0-FF, U+131, U+2212`) into code-point ranges. */
function parseUnicodeRange(value: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  for (const part of value.split(',')) {
    const token = part.trim().replace(/^u\+/i, '')
    if (!token) continue
    if (token.includes('-')) {
      const [lo, hi] = token.split('-')
      ranges.push([parseInt(lo, 16), parseInt(hi, 16)])
    } else if (token.includes('?')) {
      // Wildcard form: U+04?? spans 0400–04FF.
      ranges.push([parseInt(token.replace(/\?/g, '0'), 16), parseInt(token.replace(/\?/g, 'F'), 16)])
    } else {
      const cp = parseInt(token, 16)
      ranges.push([cp, cp])
    }
  }
  return ranges.filter(([lo, hi]) => Number.isFinite(lo) && Number.isFinite(hi))
}

/**
 * Whether a subset is worth embedding: Google splits each family into latin,
 * latin-ext, cyrillic, greek… and shipping all of them would add hundreds of
 * kilobytes of glyphs no one in this design typed.
 */
function subsetIsUsed(block: string, chars: Set<number>): boolean {
  const match = /unicode-range:\s*([^;}]+)/i.exec(block)
  if (!match) return true // No range declared — it covers everything.
  const ranges = parseUnicodeRange(match[1])
  if (ranges.length === 0) return true
  for (const cp of chars) {
    if (ranges.some(([lo, hi]) => cp >= lo && cp <= hi)) return true
  }
  return false
}

/**
 * The font's MIME type, read from its magic number rather than assumed.
 *
 * The Google Fonts API varies its response on User-Agent: a current browser is
 * served woff2, but an older or unrecognised one gets woff or a bare TrueType.
 * Labelling a TrueType as woff2 makes renderers reject the face outright, so
 * the four signature bytes decide.
 */
function fontMimeType(buf: Uint8Array): string {
  const tag = String.fromCharCode(...buf.subarray(0, 4))
  if (tag === 'wOF2') return 'font/woff2'
  if (tag === 'wOFF') return 'font/woff'
  if (tag === 'OTTO') return 'font/otf'
  return 'font/ttf'
}

/**
 * One font file as a base64 data URI. Nothing is cached here on purpose:
 * Google serves both the CSS and the glyph files with long-lived cache
 * headers, so a repeat export is already served from the browser's HTTP cache.
 */
async function fetchAsDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.length === 0) return null
    let binary = ''
    // Chunked to stay under the argument-count limit on large fonts.
    for (let i = 0; i < buf.length; i += 0x8000) {
      binary += String.fromCharCode(...buf.subarray(i, i + 0x8000))
    }
    return `data:${fontMimeType(buf)};base64,${btoa(binary)}`
  } catch {
    return null
  }
}

/** The Google Fonts CSS for one family at the given weights. */
async function fetchFamilyCSS(family: string, weights: Weight[]): Promise<string | null> {
  const href =
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}` +
    `:wght@${weights.join(';')}`
  try {
    const res = await fetch(href)
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

/**
 * `@font-face` rules for one family with every glyph source inlined.
 *
 * The browser is served woff2 by the Google Fonts API (the response varies by
 * User-Agent), which every current SVG-rendering browser understands.
 */
async function embedFamily(family: string, usage: FamilyUsage): Promise<string> {
  const weights = [...usage.weights].sort((a, b) => a - b)
  const css = await fetchFamilyCSS(family, weights)
  if (!css) return ''

  const blocks = css.match(/@font-face\s*{[^}]*}/g) ?? []
  const embedded = await Promise.all(
    blocks.map(async (block) => {
      if (!subsetIsUsed(block, usage.chars)) return ''
      const urlMatch = /url\((https:\/\/[^)]+)\)/.exec(block)
      if (!urlMatch) return ''
      const dataUri = await fetchAsDataUri(urlMatch[1])
      if (!dataUri) return ''
      // unicode-range stays. A design that mixes scripts keeps more than one
      // subset of the same family at the same weight, and the range descriptor
      // is the only thing telling those faces apart — without it they are
      // duplicate declarations and the last one wins for every character,
      // losing the glyphs of every earlier subset. A renderer that ignores the
      // descriptor is no worse off than it would be if we stripped it.
      return block.replace(urlMatch[1], dataUri).trim()
    }),
  )
  return embedded.filter(Boolean).join('\n')
}

/**
 * `<style>` markup embedding every Google font the objects use, or `''` when
 * there is nothing to embed (no web-font text, or every fetch failed).
 */
export async function fontFaceMarkup(objects: readonly unknown[]): Promise<string> {
  const usage = collectFontUsage(objects)
  if (usage.size === 0) return ''
  const faces = await Promise.all([...usage].map(([family, u]) => embedFamily(family, u)))
  const css = faces.filter(Boolean).join('\n')
  if (!css) return ''
  // base64 contains no `]]>`, so the CDATA section is always well-formed.
  return `<style type="text/css"><![CDATA[\n${css}\n]]></style>`
}

/** Insert markup directly after the opening `<svg …>` tag. */
export function withFontFaces(svg: string, markup: string): string {
  if (!markup) return svg
  const open = svg.indexOf('<svg')
  if (open < 0) return svg
  const end = svg.indexOf('>', open)
  if (end < 0) return svg
  return `${svg.slice(0, end + 1)}\n${markup}\n${svg.slice(end + 1)}`
}
