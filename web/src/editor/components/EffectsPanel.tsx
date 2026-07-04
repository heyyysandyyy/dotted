import type * as fabric from 'fabric'
import { useCanvasStore } from '../store/useCanvasStore'
import { readShadowEffectByKind, DROP_SHADOW_DEFAULT, GLOW_DEFAULT, type ShadowEffect } from '../utils'
import { ColorField } from './ColorField'

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
    <label className="flex items-center gap-2 text-xs text-neutral-400">
      <span className="w-8">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-indigo-500"
      />
      <span className="w-8 text-right tabular-nums text-neutral-300">{Math.round(value)}</span>
    </label>
  )
}

function EffectToggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded border px-2 py-1.5 text-xs ${
        on ? 'border-indigo-500 text-white' : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'
      }`}
    >
      <span>{label}</span>
      <span className={`h-3 w-3 rounded-full ${on ? 'bg-indigo-500' : 'bg-neutral-700'}`} />
    </button>
  )
}

/**
 * UX-011: shadow + glow effects for the selected object. Both can be active
 * at once (UX-020 phase 2) — fabric only has one native shadow slot, but the
 * store/effectsEngine handle representing the second one as a synthetic
 * clone, so the panel itself just toggles each kind independently.
 */
export function EffectsPanel({ obj }: { obj: fabric.FabricObject }) {
  // Re-read the effects after each change (setShadowEffect bumps tick via history).
  useCanvasStore((s) => s.tick)
  const setShadowEffect = useCanvasStore((s) => s.setShadowEffect)
  const drop = readShadowEffectByKind(obj, 'drop')
  const glow = readShadowEffectByKind(obj, 'glow')

  const toggle = (kind: 'drop' | 'glow', current: ShadowEffect | null) =>
    setShadowEffect(kind, current ? null : kind === 'drop' ? DROP_SHADOW_DEFAULT : GLOW_DEFAULT)
  const update = (kind: 'drop' | 'glow', current: ShadowEffect | null, patch: Partial<ShadowEffect>) => {
    if (current) setShadowEffect(kind, { ...current, ...patch })
  }

  return (
    <div className="space-y-2 border-t border-neutral-800 pt-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Effects</div>

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

      <p className="text-[11px] leading-snug text-neutral-600">
        Drop shadow and outer glow can both be on at once; each colour's opacity sets its own strength.
      </p>
    </div>
  )
}
