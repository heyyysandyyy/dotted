import { Circle, Lasso, Square, WandSparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CollapsibleSection } from '../../editor/components/CollapsibleSection'
import { DEFAULT_WAND_TOLERANCE, usePhotoEditorStore } from '../store/usePhotoEditorStore'
import type { SelectionCombine, SelectionTool } from '../store/usePhotoEditorStore'
import { AdjustmentSlider } from './AdjustmentSlider'
import { hasSelection } from '../utils/selection'

const TOOLS: { tool: SelectionTool; label: string; icon: LucideIcon }[] = [
  { tool: 'rect', label: 'Rectangle marquee', icon: Square },
  { tool: 'ellipse', label: 'Ellipse marquee', icon: Circle },
  { tool: 'lasso', label: 'Lasso', icon: Lasso },
  { tool: 'wand', label: 'Magic wand', icon: WandSparkles },
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
  const selection = usePhotoEditorStore((s) => s.adjustments.selection)
  const tool = usePhotoEditorStore((s) => s.selectionTool)
  const setTool = usePhotoEditorStore((s) => s.setSelectionTool)
  const combine = usePhotoEditorStore((s) => s.selectionCombine)
  const setCombine = usePhotoEditorStore((s) => s.setSelectionCombine)
  const wandTolerance = usePhotoEditorStore((s) => s.wandTolerance)
  const setWandTolerance = usePhotoEditorStore((s) => s.setWandTolerance)
  const wandContiguous = usePhotoEditorStore((s) => s.wandContiguous)
  const setWandContiguous = usePhotoEditorStore((s) => s.setWandContiguous)
  const setFeather = usePhotoEditorStore((s) => s.setSelectionFeather)
  const invert = usePhotoEditorStore((s) => s.invertSelection)
  const clear = usePhotoEditorStore((s) => s.clearSelection)
  const selected = hasSelection(selection)

  return (
    <CollapsibleSection title="Selection" storageKey="photo-selection" className="space-y-3 border-t border-editor p-4">
      <div className="flex gap-1" role="group" aria-label="Selection tool">
        {TOOLS.map(({ tool: t, label, icon: Icon }) => (
          <button
            key={t}
            title={label}
            aria-label={label}
            aria-pressed={tool === t}
            onClick={() => setTool(tool === t ? null : t)}
            className={`flex flex-1 items-center justify-center rounded border py-1.5 ${
              tool === t
                ? 'border-indigo-500 bg-indigo-600 text-white'
                : 'border-editor-strong text-editor-text-secondary hover:border-editor-input hover:text-editor-text'
            }`}
          >
            <Icon size={14} />
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1" role="group" aria-label="Combine selection">
        {COMBINES.map(({ combine: c, label }) => (
          <button key={c} onClick={() => setCombine(c)} className={chip(combine === c)}>
            {label}
          </button>
        ))}
      </div>
      <p className="text-[11px] leading-snug text-editor-text-subtle">Hold Shift to add, Alt to subtract.</p>

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

      <AdjustmentSlider
        label="Feather"
        value={selection.feather}
        min={0}
        max={100}
        onChange={setFeather}
        onReset={() => setFeather(0)}
      />

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

      {selected && (
        <p className="text-[11px] leading-snug text-indigo-400">
          Adjustments below apply only inside the selection.
        </p>
      )}
    </CollapsibleSection>
  )
}
