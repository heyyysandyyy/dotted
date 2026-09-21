import { Blend, Brush, Circle, Lasso, Square, WandSparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CollapsibleSection } from '../../editor/components/CollapsibleSection'
import {
  DEFAULT_BRUSH_HARDNESS,
  DEFAULT_BRUSH_SIZE,
  DEFAULT_WAND_TOLERANCE,
  activeLayer,
  selectActiveSelection,
  usePhotoEditorStore,
} from '../store/usePhotoEditorStore'
import type { GradientShape, SelectionCombine, SelectionTool } from '../store/usePhotoEditorStore'
import { AdjustmentSlider } from './AdjustmentSlider'
import { hasSelection } from '../utils/selection'

const TOOLS: { tool: SelectionTool; label: string; short: string; icon: LucideIcon }[] = [
  { tool: 'rect', label: 'Rectangle marquee', short: 'Box', icon: Square },
  { tool: 'ellipse', label: 'Ellipse marquee', short: 'Oval', icon: Circle },
  { tool: 'lasso', label: 'Lasso', short: 'Lasso', icon: Lasso },
  { tool: 'wand', label: 'Magic wand', short: 'Wand', icon: WandSparkles },
  { tool: 'brush', label: 'Brush', short: 'Brush', icon: Brush },
  { tool: 'gradient', label: 'Gradient', short: 'Fade', icon: Blend },
]

const GRADIENT_SHAPES: { shape: GradientShape; label: string }[] = [
  { shape: 'linear', label: 'Graduated' },
  { shape: 'radial', label: 'Radial' },
]

const COMBINES: { combine: SelectionCombine; label: string }[] = [
  { combine: 'new', label: 'New' },
  { combine: 'add', label: 'Add' },
  { combine: 'subtract', label: 'Subtract' },
]

const chip = (active: boolean) =>
  `rounded border px-2 py-0.5 text-xs ${
    active
      ? 'border-indigo-500 bg-indigo-600 text-white'
      : 'border-editor-strong text-editor-text-secondary hover:border-editor-input'
  }`

/**
 * PHOTO-011 phase 1's selection tools: rectangle and ellipse marquee, lasso
 * and magic wand, drawn on the preview (SelectionLayer). Once something is
 * selected, every tonal, colour and detail adjustment below applies inside it
 * only; geometry still reframes the whole photo.
 *
 * Shapes combine with the selection as New / Add / Subtract (Shift and Alt
 * do the same for one gesture). Feather softens the edge, Invert swaps what's
 * selected, and Deselect (Cmd/Ctrl+D) goes back to the whole photo. Each of
 * those is an undo step; which tool is active is not.
 */
export function SelectionPanel() {
  // The base selection, or the active adjustment layer's mask (phase 2).
  const selection = usePhotoEditorStore(selectActiveSelection)
  const layerName = usePhotoEditorStore((s) => activeLayer(s)?.name ?? null)
  const tool = usePhotoEditorStore((s) => s.selectionTool)
  const setTool = usePhotoEditorStore((s) => s.setSelectionTool)
  const combine = usePhotoEditorStore((s) => s.selectionCombine)
  const setCombine = usePhotoEditorStore((s) => s.setSelectionCombine)
  const wandTolerance = usePhotoEditorStore((s) => s.wandTolerance)
  const setWandTolerance = usePhotoEditorStore((s) => s.setWandTolerance)
  const wandContiguous = usePhotoEditorStore((s) => s.wandContiguous)
  const setWandContiguous = usePhotoEditorStore((s) => s.setWandContiguous)
  const brushSize = usePhotoEditorStore((s) => s.brushSize)
  const setBrushSize = usePhotoEditorStore((s) => s.setBrushSize)
  const brushHardness = usePhotoEditorStore((s) => s.brushHardness)
  const setBrushHardness = usePhotoEditorStore((s) => s.setBrushHardness)
  const gradientShape = usePhotoEditorStore((s) => s.gradientShape)
  const setGradientShape = usePhotoEditorStore((s) => s.setGradientShape)
  const setFeather = usePhotoEditorStore((s) => s.setSelectionFeather)
  const invert = usePhotoEditorStore((s) => s.invertSelection)
  const clear = usePhotoEditorStore((s) => s.clearSelection)
  const addLayer = usePhotoEditorStore((s) => s.addLayer)
  const showMask = usePhotoEditorStore((s) => s.showMask)
  const setShowMask = usePhotoEditorStore((s) => s.setShowMask)
  const selected = hasSelection(selection)

  return (
    <CollapsibleSection title="Selection" storageKey="photo-selection" className="space-y-3 border-t border-editor p-4">
      <div className="grid grid-cols-3 gap-1" role="group" aria-label="Selection tool">
        {TOOLS.map(({ tool: t, label, short, icon: Icon }) => (
          <button
            key={t}
            title={label}
            aria-label={label}
            aria-pressed={tool === t}
            onClick={() => setTool(tool === t ? null : t)}
            className={`flex flex-col items-center gap-0.5 rounded border py-1.5 text-[10px] ${
              tool === t
                ? 'border-indigo-500 bg-indigo-600 text-white'
                : 'border-editor-strong text-editor-text-secondary hover:border-editor-input hover:text-editor-text'
            }`}
          >
            <Icon size={14} />
            {short}
          </button>
        ))}
      </div>

      {/* What to do next, in order — the flow is select, then adjust, and
          nothing on screen said so. */}
      <p className="rounded bg-editor-surface px-2 py-1.5 text-[11px] leading-snug text-editor-text-secondary">
        {!tool && !selected ? (
          <>
            <b>1.</b> Pick a tool above, then drag on the photo to choose an area.
          </>
        ) : !selected ? (
          <>
            <b>2.</b> {tool === 'brush' ? 'Paint over' : tool === 'gradient' ? 'Drag across' : 'Drag on'} the photo.{' '}
            {tool === 'wand' ? 'Click a colour to select everything like it.' : ''}
          </>
        ) : (
          <>
            <b>3.</b> Move any slider below and only this area changes — or start a separate layer for it.
          </>
        )}
      </p>

      <div className="flex items-center gap-1" role="group" aria-label="Combine selection">
        {COMBINES.map(({ combine: c, label }) => (
          <button key={c} onClick={() => setCombine(c)} className={chip(combine === c)}>
            {label}
          </button>
        ))}
      </div>
      <p className="text-[11px] leading-snug text-editor-text-subtle">
        {tool === 'brush'
          ? 'Paint to add; hold Alt to erase.'
          : tool === 'gradient'
            ? 'Drag from the full-strength end to where it should fade out.'
            : 'Hold Shift to add, Alt to subtract.'}
      </p>

      {tool === 'wand' && (
        <div className="space-y-2">
          <AdjustmentSlider
            label="Tolerance"
            value={wandTolerance}
            min={0}
            max={100}
            neutral={DEFAULT_WAND_TOLERANCE}
            onChange={setWandTolerance}
            onReset={() => setWandTolerance(DEFAULT_WAND_TOLERANCE)}
          />
          <label className="flex items-center gap-2 text-xs text-editor-text-muted">
            <input
              type="checkbox"
              checked={wandContiguous}
              onChange={(e) => setWandContiguous(e.target.checked)}
              className="h-3.5 w-3.5 accent-indigo-500"
            />
            Contiguous
          </label>
        </div>
      )}

      {tool === 'brush' && (
        <div className="space-y-2">
          <AdjustmentSlider
            label="Brush size"
            value={brushSize}
            min={1}
            max={100}
            neutral={DEFAULT_BRUSH_SIZE}
            onChange={setBrushSize}
            onReset={() => setBrushSize(DEFAULT_BRUSH_SIZE)}
          />
          <AdjustmentSlider
            label="Hardness"
            value={brushHardness}
            min={0}
            max={100}
            neutral={DEFAULT_BRUSH_HARDNESS}
            onChange={setBrushHardness}
            onReset={() => setBrushHardness(DEFAULT_BRUSH_HARDNESS)}
          />
        </div>
      )}

      {tool === 'gradient' && (
        <div className="flex items-center gap-1" role="group" aria-label="Gradient shape">
          {GRADIENT_SHAPES.map(({ shape, label }) => (
            <button key={shape} onClick={() => setGradientShape(shape)} className={chip(gradientShape === shape)}>
              {label}
            </button>
          ))}
        </div>
      )}

      <AdjustmentSlider
        label="Feather"
        value={selection.feather}
        min={0}
        max={100}
        onChange={setFeather}
        onReset={() => setFeather(0)}
      />

      {selected && !layerName && (
        <button
          onClick={() => {
            addLayer()
            document.getElementById('photo-adjust-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
          className="w-full rounded bg-indigo-600 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
        >
          Adjust this area separately
        </button>
      )}

      <label className="flex items-center gap-2 text-xs text-editor-text-muted">
        <input
          type="checkbox"
          checked={showMask}
          onChange={(e) => setShowMask(e.target.checked)}
          className="h-3.5 w-3.5 accent-indigo-500"
        />
        Show mask
      </label>

      <div className="flex gap-2">
        <button
          onClick={invert}
          disabled={!selected}
          aria-pressed={selection.inverted}
          className="flex-1 rounded border border-editor-strong py-1.5 text-xs hover:border-editor-input disabled:cursor-not-allowed disabled:opacity-40"
        >
          Invert
        </button>
        <button
          onClick={clear}
          disabled={!selected}
          title="Deselect (Cmd/Ctrl+D)"
          className="flex-1 rounded border border-editor-strong py-1.5 text-xs hover:border-editor-input disabled:cursor-not-allowed disabled:opacity-40"
        >
          Deselect
        </button>
      </div>

      {layerName ? (
        <p className="text-[11px] leading-snug text-indigo-400">
          {selected
            ? `This is ${layerName}'s mask: the layer applies only inside it.`
            : `${layerName} has no mask, so it applies to the whole photo. Select an area to mask it.`}
        </p>
      ) : (
        selected && (
          <p className="text-[11px] leading-snug text-indigo-400">
            Adjustments below apply only inside the selection.
          </p>
        )
      )}
    </CollapsibleSection>
  )
}
