import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { CollapsibleSection } from '../../editor/components/CollapsibleSection'
import { CurveEditor } from './CurveEditor'
import { isIdentityCurve, CURVE_CHANNELS, type CurveChannel } from '../utils/levelsCurves'
import { usePhotoEditorStore } from '../store/usePhotoEditorStore'
import type { Histogram as HistogramData } from '../utils/histogram'

const CHANNEL_LABELS: Record<CurveChannel, string> = {
  rgb: 'RGB',
  r: 'Red',
  g: 'Green',
  b: 'Blue',
}

interface Props {
  histogram: HistogramData | null
}

/**
 * Curves (PHOTO-007 levels/curves phase): one editable tone curve per
 * channel — a composite RGB curve applied to all three, plus a red, green
 * and blue curve of its own for colour work levels can't do.
 *
 * Which channel is being edited is local state, not store state: it's a
 * view of the same adjustments rather than part of them, so it has no place
 * in the undo stack or in PHOTO-006's stored edit metadata. All four curves
 * stay live regardless of which one is on screen.
 */
export function CurvesPanel({ histogram }: Props) {
  const curves = usePhotoEditorStore((s) => s.adjustments.curves)
  const setCurve = usePhotoEditorStore((s) => s.setCurve)
  const resetCurve = usePhotoEditorStore((s) => s.resetCurve)
  const [channel, setChannel] = useState<CurveChannel>('rgb')

  const reset = !isIdentityCurve(curves[channel]) && (
    <button
      onClick={() => resetCurve(channel)}
      title={`Reset ${CHANNEL_LABELS[channel]} curve`}
      className="rounded p-1 text-editor-text-muted hover:bg-editor-surface hover:text-editor-text"
    >
      <RotateCcw size={12} />
    </button>
  )

  return (
    <CollapsibleSection
      title="Curves"
      storageKey="photo-curves"
      actions={reset}
      className="space-y-3 border-t border-editor p-4"
    >
      <div className="flex items-center rounded-md bg-editor-surface p-0.5 text-xs">
        {CURVE_CHANNELS.map((option) => (
          <button
            key={option}
            onClick={() => setChannel(option)}
            aria-pressed={channel === option}
            className={`flex-1 rounded px-2 py-1 font-medium ${
              channel === option ? 'bg-editor-surface-2 text-editor-text-strong' : 'text-editor-text-muted'
            }`}
          >
            {CHANNEL_LABELS[option]}
          </button>
        ))}
      </div>
      <CurveEditor
        points={curves[channel]}
        channel={channel}
        histogram={histogram}
        onChange={(points) => setCurve(channel, points)}
      />
      <p className="text-[11px] leading-snug text-editor-text-muted">
        Click to add a point, drag to shape the curve, double-click a point to remove it.
      </p>
    </CollapsibleSection>
  )
}
