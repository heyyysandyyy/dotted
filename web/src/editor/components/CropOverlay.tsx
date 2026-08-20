import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { useCanvasStore } from '../store/useCanvasStore'
import { useViewportGeometry } from '../viewportGeometry'
import { sceneDeltaToLocal } from '../cropGeometry'
import type { CropBox } from '../store/storeTypes'

const ASPECTS: { label: string; value: number | null }[] = [
  { label: 'Free', value: null },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '16:9', value: 16 / 9 },
  { label: '3:2', value: 3 / 2 },
]

/** [id, hx, hy] — hx/hy ∈ {-1,0,1} say which edges the handle moves. */
const HANDLES = [
  ['nw', -1, -1, 'nwse'],
  ['n', 0, -1, 'ns'],
  ['ne', 1, -1, 'nesw'],
  ['w', -1, 0, 'ew'],
  ['e', 1, 0, 'ew'],
  ['sw', -1, 1, 'nesw'],
  ['s', 0, 1, 'ns'],
  ['se', 1, 1, 'nwse'],
] as const

const MIN = 20 // smallest crop, in scene px

/**
 * UX-009/UX-021: inline image-crop overlay. Shows the full image with a dark
 * scrim over the uncropped region, draggable corner/edge handles, drag-to-pan
 * the selection, aspect presets, and an Apply/Cancel toolbar.
 *
 * `sel`/`cropFull` live in the image's own local (unrotated) axes, relative
 * to its scene centre at the moment crop mode was entered (cropCenter) — see
 * the doc comments on CanvasState in storeTypes.ts. All the box math below
 * (clamp, aspect lock, corner/edge dragging) works in that local frame
 * exactly as it did before rotation support existed; the only new pieces are
 * at the two boundaries where local and screen space meet:
 *  - rendering: the frame/handles/scrim are laid out as if angle were 0 (in
 *    a `S` rect computed from cropCenter + sel), then a single CSS
 *    `transform: rotate()` on their shared wrapper — origin at cropCenter's
 *    own screen position — rotates that whole rigid group into place.
 *  - dragging: a mouse delta is naturally in scene space (screen minus pan,
 *    divided by zoom); sceneDeltaToLocal rotates it back into the image's
 *    local axes before it's applied to `sel`, so dragging a handle still
 *    tracks the cursor along the image's own edges, not the screen's.
 */
export function CropOverlay() {
  const cropImage = useCanvasStore((s) => s.cropImage)
  const cropFull = useCanvasStore((s) => s.cropFull)
  const cropInitial = useCanvasStore((s) => s.cropInitial)
  const cropAngle = useCanvasStore((s) => s.cropAngle)
  const cropCenter = useCanvasStore((s) => s.cropCenter)
  const applyCrop = useCanvasStore((s) => s.applyCrop)
  const cancelCrop = useCanvasStore((s) => s.cancelCrop)
  const { rootRef, zoom, originX, originY } = useViewportGeometry(true)
  // Mounted only while cropping (see CanvasStage), so seed from the initial crop.
  const [sel, setSel] = useState<CropBox | null>(() => cropInitial)
  const [aspect, setAspect] = useState<number | null>(null)

  useEffect(() => {
    if (!cropImage) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelCrop()
      else if (e.key === 'Enter' && sel) applyCrop(sel)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cropImage, sel, cancelCrop, applyCrop])

  if (!cropImage || !cropFull || !sel) return null

  const full = cropFull

  const clamp = (b: CropBox): CropBox => {
    const width = Math.min(Math.max(b.width, MIN), full.width)
    const height = Math.min(Math.max(b.height, MIN), full.height)
    const left = Math.min(Math.max(b.left, full.left), full.left + full.width - width)
    const top = Math.min(Math.max(b.top, full.top), full.top + full.height - height)
    return { left, top, width, height }
  }

  const pickAspect = (a: number | null) => {
    setAspect(a)
    if (a) {
      const cx = sel.left + sel.width / 2
      const cy = sel.top + sel.height / 2
      let w = sel.width
      let h = w / a
      if (h > full.height) {
        h = full.height
        w = h * a
      }
      if (w > full.width) {
        w = full.width
        h = w / a
      }
      setSel(clamp({ left: cx - w / 2, top: cy - h / 2, width: w, height: h }))
    }
  }

  const startDrag =
    (mode: 'move' | { hx: number; hy: number }) => (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const sx = e.clientX
      const sy = e.clientY
      const s0 = { ...sel }
      const onMove = (ev: MouseEvent) => {
        // Screen delta -> scene delta (divide out zoom) -> the image's own
        // local axes (rotate back by its angle), so a drag still follows the
        // cursor along the image's own edges even when it's rotated on screen.
        const { x: dx, y: dy } = sceneDeltaToLocal(
          { x: (ev.clientX - sx) / zoom, y: (ev.clientY - sy) / zoom },
          cropAngle,
        )
        let next: CropBox
        if (mode === 'move') {
          next = { ...s0, left: s0.left + dx, top: s0.top + dy }
        } else if (aspect && mode.hx !== 0 && mode.hy !== 0) {
          // Corner drag with a locked ratio: anchor the opposite corner.
          const anchorX = mode.hx > 0 ? s0.left : s0.left + s0.width
          const anchorY = mode.hy > 0 ? s0.top : s0.top + s0.height
          const cornerX = (mode.hx > 0 ? s0.left + s0.width : s0.left) + dx
          const cornerY = (mode.hy > 0 ? s0.top + s0.height : s0.top) + dy
          let w = Math.abs(cornerX - anchorX)
          let h = Math.abs(cornerY - anchorY)
          if (w / h > aspect) w = h * aspect
          else h = w / aspect
          next = {
            left: mode.hx > 0 ? anchorX : anchorX - w,
            top: mode.hy > 0 ? anchorY : anchorY - h,
            width: w,
            height: h,
          }
        } else {
          // Free corner/edge: move only the grabbed edges.
          let left = s0.left
          let top = s0.top
          let width = s0.width
          let height = s0.height
          if (mode.hx > 0) width = s0.width + dx
          if (mode.hx < 0) {
            left = s0.left + dx
            width = s0.width - dx
          }
          if (mode.hy > 0) height = s0.height + dy
          if (mode.hy < 0) {
            top = s0.top + dy
            height = s0.height - dy
          }
          next = { left, top, width, height }
        }
        setSel(clamp(next))
      }
      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }

  // Selection rect on screen, laid out as if the image's angle were 0 — sel
  // is centre-relative, so cropCenter's own screen position is added back in
  // first. The wrapper below then rotates this whole group into its true,
  // on-screen position around that same centre.
  const centerScreen = { x: originX + cropCenter.x * zoom, y: originY + cropCenter.y * zoom }
  const S = {
    x: originX + (cropCenter.x + sel.left) * zoom,
    y: originY + (cropCenter.y + sel.top) * zoom,
    w: sel.width * zoom,
    h: sel.height * zoom,
  }

  const rotatedWrapperStyle = {
    transform: `rotate(${cropAngle}deg)`,
    transformOrigin: `${centerScreen.x}px ${centerScreen.y}px`,
  }

  return (
    <div ref={rootRef} className="absolute inset-0 z-30">
      {/* Dark scrim over the uncropped region: a "hole" cut via an oversized
          box-shadow, rotated as a rigid piece with the frame/handles below
          instead of needing its own corner geometry. Clipped to the viewport
          in its own layer — unlike the frame/handles below, this one should
          never bleed past the visible canvas area. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0" style={rotatedWrapperStyle}>
          <div
            className="absolute"
            style={{ left: S.x, top: S.y, width: S.w, height: S.h, boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }}
          />
        </div>
      </div>

      {/* Frame + handles — deliberately not clipped to the viewport (matches
          pre-UX-021 behaviour): interactive elements should stay reachable
          even if the full image's bounds extend past what's currently visible. */}
      <div className="absolute inset-0" style={rotatedWrapperStyle}>
        {/* Selection frame — drag the interior to pan the crop over the image. */}
        <div
          onMouseDown={startDrag('move')}
          className="absolute cursor-move border border-white/90"
          style={{ left: S.x, top: S.y, width: S.w, height: S.h }}
        >
          {/* rule-of-thirds guides */}
          <div className="pointer-events-none absolute inset-0 opacity-40">
            <div className="absolute inset-y-0 left-1/3 w-px bg-white" />
            <div className="absolute inset-y-0 left-2/3 w-px bg-white" />
            <div className="absolute inset-x-0 top-1/3 h-px bg-white" />
            <div className="absolute inset-x-0 top-2/3 h-px bg-white" />
          </div>
        </div>

        {/* Handles. In aspect-lock mode only the corners are draggable. */}
        {HANDLES.filter(([, hx, hy]) => !aspect || (hx !== 0 && hy !== 0)).map(([id, hx, hy, cur]) => (
          <div
            key={id}
            onMouseDown={startDrag({ hx, hy })}
            className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-editor-input bg-white"
            style={{
              left: S.x + (hx < 0 ? 0 : hx > 0 ? S.w : S.w / 2),
              top: S.y + (hy < 0 ? 0 : hy > 0 ? S.h : S.h / 2),
              cursor: `${cur}-resize`,
            }}
          />
        ))}
      </div>

      {/* Toolbar — stays screen-aligned regardless of the image's rotation. */}
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-editor-strong bg-editor-bg px-2 py-1.5 shadow-xl">
        {ASPECTS.map((a) => (
          <button
            key={a.label}
            onClick={() => pickAspect(a.value)}
            className={`rounded px-2 py-1 text-xs ${
              aspect === a.value ? 'bg-editor-surface-2 text-editor-text-strong' : 'text-editor-text-secondary hover:bg-editor-surface'
            }`}
          >
            {a.label}
          </button>
        ))}
        <div className="mx-1 h-5 w-px bg-editor-surface-2" />
        <button
          onClick={() => cancelCrop()}
          title="Cancel (Esc)"
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-editor-text-secondary hover:bg-editor-surface"
        >
          <X size={14} />
          Cancel
        </button>
        <button
          onClick={() => applyCrop(sel)}
          title="Apply (Enter)"
          className="flex items-center gap-1 rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-500"
        >
          <Check size={14} />
          Apply
        </button>
      </div>
    </div>
  )
}
