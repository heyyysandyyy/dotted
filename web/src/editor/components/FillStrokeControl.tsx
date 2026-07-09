import { useState } from 'react'
import type * as fabric from 'fabric'
import tinycolor from 'tinycolor2'
import { useCanvasStore } from '../store/useCanvasStore'
import { ColorPickerBody } from './ColorField'

type Target = 'fill' | 'stroke'

const asStr = (v: unknown) => (typeof v === 'string' ? v : '')
const isNone = (c: string) => !c || c === 'transparent' || (tinycolor(c).isValid() && tinycolor(c).getAlpha() === 0)

/** A "none" swatch: white with a red diagonal, like most design tools. */
const NONE_SWATCH: React.CSSProperties = {
  backgroundColor: '#fff',
  backgroundImage: 'linear-gradient(to top right, transparent 46%, #ef4444 46%, #ef4444 54%, transparent 54%)',
}

/**
 * UX-012: fill + stroke colour control. Two slightly-overlapping swatches select
 * the target — clicking one brings it forward and opens the HSV picker for that
 * target only (fill or stroke), so there's no confusing in-popover switching.
 * `allowFill` is false for lines (stroke only).
 */
export function FillStrokeControl({ obj, allowFill = true }: { obj: fabric.FabricObject; allowFill?: boolean }) {
  const updateActive = useCanvasStore((s) => s.updateActive)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<Target>(allowFill ? 'fill' : 'stroke')

  const fill = asStr(obj.fill)
  const stroke = asStr(obj.stroke)
  const cur = active === 'fill' ? fill : stroke

  const select = (t: Target) => {
    setActive(t)
    setOpen(true)
  }

  const swatchStyle = (c: string): React.CSSProperties => (isNone(c) ? NONE_SWATCH : { backgroundColor: c })

  return (
    <div className="relative flex items-center justify-between text-xs text-editor-text-muted">
      <span>Colour</span>

      {/* Illustrator-style: solid fill square in front (top-left), hollow stroke
          ring behind (bottom-right), overlapping. The active one comes forward. */}
      <div className="relative h-9 w-10">
        {/* Stroke — a ring (colour frame with a hollow centre). */}
        <button
          type="button"
          onClick={() => select('stroke')}
          title="Stroke"
          className={`absolute left-[14px] top-[10px] h-6 w-6 overflow-hidden rounded-sm border shadow-sm ${
            active === 'stroke' ? 'border-indigo-400' : 'border-editor-input'
          }`}
          style={{ ...swatchStyle(stroke), zIndex: active === 'stroke' ? 30 : 10 }}
        >
          <span className="absolute inset-[5px] rounded-[1px] bg-editor-bg" />
        </button>
        {allowFill && (
          <button
            type="button"
            onClick={() => select('fill')}
            title="Fill"
            className={`absolute left-0 top-0 h-6 w-6 rounded-sm border shadow-sm ${
              active === 'fill' ? 'border-indigo-400' : 'border-editor-input'
            }`}
            style={{ ...swatchStyle(fill), zIndex: active === 'fill' ? 30 : 20 }}
          />
        )}
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-9 z-20 w-56 rounded-lg border border-editor-strong bg-editor-bg p-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium capitalize text-editor-text">{active}</span>
              <button
                type="button"
                onClick={() => updateActive({ [active]: '' })}
                className={`rounded px-2 py-0.5 text-[11px] ${
                  isNone(cur) ? 'bg-black text-white' : 'bg-editor-surface text-editor-text-secondary hover:bg-editor-surface-2'
                }`}
              >
                None
              </button>
            </div>
            {isNone(cur) && (
              <p className="mb-2 text-[11px] text-editor-text-subtle">
                No {active} colour — pick one below to add it.
              </p>
            )}
            <ColorPickerBody
              key={active}
              value={cur || '#000000'}
              onChange={(c) => updateActive({ [active]: c })}
              onClose={() => setOpen(false)}
            />
          </div>
        </>
      )}
    </div>
  )
}
