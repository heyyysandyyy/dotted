import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { ChevronDown, ChevronUp, Eye, EyeOff, Plus, Trash2 } from 'lucide-react'
import { CollapsibleSection } from '../../editor/components/CollapsibleSection'
import { activeLayer, usePhotoEditorStore } from '../store/usePhotoEditorStore'
import type { AdjustmentLayer } from '../store/usePhotoEditorStore'
import { AdjustmentSlider } from './AdjustmentSlider'
import { hasSelection } from '../utils/selection'

/**
 * Adjustment layers (PHOTO-011 phase 2). The stack reads top-down like every
 * photo editor's layers panel — the top row applies last — with the base
 * image at the bottom. Clicking a row makes it the target: every tone,
 * colour and detail panel below then edits that layer's own settings, and
 * the selection tools draw its mask.
 *
 * "New layer" takes the base selection as the new layer's mask when there is
 * one, so the usual flow is: select an area, add a layer, adjust.
 */
export function LayersPanel() {
  const layers = usePhotoEditorStore((s) => s.adjustments.layers)
  const baseHasSelection = usePhotoEditorStore((s) => hasSelection(s.adjustments.selection))
  const active = usePhotoEditorStore(activeLayer)
  const selectLayer = usePhotoEditorStore((s) => s.selectLayer)
  const addLayer = usePhotoEditorStore((s) => s.addLayer)
  const setLayerOpacity = usePhotoEditorStore((s) => s.setLayerOpacity)

  const rowBase = 'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs'
  const rowState = (isActive: boolean) =>
    isActive ? 'bg-indigo-600/20 text-editor-text-strong ring-1 ring-indigo-500' : 'hover:bg-editor-surface'

  return (
    <CollapsibleSection
      title="Layers"
      storageKey="photo-layers"
      className="space-y-3 border-t border-editor p-4"
      actions={
        <button
          onClick={addLayer}
          title={baseHasSelection ? 'New layer from the selection' : 'New adjustment layer'}
          className="flex items-center gap-1 text-xs text-editor-text-muted hover:text-editor-text"
        >
          <Plus size={12} />
          New layer
        </button>
      }
    >
      <ul className="space-y-1" aria-label="Adjustment layers">
        {[...layers].reverse().map((layer, i) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            active={active?.id === layer.id}
            isTop={i === 0}
            isBottom={i === layers.length - 1}
            rowClass={`${rowBase} ${rowState(active?.id === layer.id)}`}
          />
        ))}
        <li>
          <button onClick={() => selectLayer(null)} aria-pressed={!active} className={`${rowBase} ${rowState(!active)}`}>
            <span className="flex-1">Base image</span>
          </button>
        </li>
      </ul>

      {active && (
        <AdjustmentSlider
          label="Layer opacity"
          value={active.opacity}
          min={0}
          max={100}
          neutral={100}
          onChange={(v) => setLayerOpacity(active.id, v)}
          onReset={() => setLayerOpacity(active.id, 100)}
        />
      )}
      <p className="text-[11px] leading-snug text-editor-text-subtle">
        {active
          ? `Editing ${active.name}. The panels below change only this layer.`
          : layers.length > 0
            ? 'Editing the base image. Click a layer to edit it instead.'
            : 'Select an area, then add a layer to adjust just that part.'}
      </p>
    </CollapsibleSection>
  )
}

function LayerRow({
  layer,
  active,
  isTop,
  isBottom,
  rowClass,
}: {
  layer: AdjustmentLayer
  active: boolean
  isTop: boolean
  isBottom: boolean
  rowClass: string
}) {
  const selectLayer = usePhotoEditorStore((s) => s.selectLayer)
  const setLayerVisible = usePhotoEditorStore((s) => s.setLayerVisible)
  const deleteLayer = usePhotoEditorStore((s) => s.deleteLayer)
  const renameLayer = usePhotoEditorStore((s) => s.renameLayer)
  const moveLayer = usePhotoEditorStore((s) => s.moveLayer)
  const [renaming, setRenaming] = useState<string | null>(null)

  const commitName = () => {
    if (renaming !== null) renameLayer(layer.id, renaming)
    setRenaming(null)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitName()
    if (e.key === 'Escape') setRenaming(null)
  }
  const iconButton = 'rounded p-0.5 text-editor-text-muted hover:text-editor-text disabled:opacity-30'

  return (
    <li className={rowClass}>
      <button
        onClick={() => setLayerVisible(layer.id, !layer.visible)}
        title={layer.visible ? 'Hide layer' : 'Show layer'}
        aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`}
        className={iconButton}
      >
        {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
      </button>
      {renaming !== null ? (
        <input
          autoFocus
          aria-label="Layer name"
          value={renaming}
          onChange={(e) => setRenaming(e.target.value)}
          onBlur={commitName}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 rounded border border-editor-strong bg-editor-surface px-1 text-xs text-editor-text-strong outline-none"
        />
      ) : (
        <button
          onClick={() => selectLayer(layer.id)}
          onDoubleClick={() => setRenaming(layer.name)}
          aria-pressed={active}
          title="Click to edit, double-click to rename"
          className={`min-w-0 flex-1 truncate text-left ${layer.visible ? '' : 'opacity-50'}`}
        >
          {layer.name}
          {!hasSelection(layer.selection) && <span className="ml-1 text-editor-text-subtle">(whole photo)</span>}
        </button>
      )}
      <button onClick={() => moveLayer(layer.id, 1)} disabled={isTop} title="Move up" className={iconButton}>
        <ChevronUp size={12} />
      </button>
      <button onClick={() => moveLayer(layer.id, -1)} disabled={isBottom} title="Move down" className={iconButton}>
        <ChevronDown size={12} />
      </button>
      <button
        onClick={() => deleteLayer(layer.id)}
        title="Delete layer"
        aria-label={`Delete ${layer.name}`}
        className={iconButton}
      >
        <Trash2 size={12} />
      </button>
    </li>
  )
}
