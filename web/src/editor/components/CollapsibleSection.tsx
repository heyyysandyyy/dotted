import type { ReactNode } from 'react'
import { usePanelCollapse } from '../hooks/usePanelCollapse'
import { PanelSectionHeader } from './PanelSectionHeader'

interface Props {
  title: string
  /** Unique key for persisting this section's collapsed state (UX-027) —
   *  namespaced per call site (e.g. "align", "position-size") since several
   *  sections share a display title ("Style" appears twice: copy/paste
   *  style tools and the fill/stroke section). */
  storageKey: string
  defaultOpen?: boolean
  actions?: ReactNode
  children: ReactNode
  /** Outer wrapper classes — each call site owns its own spacing/border to
   *  match its position in the stack (first section vs. one after a divider). */
  className?: string
}

/** A collapsible titled section for the PropertiesPanel's own stacked
 *  sub-sections (Position & size, Appearance, Style, Effects, etc.) and the
 *  always-static toolbars above it (Align, copy/paste Style) — anywhere that
 *  renders as a simple header-then-body block rather than owning its own
 *  scrollable region (see PanelSectionHeader's own doc comment for why that
 *  split exists) (UX-027). */
export function CollapsibleSection({ title, storageKey, defaultOpen = true, actions, children, className }: Props) {
  const [open, toggle] = usePanelCollapse(storageKey, defaultOpen)
  return (
    // No extra wrapper around `children` — every call site's `className`
    // already carries a `space-y-*` rule that expects to apply directly
    // between the header and its own body elements (matching the flat
    // structure each of these sections had before UX-027), so the header
    // and an open body have to land as plain siblings here, not nested
    // inside another spacing container.
    <div className={className}>
      <PanelSectionHeader title={title} open={open} onToggle={toggle} actions={actions} />
      {open && children}
    </div>
  )
}
