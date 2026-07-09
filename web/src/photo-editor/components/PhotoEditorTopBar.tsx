import { WorkspaceSwitcher } from '../../components/WorkspaceSwitcher'

/**
 * Photo Editor's own top bar (PHOTO-001) — intentionally not a reuse of the
 * Canvas workspace's TopBar. The two workspaces share no toolbars per the
 * three-workspace model; WorkspaceSwitcher is the one nav control that's
 * meant to look identical from both sides (see its own doc comment).
 */
export function PhotoEditorTopBar() {
  return (
    <header className="flex h-12 items-center gap-3 border-b border-editor bg-editor-bg px-3 text-editor-text">
      <span className="font-semibold tracking-tight">dotted</span>
      <WorkspaceSwitcher />
    </header>
  )
}
