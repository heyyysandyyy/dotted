import type * as fabric from 'fabric'
import { useCanvasStore } from '../store/useCanvasStore'
import {
  strokeStyleOf,
  strokeDashProps,
  strokeAlignmentOf,
  displayStrokeWidth,
  applyStrokeAlignment,
  type StrokeStyle,
  type StrokeAlignment,
} from '../store/storeHelpers'

const toggleBtn = (active: boolean) =>
  `flex-1 rounded p-1.5 ${active ? 'bg-editor-surface-2 text-editor-text-strong' : 'text-editor-text-secondary hover:bg-editor-surface'}`

/** A short horizontal line previewing a dash preset, drawn with the same
 *  proportions the preset itself applies (relative to a fixed stroke width
 *  so it reads clearly at icon size regardless of the shape's actual width). */
function DashPreview({ style }: { style: StrokeStyle }) {
  const { strokeDashArray, strokeLineCap } = strokeDashProps(style, 2)
  return (
    <svg width="20" height="10" viewBox="0 0 20 10" className="mx-auto">
      <line
        x1="1"
        y1="5"
        x2="19"
        y2="5"
        stroke="currentColor"
        strokeWidth={2}
        strokeDasharray={strokeDashArray?.join(' ')}
        strokeLinecap={strokeLineCap}
      />
    </svg>
  )
}

const STYLES: { value: StrokeStyle; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'spaced', label: 'Spaced' },
  { value: 'dotted', label: 'Dotted' },
]

const ALIGNMENTS: { value: StrokeAlignment; label: string }[] = [
  { value: 'center', label: 'Center' },
  { value: 'inside', label: 'Inside' },
]

/** Stroke dash style + alignment controls (UX-028) — sits in the Properties
 *  Panel's Style section alongside the UX-012 fill/stroke colour picker and
 *  the stroke-width field. Neither property has its own dedicated Fabric
 *  "style" field: style is inferred from `strokeDashArray`, alignment from
 *  whether a stroke-inset `clipPath` is present (see storeHelpers.ts for why
 *  alignment needs a real clip rather than just a `paintFirst` toggle). */
export function StrokeStyleControl({ obj }: { obj: fabric.FabricObject }) {
  const updateActive = useCanvasStore((s) => s.updateActive)
  const style = strokeStyleOf(obj)
  const alignment = strokeAlignmentOf(obj)
  const width = displayStrokeWidth(obj)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-editor-text-muted">
        <span>Style</span>
        <div className="flex gap-1">
          {STYLES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              title={label}
              className={toggleBtn(style === value)}
              onClick={() => updateActive(strokeDashProps(value, width))}
            >
              <DashPreview style={value} />
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-editor-text-muted">
        <span>Align</span>
        <div className="flex gap-1">
          {ALIGNMENTS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              title={`${label} stroke`}
              className={`${toggleBtn(alignment === value)} px-2 text-[11px]`}
              onClick={() => applyStrokeAlignment(obj, value, width).then((props) => updateActive(props))}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
