import { describe, it, expect } from 'vitest'
import { ALT_KEY, MOD_KEY, ON_APPLE, shortcut } from './keyLabels'

/** The module reads the platform once at load, so these assert whichever
 *  side of that the test machine is on — both spellings are covered. */
describe('keyLabels', () => {
  it('names the modifiers the way this platform’s keyboard does', () => {
    if (ON_APPLE) {
      expect(ALT_KEY).toBe('Option')
      expect(MOD_KEY).toBe('⌘')
    } else {
      expect(ALT_KEY).toBe('Alt')
      expect(MOD_KEY).toBe('Ctrl')
    }
  })

  it('writes a shortcut the way that platform does', () => {
    expect(shortcut('D')).toBe(ON_APPLE ? '⌘D' : 'Ctrl+D')
    expect(shortcut('Z', true)).toBe(ON_APPLE ? '⌘⇧Z' : 'Ctrl+Shift+Z')
  })
})
