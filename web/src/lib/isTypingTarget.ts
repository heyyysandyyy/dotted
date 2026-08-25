/**
 * True when the currently focused element is genuine text-entry — a keyboard
 * shortcut handler should stand down and let the browser's own text editing
 * (including its native undo) run instead. A `range`/`checkbox`/`radio`/
 * button-like `<input>` is focusable but isn't text entry, so it's excluded:
 * treating it as "typing" swallows an app-level shortcut (e.g. Cmd+Z) for as
 * long as focus sits on a slider someone just dragged.
 *
 * Extracted from what were three independent copies of this exact check
 * (usePhotoEditorShortcuts.ts, and inline in PageStack.tsx's useSpaceDragPan
 * and CanvasStage.tsx) — usePhotoEditorShortcuts.ts is the only call site
 * migrated to it so far.
 */
export function isTypingTarget(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true
  if (el.tagName === 'INPUT') {
    const type = (el as HTMLInputElement).type
    return !['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file'].includes(type)
  }
  return false
}
