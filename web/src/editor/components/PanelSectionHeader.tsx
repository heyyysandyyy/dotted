import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  title: string
  open: boolean
  onToggle: () => void
  /** Right-aligned controls (e.g. a "clear" button) — stay visible and
   *  interactive regardless of collapsed state, since they act on the
   *  section as a whole rather than its (possibly hidden) body. */
  actions?: ReactNode
}

/** The chevron + title + optional actions row shared by every collapsible
 *  panel/section on the right sidebar (UX-027). Layout-agnostic on purpose —
 *  each call site keeps its own outer wrapper/padding/scroll-area classes
 *  and just renders this for the header, so a flex-column scrolling panel
 *  (Layers, History) and a stacked static section (PropertiesPanel's own
 *  sub-sections) can share one consistent header without fighting each
 *  other's layout needs. */
export function PanelSectionHeader({ title, open, onToggle, actions }: Props) {
  const Chevron: LucideIcon = open ? ChevronDown : ChevronRight
  return (
    <div className="flex items-center justify-between gap-2">
      <button
        onClick={onToggle}
        className="flex min-w-0 flex-1 items-center gap-1 text-xs font-semibold uppercase tracking-wide text-neutral-500 hover:text-neutral-300"
        title={open ? `Collapse ${title}` : `Expand ${title}`}
        aria-expanded={open}
      >
        <Chevron size={14} className="shrink-0" />
        <span className="truncate">{title}</span>
      </button>
      {actions}
    </div>
  )
}
