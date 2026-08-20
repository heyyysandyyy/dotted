import { useState } from 'react'

const STORAGE_PREFIX = 'dotted:panel:'

function readStored(key: string, defaultOpen: boolean): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key)
    return raw === null ? defaultOpen : raw === 'open'
  } catch {
    return defaultOpen
  }
}

/**
 * Collapse/expand state for one right-sidebar panel or PropertiesPanel
 * section, persisted per-key so a panel someone collapses (e.g. "Effects",
 * rarely touched) stays collapsed across reloads instead of resetting every
 * session. Every call site shares the same `dotted:panel:` key prefix so
 * there's one place to look for all of them.
 */
export function usePanelCollapse(key: string, defaultOpen = true): [boolean, () => void] {
  const [open, setOpen] = useState(() => readStored(key, defaultOpen))

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_PREFIX + key, next ? 'open' : 'closed')
      } catch {
        // localStorage unavailable (private browsing, quota) — collapse still
        // works for this session, it just won't persist across reloads.
      }
      return next
    })
  }

  return [open, toggle]
}
