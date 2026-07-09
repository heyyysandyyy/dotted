import type * as fabric from 'fabric'
import { useCanvasStore } from '../store/useCanvasStore'
import {
  readShadowEffectByKind,
  DROP_SHADOW_DEFAULT,
  GLOW_DEFAULT,
  INNER_SHADOW_DEFAULT,
  type ShadowEffect,
} from '../utils'
import { ColorField } from './ColorField'
import { CollapsibleSection } from './CollapsibleSection'

function SliderRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-editor-text-muted">
      <span className="w-8">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-indigo-500"
      />
      <span className="w-8 text-right tabular-nums text-editor-text-secondary">{Math.round(value)}</span>
    </label>
  )
}

function EffectToggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded border px-2 py-1.5 text-xs ${
        on ? 'border-indigo-500 text-editor-text-strong' : 'border-editor-strong text-editor-text-secondary hover:border-editor-input'
      }`}
    >
      <span>{label}</span>
      <span className={`h-3 w-3 rounded-full ${on ? 'bg-indigo-500' : 'bg-editor-surface-2'}`} />
    </button>
  )
}

const DEFAULTS: Record<ShadowEffect['kind'], ShadowEffect> = {
  drop: DROP_SHADOW_DEFAULT,
  glow: GLOW_DEFAULT,
  inner: INNER_SHADOW_DEFAULT,
}

/**
 * UX-011/UX-020: shadow, glow, and inner-shadow effects for the selected
 * object. All three can be active at once (UX-020 phase 2/3) — fabric only
 * has one native shadow slot, and canvas 2D can't cast a shadow inward at
 * all, but the store/effectsEngine handle representing drop/glow past the
 * first as a synthetic clone and inner shadow as a raster-composited
 * overlay, so the panel itself just toggles each kind independently.
 */
export function EffectsPanel({ obj }: { obj: fabric.FabricObject }) {
  // Re-read the effects after each change (setShadowEffect bumps tick via history).
  useCanvasStore((s) => s.tick)
  const setShadowEffect = useCanvasStore((s) => s.setShadowEffect)
  const drop = readShadowEffectByKind(obj, 'drop')
  const glow = readShadowEffectByKind(obj, 'glow')
  const inner = readShadowEffectByKind(obj, 'inner')

  const toggle = (kind: ShadowEffect['kind'], current: ShadowEffect | null) =>
    setShadowEffect(kind, current ? null : DEFAULTS[kind])
  const update = (kind: ShadowEffect['kind'], current: ShadowEffect | null, patch: Partial<ShadowEffect>) => {
    if (current) setShadowEffect(kind, { ...current, ...patch })
  }

  return (
    <CollapsibleSection title="Effects" storageKey="effects" className="space-y-2 border-t border-editor p-4">
      <EffectToggle label="Drop shadow" on={!!drop} onClick={() => toggle('drop', drop)} />
      {drop && (
        <div className="space-y-2 pl-1 pt-1">
          <SliderRow label="X" value={drop.x} min={-50} max={50} onChange={(v) => update('drop', drop, { x: v })} />
          <SliderRow label="Y" value={drop.y} min={-50} max={50} onChange={(v) => update('drop', drop, { y: v })} />
          <SliderRow
            label="Blur"
            value={drop.blur}
            min={0}
            max={50}
            onChange={(v) => update('drop', drop, { blur: v })}
          />
          <SliderRow
            label="Spread"
            value={drop.spread}
            min={0}
            max={30}
            onChange={(v) => update('drop', drop, { spread: v })}
          />
          <ColorField label="Colour" value={drop.color} onChange={(c) => update('drop', drop, { color: c })} />
        </div>
      )}

      <EffectToggle label="Outer glow" on={!!glow} onClick={() => toggle('glow', glow)} />
      {glow && (
        <div className="space-y-2 pl-1 pt-1">
          <SliderRow
            label="Blur"
            value={glow.blur}
            min={0}
            max={100}
            onChange={(v) => update('glow', glow, { blur: v })}
          />
          <SliderRow
            label="Spread"
            value={glow.spread}
            min={0}
            max={30}
            onChange={(v) => update('glow', glow, { spread: v })}
          />
          <ColorField label="Colour" value={glow.color} onChange={(c) => update('glow', glow, { color: c })} />
        </div>
      )}

      <EffectToggle label="Inner shadow" on={!!inner} onClick={() => toggle('inner', inner)} />
      {inner && (
        <div className="space-y-2 pl-1 pt-1">
          <SliderRow label="X" value={inner.x} min={-50} max={50} onChange={(v) => update('inner', inner, { x: v })} />
          <SliderRow label="Y" value={inner.y} min={-50} max={50} onChange={(v) => update('inner', inner, { y: v })} />
          <SliderRow
            label="Blur"
            value={inner.blur}
            min={0}
            max={50}
            onChange={(v) => update('inner', inner, { blur: v })}
          />
          <ColorField label="Colour" value={inner.color} onChange={(c) => update('inner', inner, { color: c })} />
        </div>
      )}

      <p className="text-[11px] leading-snug text-editor-text-subtle">
        Any combination can be on at once; each colour's opacity sets its own strength.
      </p>
    </CollapsibleSection>
  )
}
