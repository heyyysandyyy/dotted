import { describe, it, expect } from 'vitest'
import { slugify } from './exporters'

describe('slugify', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugify('My Design')).toBe('my-design')
  })
  it('strips punctuation and collapses separators', () => {
    expect(slugify('Hello, World!!')).toBe('hello-world')
    expect(slugify('a@@@b')).toBe('a-b')
  })
  it('trims leading/trailing separators and whitespace', () => {
    expect(slugify('  spaced  ')).toBe('spaced')
    expect(slugify('--edge--')).toBe('edge')
  })
  it('falls back to "design" when empty', () => {
    expect(slugify('')).toBe('design')
    expect(slugify('   ')).toBe('design')
    expect(slugify('!!!')).toBe('design')
  })
})
