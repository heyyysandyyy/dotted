import { useRef, useState } from 'react'
import { ImagePlus, Ban, Eraser } from 'lucide-react'
import { useCanvasStore } from '../store/useCanvasStore'
import { isText, isShape } from '../utils'
import { ColorField } from './ColorField'
import { FillStrokeControl } from './FillStrokeControl'
import { EffectsPanel } from './EffectsPanel'
import { AlignmentToolbar } from './AlignmentToolbar'
import { StyleTools } from './StyleTools'

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

/** Canvas-level controls shown when no object is selected (CLR-001). */
function CanvasBackground() {
  const backgroundColor = useCanvasStore((s) => s.backgroundColor)
  const setBackgroundColor = useCanvasStore((s) => s.setBackgroundColor)
  const setBackgroundImageFromFile = useCanvasStore((s) => s.setBackgroundImageFromFile)
  const clearBackground = useCanvasStore((s) => s.clearBackground)
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="space-y-3 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Background
      </div>
      <ColorField
        label="Colour"
        // The native colour input needs a valid hex; show white for transparent.
        value={backgroundColor || '#ffffff'}
        onChange={setBackgroundColor}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex w-full items-center justify-center gap-1.5 rounded border border-neutral-700 px-2 py-1.5 text-xs text-neutral-300 hover:border-neutral-500"
      >
        <ImagePlus size={14} />
        Background image
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) setBackgroundImageFromFile(file)
          e.target.value = ''
        }}
      />
      <button
        onClick={clearBackground}
        className="flex w-full items-center justify-center gap-1.5 rounded border border-neutral-700 px-2 py-1.5 text-xs text-neutral-400 hover:border-neutral-500"
      >
        <Ban size={14} />
        Clear / transparent
      </button>
      <p className="text-[11px] leading-snug text-neutral-600">
        Clear the background for a transparent PNG. JPEG and PDF fill
        transparency with white.
      </p>
    </div>
  )
}

export function PropertiesPanel() {
  // Subscribe to tick so read-outs update live during manipulation.
  useCanvasStore((s) => s.tick)
  const selection = useCanvasStore((s) => s.selection)
  const updateActive = useCanvasStore((s) => s.updateActive)
  const removeImageBackground = useCanvasStore((s) => s.removeImageBackground)
  const bgRemoving = useCanvasStore((s) => s.bgRemoving)
  const [bgTolerance, setBgTolerance] = useState(60)

  if (selection.length === 0) {
    return <CanvasBackground />
  }

  if (selection.length > 1) {
    return (
      <div>
        <AlignmentToolbar />
        <StyleTools />
        <div className="px-4 pb-4 pt-2 text-xs text-neutral-500">
          {selection.length} objects selected
        </div>
      </div>
    )
  }

  const obj = selection[0]
  const w = obj.getScaledWidth()
  const h = obj.getScaledHeight()

  return (
    <div>
      <AlignmentToolbar />
      <StyleTools />
      <div className="space-y-3 border-t border-neutral-800 p-4">
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

      {isShape(obj) && (
        <div className="space-y-2 border-t border-neutral-800 pt-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Style
          </div>
          <FillStrokeControl obj={obj} allowFill={obj.type !== 'line'} />
          <NumberField
            label="SW"
            value={obj.strokeWidth ?? 0}
            onCommit={(v) => updateActive({ strokeWidth: Math.max(0, v) })}
          />
        </div>
      )}

      {isText(obj) && (
        <div className="space-y-2 border-t border-neutral-800 pt-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Text
          </div>
          <label className="block text-xs text-neutral-400">
            <div className="mb-1 flex justify-between">
              <span>Line height</span>
              <span>{(obj.lineHeight ?? 1.16).toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.8}
              max={3}
              step={0.05}
              value={obj.lineHeight ?? 1.16}
              onChange={(e) => updateActive({ lineHeight: Number(e.target.value) })}
              className="w-full accent-indigo-500"
            />
          </label>
        </div>
      )}

      {obj.type === 'image' && (
        <div className="space-y-2 border-t border-neutral-800 pt-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Image
          </div>
          <button
            onClick={() => removeImageBackground(bgTolerance)}
            disabled={bgRemoving}
            className="flex w-full items-center justify-center gap-1.5 rounded border border-neutral-700 px-2 py-1.5 text-xs text-neutral-300 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Eraser size={14} />
            {bgRemoving ? 'Removing…' : 'Remove background'}
          </button>
          <label className="block text-[11px] text-neutral-400">
            <div className="mb-1 flex justify-between">
              <span>Tolerance</span>
              <span>{bgTolerance}</span>
            </div>
            <input
              type="range"
              min={10}
              max={150}
              step={5}
              value={bgTolerance}
              onChange={(e) => setBgTolerance(Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
          </label>
          <p className="text-[11px] leading-snug text-neutral-600">
            Removes a solid/near-solid background by colour — higher tolerance
            erases more. Click again after changing it to re-tune from the
            original. Best on flat backgrounds, not busy photos.
          </p>
        </div>
      )}

      <EffectsPanel obj={obj} />
      </div>
    </div>
  )
}
