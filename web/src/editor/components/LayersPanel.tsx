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
  GripVertical,
} from 'lucide-react'
import type * as fabric from 'fabric'
import { useCanvasStore } from '../store/useCanvasStore'
import { layerName } from '../utils'

type WithId = fabric.FabricObject & { id?: string }

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

function LayerRow({ obj, selected }: { obj: WithId; selected: boolean }) {
  const selectObject = useCanvasStore((s) => s.selectObject)
  const setObjectVisible = useCanvasStore((s) => s.setObjectVisible)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: obj.id! })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1 rounded px-1 py-1 text-xs ${
        selected ? 'bg-indigo-600/30 text-white' : 'text-neutral-300 hover:bg-neutral-800'
      } ${isDragging ? 'opacity-60' : ''}`}
    >
      <button
        className="cursor-grab text-neutral-500 hover:text-neutral-300"
        {...attributes}
        {...listeners}
        title="Drag to reorder"
      >
        <GripVertical size={14} />
      </button>
      <button
        onClick={() => selectObject(obj)}
        className="flex flex-1 items-center gap-2 overflow-hidden text-left"
      >
        <span className="shrink-0">{iconFor(obj)}</span>
        <span className="truncate">{layerName(obj)}</span>
      </button>
      <button
        onClick={() => setObjectVisible(obj, obj.visible === false)}
        title={obj.visible === false ? 'Show' : 'Hide'}
        className="shrink-0 text-neutral-400 hover:text-neutral-200"
      >
        {obj.visible === false ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  )
}

export function LayersPanel() {
  useCanvasStore((s) => s.tick) // refresh on add/remove/reorder/visibility
  const canvas = useCanvasStore((s) => s.canvas)
  const selection = useCanvasStore((s) => s.selection)
  const applyStackingOrder = useCanvasStore((s) => s.applyStackingOrder)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  // Bottom-first from fabric; display top-first.
  const bottomFirst = (canvas?.getObjects() ?? []) as WithId[]
  const topFirst = [...bottomFirst].reverse()
  const selectedIds = new Set(selection.map((o) => (o as WithId).id))

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
      <div className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Layers
      </div>
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
                <LayerRow key={obj.id} obj={obj} selected={selectedIds.has(obj.id)} />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  )
}
