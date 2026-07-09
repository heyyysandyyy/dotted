import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Type,
  Image as ImageIcon,
  Square,
  Circle,
  Triangle as TriangleIcon,
  Minus,
  MoveRight,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  GripVertical,
  ChevronDown,
  ChevronRight,
  Group as GroupIcon,
  Ungroup,
  Folder,
} from 'lucide-react'
import type * as fabric from 'fabric'
import { useCanvasStore } from '../store/useCanvasStore'
import { layerName } from '../utils'
import { flattenRows, isDescendantRow, type Row } from '../layerTree'

type WithId = fabric.FabricObject & { id?: string; name?: string; locked?: boolean }

function iconFor(obj: fabric.FabricObject) {
  switch (obj.type) {
    case 'textbox':
    case 'i-text':
    case 'text':
      return <Type size={14} />
    case 'image':
      return <ImageIcon size={14} />
    case 'ellipse':
      return <Circle size={14} />
    case 'triangle':
      return <TriangleIcon size={14} />
    case 'line':
      return <Minus size={14} />
    case 'path':
      return <MoveRight size={14} />
    case 'group':
      return <Folder size={14} />
    default:
      return <Square size={14} />
  }
}

/**
 * Display name per object: a custom name if set, otherwise the derived base
 * name with a 1-based index appended when more than one object shares it
 * (e.g. "Rectangle 1", "Rectangle 2"). Scoped to the objects passed in, so
 * siblings within a group are numbered independently of root-level objects.
 */
function buildNames(objs: WithId[]): Map<string, string> {
  const counts = new Map<string, number>()
  objs.forEach((o) => {
    const b = layerName(o)
    counts.set(b, (counts.get(b) ?? 0) + 1)
  })
  const seen = new Map<string, number>()
  const out = new Map<string, string>()
  objs.forEach((o) => {
    if (o.name) {
      out.set(o.id!, o.name)
      return
    }
    const b = layerName(o)
    if ((counts.get(b) ?? 0) > 1) {
      const n = (seen.get(b) ?? 0) + 1
      seen.set(b, n)
      out.set(o.id!, `${b} ${n}`)
    } else {
      out.set(o.id!, b)
    }
  })
  return out
}

function LayerRow({
  obj,
  depth,
  isGroup,
  collapsedHere,
  onToggleCollapse,
  selected,
  name,
}: {
  obj: WithId
  depth: number
  isGroup: boolean
  collapsedHere: boolean
  onToggleCollapse: () => void
  selected: boolean
  name: string
}) {
  const selectObject = useCanvasStore((s) => s.selectObject)
  const setObjectVisible = useCanvasStore((s) => s.setObjectVisible)
  const setObjectLocked = useCanvasStore((s) => s.setObjectLocked)
  const setObjectName = useCanvasStore((s) => s.setObjectName)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: obj.id!,
  })

  const hidden = obj.visible === false
  const locked = obj.locked === true

  const commit = () => {
    setObjectName(obj, draft)
    setEditing(false)
  }
  const startEditing = () => {
    setDraft(name)
    setEditing(true)
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, paddingLeft: depth * 16 }}
      className={`flex items-center gap-1 rounded px-1 py-1 text-xs ${
        selected ? 'bg-indigo-600/30 text-editor-text-strong' : 'text-editor-text-secondary hover:bg-editor-surface'
      } ${isDragging ? 'opacity-60' : ''} ${hidden ? 'opacity-40' : ''}`}
    >
      <button
        className="cursor-grab text-editor-text-subtle hover:text-editor-text-secondary"
        {...attributes}
        {...listeners}
        title="Drag to reorder"
      >
        <GripVertical size={14} />
      </button>
      {isGroup ? (
        <button
          onClick={onToggleCollapse}
          title={collapsedHere ? 'Expand group' : 'Collapse group'}
          className="shrink-0 text-editor-text-muted hover:text-editor-text"
        >
          {collapsedHere ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
      ) : (
        <span className="inline-block w-3.5 shrink-0" />
      )}
      <span className="shrink-0">{iconFor(obj)}</span>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            else if (e.key === 'Escape') setEditing(false)
          }}
          className="min-w-0 flex-1 rounded border border-editor-input bg-editor-bg px-1 text-xs text-editor-text-strong outline-none"
        />
      ) : (
        <button
          onClick={() => !locked && selectObject(obj)}
          onDoubleClick={startEditing}
          className="min-w-0 flex-1 truncate text-left"
          title={locked ? 'Locked' : 'Click to select, double-click to rename'}
        >
          {name}
        </button>
      )}
      <button
        onClick={() => setObjectLocked(obj, !locked)}
        title={locked ? 'Unlock' : 'Lock'}
        className={`shrink-0 ${locked ? 'text-indigo-400' : 'text-editor-text-subtle hover:text-editor-text'}`}
      >
        {locked ? <Lock size={14} /> : <Unlock size={14} />}
      </button>
      <button
        onClick={() => setObjectVisible(obj, hidden)}
        title={hidden ? 'Show' : 'Hide'}
        className="shrink-0 text-editor-text-muted hover:text-editor-text"
      >
        {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  )
}

export function LayersPanel() {
  useCanvasStore((s) => s.tick) // refresh on add/remove/reorder/visibility/lock/rename
  const canvas = useCanvasStore((s) => s.canvas)
  const selection = useCanvasStore((s) => s.selection)
  const groupSelection = useCanvasStore((s) => s.groupSelection)
  const ungroupSelection = useCanvasStore((s) => s.ungroupSelection)
  const moveLayerObject = useCanvasStore((s) => s.moveLayerObject)
  const [collapsed, setCollapsed] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const canGroup = selection.length >= 2
  const canUngroup = selection.length === 1 && selection[0]?.type === 'group'
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const bottomFirst = (canvas?.getObjects() ?? []) as WithId[]
  const rows: Row[] = []
  flattenRows(bottomFirst, 0, null, collapsedGroups, rows)
  const selectedIds = new Set(selection.map((o) => (o as WithId).id))
  const names = buildNames(rows.map((r) => r.obj))

  const toggleCollapse = (id: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id || !canvas) return
    const activeRow = rows.find((r) => r.obj.id === active.id)
    const overRow = rows.find((r) => r.obj.id === over.id)
    if (!activeRow || !overRow) return
    // Dropping a group onto its own descendant would make it its own
    // ancestor — no-op instead of corrupting the object graph.
    if (activeRow.isGroup && isDescendantRow(rows, activeRow.obj.id!, overRow)) return

    // Dropping directly on a (different) group's own row makes the dragged
    // object its first child; otherwise the dragged object becomes a sibling
    // of the row it was dropped on, inserted just before it.
    const targetIsGroup = overRow.isGroup && overRow.obj.id !== activeRow.obj.id
    const toParent = targetIsGroup ? (overRow.obj as unknown as fabric.Group) : overRow.parent

    const siblingsTopFirst = (
      toParent ? toParent.getObjects() : canvas.getObjects()
    )
      .slice()
      .reverse()
      .filter((o) => o !== activeRow.obj) as WithId[]

    const insertAt = targetIsGroup ? 0 : siblingsTopFirst.findIndex((o) => o.id === overRow.obj.id)
    if (insertAt < 0) return
    const newTopFirst = [
      ...siblingsTopFirst.slice(0, insertAt),
      activeRow.obj,
      ...siblingsTopFirst.slice(insertAt),
    ]
    const newBottomFirst = [...newTopFirst].reverse()
    moveLayerObject(activeRow.obj, toParent, newBottomFirst.indexOf(activeRow.obj))
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pb-1 pt-3">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-editor-text-subtle hover:text-editor-text-secondary"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          Layers
        </button>
        <div className="flex items-center gap-0.5">
          <button
            onClick={groupSelection}
            disabled={!canGroup}
            title="Group (⌘G)"
            className="rounded p-1 text-editor-text-muted hover:bg-editor-surface hover:text-editor-text disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <GroupIcon size={14} />
          </button>
          <button
            onClick={ungroupSelection}
            disabled={!canUngroup}
            title="Ungroup (⇧⌘G)"
            className="rounded p-1 text-editor-text-muted hover:bg-editor-surface hover:text-editor-text disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Ungroup size={14} />
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {rows.length === 0 ? (
            <div className="px-2 py-2 text-xs text-editor-text-subtle">No layers yet</div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={rows.map((r) => r.obj.id!)} strategy={verticalListSortingStrategy}>
                {rows.map((r) => (
                  <LayerRow
                    key={r.obj.id}
                    obj={r.obj}
                    depth={r.depth}
                    isGroup={r.isGroup}
                    collapsedHere={r.obj.id ? collapsedGroups.has(r.obj.id) : false}
                    onToggleCollapse={() => r.obj.id && toggleCollapse(r.obj.id)}
                    selected={selectedIds.has(r.obj.id)}
                    name={names.get(r.obj.id!) ?? layerName(r.obj)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}
    </div>
  )
}
