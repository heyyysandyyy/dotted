import * as fabric from 'fabric'
import { isEffectClone } from './effectsEngine'

/** This lives outside components/ so LayersPanel doesn't import the fabric
 *  value directly (the architecture lint rule) — it's pure tree-flattening
 *  logic, not a canvas mutation, but the rule is file-scoped either way. */

type WithId = fabric.FabricObject & { id?: string; name?: string; locked?: boolean }

/** One visible row in the flattened layer tree (UX-018) — a group's children
 *  only appear here while it's expanded, so collapsing one hides a whole
 *  subtree from both rendering and the drag-and-drop list in one place. */
export interface Row {
  obj: WithId
  depth: number
  parent: fabric.Group | null
  isGroup: boolean
}

/** Depth-first, top-first flatten of the object tree, skipping collapsed
 *  groups' children. A single flat list (rather than a SortableContext per
 *  group) keeps cross-group drags simple — see the implementation note on
 *  UX-018 (issue #111). */
export function flattenRows(
  objsBottomFirst: fabric.FabricObject[],
  depth: number,
  parent: fabric.Group | null,
  collapsed: Set<string>,
  out: Row[],
): void {
  const topFirst = [...objsBottomFirst].reverse() as WithId[]
  for (const obj of topFirst) {
    // A shadow-spread halo clone (UX-020) is a real canvas object (so it
    // exports correctly to PNG/PDF/SVG on its own), but it's derived from its
    // host's effect settings, not something the user created or should see.
    if (isEffectClone(obj)) continue
    const isGroup = obj.type === 'group'
    out.push({ obj, depth, parent, isGroup })
    if (isGroup && obj.id && !collapsed.has(obj.id)) {
      flattenRows((obj as fabric.Group).getObjects(), depth + 1, obj as fabric.Group, collapsed, out)
    }
  }
}

/** True when `row` lives inside `ancestorId` (directly or via nested groups).
 *  Guards against dropping a group onto one of its own descendants, which
 *  would make it its own ancestor — groupSelection can already create nested
 *  groups (grouping a selection that includes an existing group), so this is
 *  reachable, not just theoretical. */
export function isDescendantRow(rows: Row[], ancestorId: string, row: Row): boolean {
  let parent = row.parent
  while (parent) {
    if ((parent as WithId).id === ancestorId) return true
    const parentRow = rows.find((r) => r.obj === parent)
    parent = parentRow ? parentRow.parent : null
  }
  return false
}
