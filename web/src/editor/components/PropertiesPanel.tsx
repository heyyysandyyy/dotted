import { useRef, useState } from 'react'
import { ImagePlus, Ban, Eraser, Crop, Pencil } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { useCanvasStore } from '../store/useCanvasStore'
import { usePhotoEditorStore } from '../../photo-editor/store/usePhotoEditorStore'
import { isText, isShape } from '../utils'
import { buildPhotoEditorHandoff } from '../photoEditorHandoff'
import { ColorField } from './ColorField'
import { FillStrokeControl } from './FillStrokeControl'
import { EffectsPanel } from './EffectsPanel'
import { AlignmentToolbar } from './AlignmentToolbar'
import { StyleTools } from './StyleTools'
import { CollapsibleSection } from './CollapsibleSection'

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
    <label className="flex items-center justify-between gap-2 text-xs text-editor-text-muted">
      <span className="w-8">{label}</span>
      <input
        type="number"
        value={Math.round(value)}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (!Number.isNaN(v)) onCommit(v)
        }}
        className="w-full rounded border border-editor-strong bg-editor-surface px-2 py-1 text-right text-editor-text-strong outline-none focus:border-editor-input"
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
    <CollapsibleSection title="Background" storageKey="background" className="space-y-3 p-4">
      <ColorField
        label="Colour"
        // The native colour input needs a valid hex; show white for transparent.
        value={backgroundColor || '#ffffff'}
        onChange={setBackgroundColor}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex w-full items-center justify-center gap-1.5 rounded border border-editor-strong px-2 py-1.5 text-xs text-editor-text-secondary hover:border-editor-input"
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
        className="flex w-full items-center justify-center gap-1.5 rounded border border-editor-strong px-2 py-1.5 text-xs text-editor-text-muted hover:border-editor-input"
      >
        <Ban size={14} />
        Clear / transparent
      </button>
      <p className="text-[11px] leading-snug text-editor-text-subtle">
        Clear the background for a transparent PNG. JPEG and PDF fill
        transparency with white.
      </p>
    </CollapsibleSection>
  )
}

export function PropertiesPanel() {
  // Subscribe to tick so read-outs update live during manipulation.
  useCanvasStore((s) => s.tick)
  const selection = useCanvasStore((s) => s.selection)
  const updateActive = useCanvasStore((s) => s.updateActive)
  const removeImageBackground = useCanvasStore((s) => s.removeImageBackground)
  const bgRemoving = useCanvasStore((s) => s.bgRemoving)
  const enterCrop = useCanvasStore((s) => s.enterCrop)
  const openFromCanvas = usePhotoEditorStore((s) => s.openFromCanvas)
  const navigate = useNavigate()
  const [bgTolerance, setBgTolerance] = useState(60)

  if (selection.length === 0) {
    return <CanvasBackground />
  }

  if (selection.length > 1) {
    return (
      <div>
        <AlignmentToolbar />
        <StyleTools />
        <div className="px-4 pb-4 pt-2 text-xs text-editor-text-subtle">
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
      <CollapsibleSection
        title="Position & size"
        storageKey="position-size"
        className="space-y-3 border-t border-editor p-4"
      >
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
        <NumberField label="Rot" value={obj.angle ?? 0} onCommit={(v) => updateActive({ angle: v })} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Appearance"
        storageKey="appearance"
        className="space-y-2 border-t border-editor p-4"
      >
        <label className="block text-xs text-editor-text-muted">
          <div className="mb-1 flex justify-between">
            <span>Opacity</span>
            <span>{Math.round((obj.opacity ?? 1) * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round((obj.opacity ?? 1) * 100)}
            onChange={(e) => updateActive({ opacity: Number(e.target.value) / 100 })}
            className="w-full accent-indigo-500"
          />
        </label>
      </CollapsibleSection>

      {isShape(obj) && (
        <CollapsibleSection title="Style" storageKey="fill-stroke" className="space-y-2 border-t border-editor p-4">
          <FillStrokeControl obj={obj} allowFill={obj.type !== 'line'} />
          <NumberField
            label="SW"
            value={obj.strokeWidth ?? 0}
            onCommit={(v) => updateActive({ strokeWidth: Math.max(0, v) })}
          />
        </CollapsibleSection>
      )}

      {isText(obj) && (
        <CollapsibleSection title="Text" storageKey="text" className="space-y-2 border-t border-editor p-4">
          <label className="block text-xs text-editor-text-muted">
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
        </CollapsibleSection>
      )}

      {obj.type === 'image' && (
        <CollapsibleSection title="Image" storageKey="image" className="space-y-2 border-t border-editor p-4">
          <button
            onClick={() => {
              const { canvas, activePageId } = useCanvasStore.getState()
              if (!canvas) return
              const handoff = buildPhotoEditorHandoff(canvas, obj, activePageId)
              if (!handoff) return
              openFromCanvas(handoff.image, handoff.sourceRef)
              navigate({ to: '/photo-editor' })
            }}
            title="Edit in Photo Editor"
            className="flex w-full items-center justify-center gap-1.5 rounded border border-editor-strong px-2 py-1.5 text-xs text-editor-text-secondary hover:border-editor-input"
          >
            <Pencil size={14} />
            Edit in Photo Editor
          </button>
          <button
            onClick={enterCrop}
            title="Crop image"
            className="flex w-full items-center justify-center gap-1.5 rounded border border-editor-strong px-2 py-1.5 text-xs text-editor-text-secondary hover:border-editor-input"
          >
            <Crop size={14} />
            Crop
          </button>
          <button
            onClick={() => removeImageBackground(bgTolerance)}
            disabled={bgRemoving}
            className="flex w-full items-center justify-center gap-1.5 rounded border border-editor-strong px-2 py-1.5 text-xs text-editor-text-secondary hover:border-editor-input disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Eraser size={14} />
            {bgRemoving ? 'Removing…' : 'Remove background'}
          </button>
          <label className="block text-[11px] text-editor-text-muted">
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
          <p className="text-[11px] leading-snug text-editor-text-subtle">
            Removes a solid/near-solid background by colour — higher tolerance
            erases more. Click again after changing it to re-tune from the
            original. Best on flat backgrounds, not busy photos.
          </p>
        </CollapsibleSection>
      )}

      <EffectsPanel obj={obj} />
    </div>
  )
}
