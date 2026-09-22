import { useEffect, useId } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  /** Panel width utility class (default 480px). */
  widthClass?: string
}

/**
 * Shared modal shell matching the editor's popovers (UX-026: themed via the
 * editor-* tokens): a dimmed backdrop (click to close), Escape to close, and
 * a panel with a titled header + close button and a scrollable body, marked
 * up as a dialog so assistive tech announces it. Used by all the editor
 * modals for a consistent look.
 */
export function Modal({ title, onClose, children, widthClass = 'w-[480px]' }: Props) {
  const titleId = useId()

  // Escape closes, as it does for every dialog anywhere (BUG-011). Bound on
  // the document because focus may be anywhere — or nowhere — inside it, and
  // captured so the editor's own Escape handling (leaving crop or painter
  // mode) doesn't also fire underneath an open dialog.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`${widthClass} flex max-h-[88vh] flex-col overflow-hidden rounded-xl border border-editor-strong bg-editor-bg text-editor-text shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-editor px-5 py-3">
          <h2 id={titleId} className="text-sm font-semibold text-editor-text-strong">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="rounded p-1 text-editor-text-muted hover:bg-editor-surface hover:text-editor-text"
          >
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}
