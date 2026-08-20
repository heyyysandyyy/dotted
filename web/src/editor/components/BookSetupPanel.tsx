import { useEffect, useRef, useState } from 'react'
import { BOOK_BLEED_PX, BOOK_PRESETS } from '../constants'
import type { SizePreset } from '../constants'
import { useCanvasStore } from '../store/useCanvasStore'

interface Props {
  /** The book preset id clicked in the preset grid; selectable via the dropdown below. */
  initialPresetId: string
  onCreated: () => void
}

const DEFAULT_PAGE_COUNT = 24

/** Round up to the nearest even number, minimum 2 (UX-015: interior pages come
 *  in left/right pairs, one spread canvas per pair). */
function snapPageCount(n: number): number {
  const clamped = Math.max(2, Math.round(n) || 2)
  return clamped % 2 === 0 ? clamped : clamped + 1
}

/**
 * Book setup flow shown in the new-design modal once a Book preset is picked
 * (UX-015). Lets the user pick the trim size and interior page count, previews
 * the cover/spread bleed+trim+cut-mark layout, then creates the book project.
 */
export function BookSetupPanel({ initialPresetId, onCreated }: Props) {
  const newBookProject = useCanvasStore((s) => s.newBookProject)
  const [presetId, setPresetId] = useState(
    BOOK_PRESETS.some((p) => p.id === initialPresetId) ? initialPresetId : BOOK_PRESETS[0].id,
  )
  const [pageCountStr, setPageCountStr] = useState(String(DEFAULT_PAGE_COUNT))

  const preset = BOOK_PRESETS.find((p) => p.id === presetId) ?? BOOK_PRESETS[0]
  const pageCount = snapPageCount(Number(pageCountStr))

  const onBlurPageCount = () => setPageCountStr(String(snapPageCount(Number(pageCountStr))))

  const create = () => {
    newBookProject(preset, pageCount)
    onCreated()
  }

  const label = 'flex flex-col text-xs text-editor-text-muted'
  const input =
    'mt-1 rounded border border-editor-strong bg-editor-surface px-2 py-1 text-sm text-editor-text-strong outline-none focus:border-editor-input'

  return (
    <div className="rounded-lg border border-editor-strong p-4">
      <div className="mb-2 text-sm font-medium text-editor-text">Book setup</div>
      <div className="mb-4 flex items-end gap-3">
        <label className={label}>
          Size
          <select
            value={presetId}
            onChange={(e) => setPresetId(e.target.value)}
            className={`${input} w-40`}
          >
            {BOOK_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({(p.width / 300).toFixed(2)}×{(p.height / 300).toFixed(2)} in)
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Page count (interior)
          <input
            type="number"
            min={2}
            step={2}
            value={pageCountStr}
            onChange={(e) => setPageCountStr(e.target.value)}
            onBlur={onBlurPageCount}
            className={`${input} w-24`}
          />
        </label>
        <button
          onClick={create}
          className="ml-auto rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Create book
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-8">
        <BookThumb kind="cover" preset={preset} />
        <BookThumb kind="spread" preset={preset} />
      </div>

      <div className="grid grid-cols-4 gap-3 rounded-md bg-editor-surface/60 p-3 text-xs">
        <Stat label="Bleed" value="0.125 in" />
        <Stat label="Cut marks" value="Corners + spine" />
        <Stat label="Resolution" value="300 dpi" />
        <Stat label="Total pages" value={String(1 + pageCount)} />
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-editor-text-subtle">{label}</div>
      <div className="font-medium text-editor-text">{value}</div>
    </div>
  )
}

/** Fixed preview height (px) shared by the cover and spread thumbnails — width
 *  follows from each one's own aspect ratio, so a wide spread reads naturally
 *  wider than its cover instead of shrinking to match a shared box. Every book
 *  preset's spread stays well under the panel's width at this height. */
const THUMB_BOX_H = 110
/** Visual (not to-scale) length/offset for cut-mark ticks in the small preview. */
const MARK_LEN = 5
const MARK_GAP = 2

/** Draw a cover or spread bleed/trim/cut-mark preview onto a 2D canvas. */
function BookThumb({ kind, preset }: { kind: 'cover' | 'spread'; preset: SizePreset }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const trimW = kind === 'cover' ? preset.width : preset.width * 2
  const trimH = preset.height
  const bleed = BOOK_BLEED_PX
  const fullW = trimW + bleed * 2
  const fullH = trimH + bleed * 2
  const scale = THUMB_BOX_H / fullH
  const boxW = fullW * scale
  const boxH = THUMB_BOX_H

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const dpr = window.devicePixelRatio || 1
    el.width = boxW * dpr
    el.height = boxH * dpr
    el.style.width = `${boxW}px`
    el.style.height = `${boxH}px`
    const ctx = el.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, boxW, boxH)

    // Bleed border (full box) behind the white page area.
    ctx.fillStyle = '#a1a1aa'
    ctx.fillRect(0, 0, boxW, boxH)

    const bx = bleed * scale
    const by = bleed * scale
    const pageW = boxW - bx * 2
    const pageH = boxH - by * 2
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(bx, by, pageW, pageH)

    // Dashed trim line around the page area.
    ctx.strokeStyle = '#18181b'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 2])
    ctx.strokeRect(bx + 0.5, by + 0.5, pageW - 1, pageH - 1)
    ctx.setLineDash([])

    // Outer-corner cut marks: a horizontal + vertical tick just outside each
    // trim corner, in the bleed margin.
    const corners: [number, number, 1 | -1, 1 | -1][] = [
      [bx, by, -1, -1],
      [bx + pageW, by, 1, -1],
      [bx, by + pageH, -1, 1],
      [bx + pageW, by + pageH, 1, 1],
    ]
    ctx.strokeStyle = '#18181b'
    ctx.lineWidth = 1
    for (const [cx, cy, dx, dy] of corners) {
      ctx.beginPath()
      ctx.moveTo(cx + dx * MARK_GAP, cy)
      ctx.lineTo(cx + dx * (MARK_GAP + MARK_LEN), cy)
      ctx.moveTo(cx, cy + dy * MARK_GAP)
      ctx.lineTo(cx, cy + dy * (MARK_GAP + MARK_LEN))
      ctx.stroke()
    }

    if (kind === 'spread') {
      const midX = bx + pageW / 2
      // Dashed spine/gutter line down the centre.
      ctx.strokeStyle = '#71717a'
      ctx.setLineDash([3, 2])
      ctx.beginPath()
      ctx.moveTo(midX, by)
      ctx.lineTo(midX, by + pageH)
      ctx.stroke()
      ctx.setLineDash([])

      // Centre spine cut marks, top and bottom.
      ctx.strokeStyle = '#18181b'
      ctx.beginPath()
      ctx.moveTo(midX, by - MARK_GAP)
      ctx.lineTo(midX, by - MARK_GAP - MARK_LEN)
      ctx.moveTo(midX, by + pageH + MARK_GAP)
      ctx.lineTo(midX, by + pageH + MARK_GAP + MARK_LEN)
      ctx.stroke()

      // Left/right page labels.
      ctx.fillStyle = '#52525b'
      ctx.font = '9px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('Left page', bx + pageW / 4, by + pageH / 2)
      ctx.fillText('Right page', bx + (pageW * 3) / 4, by + pageH / 2)
    }
  }, [boxW, boxH, bleed, scale, kind])

  return (
    <div className="flex flex-col items-center gap-1.5">
      <canvas ref={canvasRef} className="rounded-sm shadow" />
      <div className="text-xs text-editor-text-subtle">{kind === 'cover' ? 'Cover' : 'Spread'}</div>
    </div>
  )
}
