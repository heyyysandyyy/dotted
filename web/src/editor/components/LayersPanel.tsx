import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
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
} from 'lucide-react'
import type * as fabric from 'fabric'
import { useCanvasStore } from '../store/useCanvasStore'
import { layerName } from '../utils'

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
    default:
      return <Square size={14} />
  }
}

/**
 * Display name per object: a custom name if set, otherwise the derived base
 * name with a 1-based index appended when more than one object shares it
 * (e.g. "Rectangle 1", "Rectangle 2").
 */
function buildNames(topFirst: WithId[]): Map<string, string> {
  const counts = new Map<string, number>()
  topFirst.forEach((o) => {
    const b = layerName(o)
    counts.set(b, (counts.get(b) ?? 0) + 1)
  })
  const seen = new Map<string, number>()
  const out = new Map<string, string>()
  topFirst.forEach((o) => {
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

function LayerRow({ obj, selected, name }: { obj: WithId; selected: boolean; name: string }) {
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
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1 rounded px-1 py-1 text-xs ${
        selected ? 'bg-indigo-600/30 text-white' : 'text-neutral-300 hover:bg-neutral-800'
      } ${isDragging ? 'opacity-60' : ''} ${hidden ? 'opacity-40' : ''}`}
    >
      <button
        className="cursor-grab text-neutral-500 hover:text-neutral-300"
        {...attributes}
        {...listeners}
        title="Drag to reorder"
      >
        <GripVertical size={14} />
      </button>
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
          className="min-w-0 flex-1 rounded border border-neutral-600 bg-neutral-900 px-1 text-xs text-white outline-none"
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
        className={`shrink-0 ${locked ? 'text-indigo-400' : 'text-neutral-500 hover:text-neutral-200'}`}
      >
        {locked ? <Lock size={14} /> : <Unlock size={14} />}
      </button>
      <button
        onClick={() => setObjectVisible(obj, hidden)}
        title={hidden ? 'Show' : 'Hide'}
        className="shrink-0 text-neutral-400 hover:text-neutral-200"
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
  const applyStackingOrder = useCanvasStore((s) => s.applyStackingOrder)
  const groupSelection = useCanvasStore((s) => s.groupSelection)
  const ungroupSelection = useCanvasStore((s) => s.ungroupSelection)
  const [collapsed, setCollapsed] = useState(false)
  const canGroup = selection.length >= 2
  const canUngroup = selection.length === 1 && selection[0]?.type === 'group'
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  // Bottom-first from fabric; display top-first.
  const bottomFirst = (canvas?.getObjects() ?? []) as WithId[]
  const topFirst = [...bottomFirst].reverse()
  const selectedIds = new Set(selection.map((o) => (o as WithId).id))
  const names = buildNames(topFirst)

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = topFirst.map((o) => o.id!)
    const from = ids.indexOf(active.id as string)
    const to = ids.indexOf(over.id as string)
    if (from < 0 || to < 0) return
    const newTopFirst = arrayMove(topFirst, from, to)
    applyStackingOrder([...newTopFirst].reverse())
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pb-1 pt-3">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-neutral-500 hover:text-neutral-300"
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
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <GroupIcon size={14} />
          </button>
          <button
            onClick={ungroupSelection}
            disabled={!canUngroup}
            title="Ungroup (⇧⌘G)"
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Ungroup size={14} />
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {topFirst.length === 0 ? (
            <div className="px-2 py-2 text-xs text-neutral-600">No layers yet</div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext
                items={topFirst.map((o) => o.id!)}
                strategy={verticalListSortingStrategy}
              >
                {topFirst.map((obj) => (
                  <LayerRow
                    key={obj.id}
                    obj={obj}
                    selected={selectedIds.has(obj.id)}
                    name={names.get(obj.id!) ?? layerName(obj)}
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
