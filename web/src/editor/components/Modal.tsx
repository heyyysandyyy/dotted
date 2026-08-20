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
 * editor-* tokens): a dimmed backdrop (click to close) and a panel with a
 * titled header + close button and a scrollable body. Used by all the editor
 * modals for a consistent look.
 */
export function Modal({ title, onClose, children, widthClass = 'w-[480px]' }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className={`${widthClass} flex max-h-[88vh] flex-col overflow-hidden rounded-xl border border-editor-strong bg-editor-bg text-editor-text shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-editor px-5 py-3">
          <h2 className="text-sm font-semibold text-editor-text-strong">{title}</h2>
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
