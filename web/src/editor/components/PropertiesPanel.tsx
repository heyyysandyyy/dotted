import { useCanvasStore } from '../store/useCanvasStore'

function NumberField({
  label,
  value,
  onCommit,
}: {
  label: string
  value: number
  onCommit: (v: number) => void
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-neutral-400">
      <span className="w-8">{label}</span>
      <input
        type="number"
        value={Math.round(value)}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (!Number.isNaN(v)) onCommit(v)
        }}
        className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-right text-neutral-100 outline-none focus:border-neutral-500"
      />
    </label>
  )
}

export function PropertiesPanel() {
  // Subscribe to tick so read-outs update live during manipulation.
  useCanvasStore((s) => s.tick)
  const selection = useCanvasStore((s) => s.selection)
  const updateActive = useCanvasStore((s) => s.updateActive)

  if (selection.length === 0) {
    return (
      <div className="p-4 text-xs text-neutral-500">
        Select an object to edit its position and size.
      </div>
    )
  }

  if (selection.length > 1) {
    return (
      <div className="p-4 text-xs text-neutral-500">
        {selection.length} objects selected
      </div>
    )
  }

  const obj = selection[0]
  const w = obj.getScaledWidth()
  const h = obj.getScaledHeight()

  return (
    <div className="space-y-3 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Position &amp; size
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X" value={obj.left ?? 0} onCommit={(v) => updateActive({ left: v })} />
        <NumberField label="Y" value={obj.top ?? 0} onCommit={(v) => updateActive({ top: v })} />
        <NumberField
          label="W"
          value={w}
          onCommit={(v) => updateActive({ scaleX: Math.max(1, v) / (obj.width || 1) })}
        />
        <NumberField
          label="H"
          value={h}
          onCommit={(v) => updateActive({ scaleY: Math.max(1, v) / (obj.height || 1) })}
        />
      </div>
      <NumberField
        label="Rot"
        value={obj.angle ?? 0}
        onCommit={(v) => updateActive({ angle: v })}
      />
    </div>
  )
}
