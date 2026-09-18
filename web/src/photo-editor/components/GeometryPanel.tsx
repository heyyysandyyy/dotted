import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { ArrowLeftRight, FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw } from 'lucide-react'
import { CollapsibleSection } from '../../editor/components/CollapsibleSection'
import { usePhotoEditorStore } from '../store/usePhotoEditorStore'
import { AdjustmentSlider } from './AdjustmentSlider'
import { FULL_CROP, GEOMETRY_LIMITS, fitCropToAspect } from '../utils/geometry'
import type { GeometryPlan, NormRect, PhotoGeometry, Resample } from '../utils/geometry'

interface Props {
  /** The finished plan (crop and resize applied) — the output size the
   *  resize fields show and edit. */
  plan: GeometryPlan
}

/** Crop aspect presets: width ÷ height, or 'original' for the frame's own. */
const ASPECTS: { label: string; value: number | 'original' | null }[] = [
  { label: 'Free', value: null },
  { label: 'Original', value: 'original' },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:2', value: 3 / 2 },
  { label: '16:9', value: 16 / 9 },
]

const RESAMPLE_LABEL: Record<Resample, string> = { smooth: 'Smooth', nearest: 'Nearest' }

const isFullCrop = (c: NormRect) => c.x === 0 && c.y === 0 && c.w === 1 && c.h === 1

const chip = (active: boolean) =>
  `rounded border px-2 py-0.5 text-xs ${
    active
      ? 'border-indigo-500 bg-indigo-600 text-white'
      : 'border-editor-strong text-editor-text-secondary hover:border-editor-input'
  }`
const iconButton =
  'flex flex-1 items-center justify-center rounded border border-editor-strong py-1.5 text-editor-text-secondary hover:border-editor-input hover:text-editor-text'

/**
 * PHOTO-009's geometry tools: crop (with aspect presets), 90° turns, flips,
 * straighten, free rotation, keystone perspective correction, and resize with
 * a choice of resampling. Sits at the top of the sidebar — framing is decided
 * before tone and colour, and every panel below works on the framed result.
 *
 * Every change goes through the store's setGeometry, so it lands in the same
 * undo history as the adjustments (PHOTO-005) and in the edit metadata saved
 * with the image (PHOTO-006).
 */
export function GeometryPanel({ plan }: Props) {
  const geometry = usePhotoEditorStore((s) => s.adjustments.geometry)
  const setGeometry = usePhotoEditorStore((s) => s.setGeometry)
  const rotate90 = usePhotoEditorStore((s) => s.rotate90)
  const flip = usePhotoEditorStore((s) => s.flip)
  const cropMode = usePhotoEditorStore((s) => s.cropMode)
  const setCropMode = usePhotoEditorStore((s) => s.setCropMode)
  const cropAspect = usePhotoEditorStore((s) => s.cropAspect)
  const setCropAspect = usePhotoEditorStore((s) => s.setCropAspect)

  const frame = plan.cropFrame
  const originalAspect = frame.width / frame.height

  const pickAspect = (value: number | 'original' | null) => {
    const aspect = value === 'original' ? originalAspect : value
    setCropAspect(aspect)
    if (aspect !== null) setGeometry({ crop: fitCropToAspect(geometry.crop, aspect, frame.width, frame.height) })
  }
  const swapAspect = () => {
    if (cropAspect === null) return
    const aspect = 1 / cropAspect
    setCropAspect(aspect)
    setGeometry({ crop: fitCropToAspect(geometry.crop, aspect, frame.width, frame.height) })
  }
  const aspectActive = (value: number | 'original' | null) => {
    const aspect = value === 'original' ? originalAspect : value
    if (aspect === null || cropAspect === null) return aspect === cropAspect
    // Either orientation of a preset counts as that preset.
    return Math.abs(aspect - cropAspect) < 1e-6 || Math.abs(1 / aspect - cropAspect) < 1e-6
  }

  const slider = (key: keyof PhotoGeometry, label: string, min: number, max: number, step = 1) => (
    <AdjustmentSlider
      label={label}
      value={geometry[key] as number}
      min={min}
      max={max}
      step={step}
      onChange={(v) => setGeometry({ [key]: v })}
      onReset={() => setGeometry({ [key]: 0 })}
    />
  )

  const geometryChanged =
    geometry.quarterTurns !== 0 || geometry.flipH || geometry.flipV || geometry.straighten !== 0 || geometry.angle !== 0

  return (
    <>
      <CollapsibleSection
        title="Crop & rotate"
        storageKey="photo-crop-rotate"
        className="space-y-4 border-t border-editor p-4"
        actions={
          (geometryChanged || !isFullCrop(geometry.crop)) && (
            <button
              onClick={() =>
                setGeometry({ quarterTurns: 0, flipH: false, flipV: false, straighten: 0, angle: 0, crop: FULL_CROP })
              }
              className="text-xs text-editor-text-muted hover:text-editor-text"
            >
              Reset
            </button>
          )
        }
      >
        <div className="space-y-2">
          <div className="flex gap-2">
            <button
              onClick={() => setCropMode(!cropMode)}
              className={`flex-1 rounded px-2 py-1.5 text-xs font-medium ${
                cropMode ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'border border-editor-strong hover:border-editor-input'
              }`}
            >
              {cropMode ? 'Done' : 'Crop'}
            </button>
            {!isFullCrop(geometry.crop) && (
              <button
                onClick={() => setGeometry({ crop: FULL_CROP })}
                className="rounded px-2 py-1.5 text-xs text-editor-text-muted hover:text-editor-text"
              >
                Clear crop
              </button>
            )}
          </div>
          {cropMode && (
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Crop aspect ratio">
              {ASPECTS.map(({ label, value }) => (
                <button key={label} onClick={() => pickAspect(value)} className={chip(aspectActive(value))}>
                  {label}
                </button>
              ))}
              {cropAspect !== null && Math.abs(cropAspect - 1) > 1e-6 && (
                <button onClick={swapAspect} title="Swap portrait/landscape" className={chip(false)}>
                  <ArrowLeftRight size={12} />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-1">
          <button onClick={() => rotate90(-1)} title="Rotate 90° left" className={iconButton}>
            <RotateCcw size={14} />
          </button>
          <button onClick={() => rotate90(1)} title="Rotate 90° right" className={iconButton}>
            <RotateCw size={14} />
          </button>
          <button
            onClick={() => flip('h')}
            title="Flip horizontal"
            aria-pressed={geometry.flipH}
            className={`${iconButton} ${geometry.flipH ? 'border-indigo-500 text-indigo-400' : ''}`}
          >
            <FlipHorizontal2 size={14} />
          </button>
          <button
            onClick={() => flip('v')}
            title="Flip vertical"
            aria-pressed={geometry.flipV}
            className={`${iconButton} ${geometry.flipV ? 'border-indigo-500 text-indigo-400' : ''}`}
          >
            <FlipVertical2 size={14} />
          </button>
        </div>

        {slider('straighten', 'Straighten', GEOMETRY_LIMITS.straighten.min, GEOMETRY_LIMITS.straighten.max, 0.1)}
        {slider('angle', 'Rotate', GEOMETRY_LIMITS.angle.min, GEOMETRY_LIMITS.angle.max, 0.1)}
      </CollapsibleSection>

      <CollapsibleSection title="Perspective" storageKey="photo-perspective" className="space-y-4 border-t border-editor p-4">
        {slider('perspectiveV', 'Vertical', GEOMETRY_LIMITS.perspective.min, GEOMETRY_LIMITS.perspective.max)}
        {slider('perspectiveH', 'Horizontal', GEOMETRY_LIMITS.perspective.min, GEOMETRY_LIMITS.perspective.max)}
      </CollapsibleSection>

      <ResizeSection plan={plan} onReset={() => setGeometry({ resizeScale: 1, resample: 'smooth' })} />
    </>
  )
}

/**
 * Output size in pixels, width and height locked together (a non-uniform
 * resize would distort the photo), plus how pixels are resampled. Edited in
 * pixels but stored as a scale, so a later crop keeps the same resize ratio.
 */
function ResizeSection({ plan, onReset }: { plan: GeometryPlan; onReset: () => void }) {
  const geometry = usePhotoEditorStore((s) => s.adjustments.geometry)
  const setGeometry = usePhotoEditorStore((s) => s.setGeometry)
  // The frame's size before resizing — what 100% means.
  const baseW = plan.width / plan.pixelScale.x
  const baseH = plan.height / plan.pixelScale.y

  const commitSize = (axis: 'w' | 'h', raw: string) => {
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) return
    const { min, max } = GEOMETRY_LIMITS.resizeScale
    setGeometry({ resizeScale: Math.max(min, Math.min(max, n / (axis === 'w' ? baseW : baseH))) })
  }

  return (
    <CollapsibleSection
      title="Resize"
      storageKey="photo-resize"
      className="space-y-3 border-t border-editor p-4"
      actions={
        (geometry.resizeScale !== 1 || geometry.resample !== 'smooth') && (
          <button onClick={onReset} className="text-xs text-editor-text-muted hover:text-editor-text">
            Reset
          </button>
        )
      }
    >
      <div className="flex items-center gap-2 text-xs text-editor-text-muted">
        <SizeField label="Width" value={plan.width} onCommit={(v) => commitSize('w', v)} />
        <span>×</span>
        <SizeField label="Height" value={plan.height} onCommit={(v) => commitSize('h', v)} />
        <span>px</span>
      </div>
      <div className="text-xs text-editor-text-muted">
        {Math.round((plan.width / baseW) * 100)}% of {Math.round(baseW)} × {Math.round(baseH)}
      </div>
      <div className="flex items-center gap-1" role="group" aria-label="Resampling">
        {(['smooth', 'nearest'] as Resample[]).map((r) => (
          <button key={r} onClick={() => setGeometry({ resample: r })} className={chip(geometry.resample === r)}>
            {RESAMPLE_LABEL[r]}
          </button>
        ))}
      </div>
    </CollapsibleSection>
  )
}

/** A pixel-size field that commits on Enter or blur, so typing "12" on the
 *  way to "1200" doesn't resize the image to 12px in between. */
function SizeField({ label, value, onCommit }: { label: string; value: number; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft !== null) onCommit(draft)
    setDraft(null)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') setDraft(null)
  }
  return (
    <input
      type="number"
      aria-label={label}
      min={1}
      value={draft ?? String(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      className="w-20 rounded border border-editor-strong bg-editor-surface px-1.5 py-0.5 text-right text-editor-text-strong outline-none focus:border-editor-input"
    />
  )
}
