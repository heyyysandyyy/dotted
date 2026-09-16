import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { collectFontUsage, fontFaceMarkup, withFontFaces } from './svgFonts'

/** The shape of the Google Fonts CSS the API serves a browser (woff2, subset). */
const UBUNTU_CSS = `
/* cyrillic */
@font-face {
  font-family: 'Ubuntu';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/ubuntu/cyrillic-400.woff2) format('woff2');
  unicode-range: U+0301, U+0400-045F, U+0490-0491;
}
/* latin */
@font-face {
  font-family: 'Ubuntu';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/ubuntu/latin-400.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+2212;
}
`

function mockFetch(css: string = UBUNTU_CSS) {
  return vi.fn(async (input: string) => {
    if (input.includes('fonts.googleapis.com')) {
      return { ok: true, text: async () => css } as unknown as Response
    }
    return {
      ok: true,
      // 'wOF2' — the woff2 signature a browser's User-Agent gets served.
      arrayBuffer: async () => new Uint8Array([0x77, 0x4f, 0x46, 0x32]).buffer,
    } as unknown as Response
  })
}

describe('collectFontUsage', () => {
  it('collects a top-level text object’s family, weight and characters', () => {
    const usage = collectFontUsage([{ fontFamily: 'Ubuntu', fontWeight: 'bold', text: 'Hi' }])
    expect([...usage.keys()]).toEqual(['Ubuntu'])
    expect([...usage.get('Ubuntu')!.weights]).toEqual([700])
    expect(usage.get('Ubuntu')!.chars).toContain('H'.codePointAt(0))
  })

  it('recurses into groups — grouped text is still part of the design (UX-016)', () => {
    const usage = collectFontUsage([
      { _objects: [{ _objects: [{ fontFamily: 'Lobster', text: 'deep' }] }] },
    ])
    expect([...usage.keys()]).toEqual(['Lobster'])
  })

  it('picks up per-character style runs', () => {
    const usage = collectFontUsage([
      {
        fontFamily: 'Ubuntu',
        text: 'ab',
        styles: { 0: { 1: { fontFamily: 'Lobster', fontWeight: 700 } } },
      },
    ])
    expect([...usage.keys()].sort()).toEqual(['Lobster', 'Ubuntu'])
    expect([...usage.get('Lobster')!.weights]).toEqual([700])
  })

  it('ignores non-Google families — a system font needs no embedding', () => {
    const usage = collectFontUsage([{ fontFamily: 'Arial', text: 'x' }])
    expect(usage.size).toBe(0)
  })

  it('normalizes fontWeight to the two faces the editor loads', () => {
    const usage = collectFontUsage([
      { fontFamily: 'Ubuntu', fontWeight: 'normal', text: 'a' },
      { fontFamily: 'Ubuntu', fontWeight: '900', text: 'b' },
    ])
    expect([...usage.get('Ubuntu')!.weights].sort()).toEqual([400, 700])
  })
})

describe('fontFaceMarkup — BUG-006: SVG exports substituted a serif for the design font', () => {
  beforeEach(() => vi.unstubAllGlobals())
  afterEach(() => vi.unstubAllGlobals())

  it('embeds the font as a data URI so the file stands on its own', async () => {
    vi.stubGlobal('fetch', mockFetch())
    const markup = await fontFaceMarkup([{ fontFamily: 'Ubuntu', text: 'Hello' }])

    expect(markup).toContain('@font-face')
    expect(markup).toContain("font-family: 'Ubuntu'")
    expect(markup).toContain('data:font/woff2;base64,')
    // No URL may survive: a viewer offline (or in Illustrator) must not need one.
    expect(markup).not.toContain('https://fonts.gstatic.com')
  })

  it('requests only the weights actually used', async () => {
    const fetchMock = mockFetch()
    vi.stubGlobal('fetch', fetchMock)
    await fontFaceMarkup([{ fontFamily: 'Ubuntu', fontWeight: 'bold', text: 'Hi' }])

    const cssUrl = fetchMock.mock.calls.map((c) => c[0]).find((u) => u.includes('googleapis'))!
    expect(cssUrl).toContain('wght@700')
    expect(cssUrl).not.toContain('400')
  })

  it('skips subsets whose characters were never typed', async () => {
    const fetchMock = mockFetch()
    vi.stubGlobal('fetch', fetchMock)
    await fontFaceMarkup([{ fontFamily: 'Ubuntu', text: 'Hello' }])

    const fetched = fetchMock.mock.calls.map((c) => c[0])
    expect(fetched).toContain('https://fonts.gstatic.com/s/ubuntu/latin-400.woff2')
    expect(fetched).not.toContain('https://fonts.gstatic.com/s/ubuntu/cyrillic-400.woff2')
  })

  it('keeps every subset a mixed-script design reaches, each still told apart by its range', async () => {
    vi.stubGlobal('fetch', mockFetch())
    const markup = await fontFaceMarkup([{ fontFamily: 'Ubuntu', text: 'Hello Привет' }])

    // Both subsets are needed, and both are the same family at the same weight:
    // unicode-range is the only thing distinguishing them. Drop it and they are
    // duplicate declarations — the last wins and the Cyrillic glyphs are lost.
    expect(markup.match(/@font-face/g)).toHaveLength(2)
    expect(markup).toContain('U+0400-045F')
    expect(markup).toContain('U+0000-00FF')
  })

  it('keeps a subset whose range the text does reach', async () => {
    const fetchMock = mockFetch()
    vi.stubGlobal('fetch', fetchMock)
    await fontFaceMarkup([{ fontFamily: 'Ubuntu', text: 'Привет' }])

    const fetched = fetchMock.mock.calls.map((c) => c[0])
    expect(fetched).toContain('https://fonts.gstatic.com/s/ubuntu/cyrillic-400.woff2')
  })

  it('labels the data URI from the font’s magic number, not an assumed format', async () => {
    // A non-woff2 User-Agent is served bare TrueType (signature 0x00010000);
    // calling that woff2 makes renderers reject the face.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) =>
        input.includes('googleapis')
          ? ({ ok: true, text: async () => UBUNTU_CSS } as unknown as Response)
          : ({
              ok: true,
              arrayBuffer: async () => new Uint8Array([0x00, 0x01, 0x00, 0x00]).buffer,
            } as unknown as Response),
      ),
    )
    const markup = await fontFaceMarkup([{ fontFamily: 'Ubuntu', text: 'Hello' }])
    expect(markup).toContain('data:font/ttf;base64,')
    expect(markup).not.toContain('font/woff2;base64')
  })

  it('returns nothing when no web font is used', async () => {
    const fetchMock = mockFetch()
    vi.stubGlobal('fetch', fetchMock)
    expect(await fontFaceMarkup([{ fontFamily: 'Arial', text: 'x' }])).toBe('')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('degrades to no markup when the font cannot be fetched, rather than failing the export', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await fontFaceMarkup([{ fontFamily: 'Ubuntu', text: 'Hello' }])).toBe('')
  })
})

describe('withFontFaces', () => {
  it('injects the style immediately after the opening svg tag', () => {
    const out = withFontFaces('<?xml version="1.0"?><svg width="10"><rect/></svg>', '<style/>')
    expect(out).toBe('<?xml version="1.0"?><svg width="10">\n<style/>\n<rect/></svg>')
  })

  it('leaves the markup untouched when there is nothing to embed', () => {
    expect(withFontFaces('<svg></svg>', '')).toBe('<svg></svg>')
  })
})
