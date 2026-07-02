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
 * Shared dark modal shell matching the editor's popovers: a dimmed backdrop
 * (click to close) and a neutral-900 panel with a titled header + close button
 * and a scrollable body. Used by all the editor modals for a consistent look.
 */
export function Modal({ title, onClose, children, widthClass = 'w-[480px]' }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className={`${widthClass} flex max-h-[88vh] flex-col overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-200 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
          <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
          >
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}
