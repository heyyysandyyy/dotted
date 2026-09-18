import { useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { cappedSize } from '../utils/geometry'
import type { GeometryPlan, NormRect } from '../utils/geometry'
import { CORNER_HANDLES, EDGE_HANDLES, dragCrop } from '../utils/cropDrag'
import type { CropHandle } from '../utils/cropDrag'
import { PREVIEW_MAX_EDGE } from '../hooks/useAdjustedPreviewCanvas'

/** Smallest the crop box can be dragged down to, on screen. */
const MIN_CROP_PX = 16

/** Shown behind a preview whose corners a free rotation left clear. */
const CHECKERBOARD = {
  backgroundColor: '#ffffff',
  backgroundImage:
    'linear-gradient(45deg,#d4d4d4 25%,transparent 25%),linear-gradient(-45deg,#d4d4d4 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#d4d4d4 75%),linear-gradient(-45deg,transparent 75%,#d4d4d4 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
}

interface Props {
  canvasRef: RefObject<HTMLCanvasElement | null>
  /** The plan the preview is rendering — the uncropped frame while cropping. */
  plan: GeometryPlan
  cropMode: boolean
  crop: NormRect
  /** Locked crop aspect as width ÷ height in pixels, or null for free. */
  cropAspect: number | null
  onCropChange: (crop: NormRect) => void
}

/**
 * The Photo Editor's preview area (PHOTO-009): the adjusted preview canvas,
 * fitted into the space available without being blown up past its own
 * pixels, and — while the crop tool is open — the crop box over it.
 *
 * The canvas's on-screen size is set here from the plan rather than left to
 * CSS `object-contain`, so the crop box can be laid over exactly the pixels
 * it's cropping.
 */
export function PhotoStage({ canvasRef, plan, cropMode, crop, cropAspect, onCropChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const render = cappedSize(plan, PREVIEW_MAX_EDGE)
  const fit = box.w > 0 && box.h > 0 ? Math.min(1, box.w / render.width, box.h / render.height) : 1
  const width = render.width * fit
  const height = render.height * fit
  // Aspect in normalized units: w/h in frame fractions.
  const ratio = cropAspect === null ? null : (cropAspect * plan.height) / plan.width

  return (
    <div ref={containerRef} className="flex h-full w-full items-center justify-center">
      <div className="relative" style={{ width, height }}>
        <canvas
          ref={canvasRef}
          style={{
            width,
            height,
            ...(plan.transparent ? CHECKERBOARD : null),
            imageRendering: plan.resample === 'nearest' ? 'pixelated' : undefined,
          }}
          className="block"
        />
        {cropMode && width > 0 && (
          <CropOverlay
            width={width}
            height={height}
            crop={crop}
            ratio={ratio}
            onChange={onCropChange}
          />
        )}
      </div>
    </div>
  )
}

interface OverlayProps {
  width: number
  height: number
  crop: NormRect
  ratio: number | null
  onChange: (crop: NormRect) => void
}

const HANDLE_POS: Record<Exclude<CropHandle, 'move'>, { x: number; y: number; cursor: string }> = {
  nw: { x: 0, y: 0, cursor: 'nwse-resize' },
  ne: { x: 1, y: 0, cursor: 'nesw-resize' },
  sw: { x: 0, y: 1, cursor: 'nesw-resize' },
  se: { x: 1, y: 1, cursor: 'nwse-resize' },
  n: { x: 0.5, y: 0, cursor: 'ns-resize' },
  s: { x: 0.5, y: 1, cursor: 'ns-resize' },
  e: { x: 1, y: 0.5, cursor: 'ew-resize' },
  w: { x: 0, y: 0.5, cursor: 'ew-resize' },
}

/**
 * The crop box: drag inside it to move, a corner or edge to resize. With an
 * aspect ratio locked only the corners show, since an edge on its own can't
 * keep the proportions. Everything outside the box is dimmed, and
 * rule-of-thirds lines sit inside it.
 */
export function CropOverlay({ width, height, crop, ratio, onChange }: OverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ handle: CropHandle; x: number; y: number; start: NormRect } | null>(null)

  const begin = (e: ReactPointerEvent<HTMLElement>) => {
    const handle = e.currentTarget.dataset.handle as CropHandle | undefined
    if (!handle) return
    e.preventDefault()
    e.stopPropagation()
    rootRef.current?.setPointerCapture?.(e.pointerId)
    drag.current = { handle, x: e.clientX, y: e.clientY, start: crop }
  }
  const move = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d) return
    const min = { w: Math.min(1, MIN_CROP_PX / width), h: Math.min(1, MIN_CROP_PX / height) }
    onChange(dragCrop(d.start, d.handle, (e.clientX - d.x) / width, (e.clientY - d.y) / height, ratio, min))
  }
  const end = (e: ReactPointerEvent) => {
    if (!drag.current) return
    drag.current = null
    rootRef.current?.releasePointerCapture?.(e.pointerId)
  }

  const left = crop.x * width
  const top = crop.y * height
  const w = crop.w * width
  const h = crop.h * height
  const shade = 'absolute bg-black/55'
  const handles = ratio === null ? [...CORNER_HANDLES, ...EDGE_HANDLES] : CORNER_HANDLES

  return (
    <div
      ref={rootRef}
      data-testid="crop-overlay"
      className="absolute inset-0 touch-none select-none"
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className={shade} style={{ left: 0, top: 0, width, height: top }} />
      <div className={shade} style={{ left: 0, top: top + h, width, height: height - top - h }} />
      <div className={shade} style={{ left: 0, top, width: left, height: h }} />
      <div className={shade} style={{ left: left + w, top, width: width - left - w, height: h }} />

      <div
        data-testid="crop-box"
        data-handle="move"
        onPointerDown={begin}
        className="absolute cursor-move border border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
        style={{ left, top, width: w, height: h }}
      >
        {[1, 2].map((i) => (
          <div key={`v${i}`} className="absolute inset-y-0 w-px bg-white/40" style={{ left: `${(i * 100) / 3}%` }} />
        ))}
        {[1, 2].map((i) => (
          <div key={`h${i}`} className="absolute inset-x-0 h-px bg-white/40" style={{ top: `${(i * 100) / 3}%` }} />
        ))}
      </div>

      {handles.map((handle) => {
        const p = HANDLE_POS[handle as Exclude<CropHandle, 'move'>]
        return (
          <div
            key={handle}
            data-testid={`crop-handle-${handle}`}
            data-handle={handle}
            onPointerDown={begin}
            className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-neutral-700 bg-white"
            style={{ left: left + p.x * w, top: top + p.y * h, cursor: p.cursor }}
          />
        )
      })}
    </div>
  )
}
