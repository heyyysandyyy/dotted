/**
 * UX-008 eyedropper. Prefers the native EyeDropper API (Chrome/Edge), which
 * samples anywhere on screen with its own cursor + loupe. Where it's missing
 * (Firefox/Safari), pickColor activates a canvas loupe-overlay fallback and
 * resolves once the user clicks (or null if they cancel).
 */

interface EyeDropperResult {
  sRGBHex: string
}
interface EyeDropperInstance {
  open: () => Promise<EyeDropperResult>
}
interface EyeDropperCtor {
  new (): EyeDropperInstance
}
declare global {
  interface Window {
    EyeDropper?: EyeDropperCtor
  }
}

export function hasNativeEyeDropper(): boolean {
  return typeof window !== 'undefined' && typeof window.EyeDropper === 'function'
}

// Fallback bridge: pickColor parks a resolver, the overlay component drives it.
let pendingResolve: ((hex: string | null) => void) | null = null
let active = false
const listeners = new Set<() => void>()

export function isFallbackActive(): boolean {
  return active
}

export function subscribeFallback(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Resolve the in-progress fallback pick (called by the overlay). */
export function resolveFallback(hex: string | null): void {
  active = false
  listeners.forEach((l) => l())
  const resolve = pendingResolve
  pendingResolve = null
  resolve?.(hex)
}

/** Sample a colour; resolves a hex string, or null if cancelled. */
export function pickColor(): Promise<string | null> {
  if (hasNativeEyeDropper()) {
    return new window
      .EyeDropper!()
      .open()
      .then((r) => r.sRGBHex)
      .catch(() => null) // Escape / cancel rejects
  }
  return new Promise<string | null>((resolve) => {
    pendingResolve = resolve
    active = true
    listeners.forEach((l) => l())
  })
}
