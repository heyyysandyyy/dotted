/**
 * Names for the modifier keys, as the keyboard in front of the user has
 * them. The behaviour is the same everywhere — a Mac's Option key is the
 * browser's `altKey`, and Command is `metaKey` — but "Alt" is not written on
 * any Mac keyboard, so a hint saying "hold Alt" sends people looking for a
 * key they don't have.
 *
 * Read once at module load: nobody swaps keyboards mid-session, and this is
 * called from render.
 */
const APPLE = /Mac|iPhone|iPad|iPod/i

function isApple(): boolean {
  if (typeof navigator === 'undefined') return false
  const data = navigator as Navigator & { userAgentData?: { platform?: string } }
  return APPLE.test(data.userAgentData?.platform ?? navigator.platform ?? navigator.userAgent ?? '')
}

export const ON_APPLE = isApple()

/** "Option" on a Mac, "Alt" elsewhere. */
export const ALT_KEY = ON_APPLE ? 'Option' : 'Alt'
/** "Shift" everywhere, for symmetry at call sites. */
export const SHIFT_KEY = 'Shift'
/** The "do it to the app" modifier: "⌘" on a Mac, "Ctrl" elsewhere. */
export const MOD_KEY = ON_APPLE ? '⌘' : 'Ctrl'

/** A shortcut as it should read in a tooltip, e.g. "⌘D" or "Ctrl+D". */
export function shortcut(key: string, shift = false): string {
  const parts = ON_APPLE ? [MOD_KEY, shift ? '⇧' : '', key] : ['Ctrl', shift ? 'Shift' : '', key].filter(Boolean)
  return ON_APPLE ? parts.join('') : parts.join('+')
}
