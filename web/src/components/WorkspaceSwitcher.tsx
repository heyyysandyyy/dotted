import { Link, useLocation } from '@tanstack/react-router'

const WORKSPACES = [
  { to: '/', label: 'Canvas' },
  { to: '/photo-editor', label: 'Photo Editor' },
] as const

/**
 * Top-level tab switcher between workspaces (PHOTO-001) — Canvas today, with
 * Vector Editor a future peer per the three-workspace model. Each workspace
 * owns its own top bar/toolbars entirely (no shared toolbars between
 * workspaces); this is the one small nav control that intentionally *is*
 * shared, so switching workspaces looks and behaves identically from either
 * side rather than each workspace rolling its own tab UI. Lives in
 * src/components/ (not src/editor/ or src/photo-editor/) since it belongs to
 * neither workspace on its own.
 */
export function WorkspaceSwitcher() {
  const pathname = useLocation({ select: (l) => l.pathname })

  return (
    <div className="flex items-center rounded-md bg-editor-surface p-0.5 text-xs">
      {WORKSPACES.map(({ to, label }) => {
        const active = pathname === to
        return (
          <Link
            key={to}
            to={to}
            className={`rounded px-2.5 py-1 font-medium ${
              active ? 'bg-editor-surface-2 text-editor-text-strong' : 'text-editor-text-muted hover:text-editor-text'
            }`}
          >
            {label}
          </Link>
        )
      })}
    </div>
  )
}
