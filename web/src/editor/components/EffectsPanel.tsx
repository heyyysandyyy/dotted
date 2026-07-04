import type * as fabric from 'fabric'
import { useCanvasStore } from '../store/useCanvasStore'
import { readShadowEffect, DROP_SHADOW_DEFAULT, GLOW_DEFAULT, type ShadowEffect } from '../utils'
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
 * UX-011: shadow + glow effects for the selected object. Fabric has a single
 * shadow slot, so drop-shadow and outer-glow are mutually exclusive; the effect
 * renders natively (so it exports) and colour opacity sets the effect strength.
 */
export function EffectsPanel({ obj }: { obj: fabric.FabricObject }) {
  // Re-read the effect after each change (setShadowEffect bumps tick via history).
  useCanvasStore((s) => s.tick)
  const setShadowEffect = useCanvasStore((s) => s.setShadowEffect)
  const effect = readShadowEffect(obj)
  const active = effect?.kind ?? null

  const toggle = (kind: 'drop' | 'glow') =>
    setShadowEffect(active === kind ? null : kind === 'drop' ? DROP_SHADOW_DEFAULT : GLOW_DEFAULT)
  const update = (patch: Partial<ShadowEffect>) => {
    if (effect) setShadowEffect({ ...effect, ...patch })
  }

  return (
    <div className="space-y-2 border-t border-neutral-800 pt-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Effects</div>

      <EffectToggle label="Drop shadow" on={active === 'drop'} onClick={() => toggle('drop')} />
      {active === 'drop' && effect && (
        <div className="space-y-2 pl-1 pt-1">
          <SliderRow label="X" value={effect.x} min={-50} max={50} onChange={(v) => update({ x: v })} />
          <SliderRow label="Y" value={effect.y} min={-50} max={50} onChange={(v) => update({ y: v })} />
          <SliderRow label="Blur" value={effect.blur} min={0} max={50} onChange={(v) => update({ blur: v })} />
          <SliderRow label="Spread" value={effect.spread} min={0} max={30} onChange={(v) => update({ spread: v })} />
          <ColorField label="Colour" value={effect.color} onChange={(c) => update({ color: c })} />
        </div>
      )}

      <EffectToggle label="Outer glow" on={active === 'glow'} onClick={() => toggle('glow')} />
      {active === 'glow' && effect && (
        <div className="space-y-2 pl-1 pt-1">
          <SliderRow label="Blur" value={effect.blur} min={0} max={100} onChange={(v) => update({ blur: v })} />
          <SliderRow label="Spread" value={effect.spread} min={0} max={30} onChange={(v) => update({ spread: v })} />
          <ColorField label="Colour" value={effect.color} onChange={(c) => update({ color: c })} />
        </div>
      )}

      <p className="text-[11px] leading-snug text-neutral-600">
        One effect at a time; the colour's opacity sets the effect strength.
      </p>
    </div>
  )
}
