import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as fabric from 'fabric'
import type { TPointerEventInfo, BasicTransformEvent } from 'fabric'
import { AligningGuidelines } from 'fabric/extensions'
import { useCanvasStore } from '../store/useCanvasStore'
import { useHistoryStore } from '../store/useHistoryStore'
import {
  getCurrentProjectId,
  loadProject,
  listProjects,
  migrateLegacyDesign,
} from '../storage'
import { SNAP_MARGIN, MIN_ZOOM, MAX_ZOOM } from '../constants'
import { kindName, isText, readShadowEffects } from '../utils'
import {
  isEffectClone,
  removeAllEffectVisuals,
  repositionEffectClones,
  syncEffectClones,
  syncInnerShadow,
} from '../effectsEngine'
import { CanvasRulers } from './CanvasRulers'
import { CanvasGuides } from './CanvasGuides'
import { GridOverlay } from './GridOverlay'
import { EyedropperOverlay } from './EyedropperOverlay'
import { CropOverlay } from './CropOverlay'

const PADDING = 56

/**
 * History label for an `object:modified` event: a label set by the firing store
 * action (`historyLabel`) wins; otherwise it's inferred from the drag/scale/
 * rotate transform that produced it.
 */
function modifiedLabel(e: {
  target?: fabric.FabricObject
  transform?: { action?: string }
  historyLabel?: string
}): string {
  if (e.historyLabel) return e.historyLabel
  const k = kindName(e.target)
  const action = e.transform?.action ?? ''
  if (action === 'drag') return `Moved ${k}`
  if (action.startsWith('scale') || action === 'resizing') return `Resized ${k}`
  if (action === 'rotate') return `Rotated ${k}`
  return `Edited ${k}`
}

/** Checkerboard shown behind a transparent artboard, like most design tools. */
const CHECKERBOARD: React.CSSProperties = {
  backgroundColor: '#ffffff',
  backgroundImage:
    'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
  backgroundSize: '20px 20px',
  backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0',
}

/**
 * Owns the Fabric.js canvas instance and keeps the artboard fitted to the
 * viewport. The fabric canvas always stays at native pixel dimensions; the
 * surrounding wrapper is CSS-scaled so the artboard preserves aspect ratio.
 */
export function CanvasStage() {
  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)

  const setCanvas = useCanvasStore((s) => s.setCanvas)
  const setZoomRaw = useCanvasStore((s) => s.setZoomRaw)
  const fitMode = useCanvasStore((s) => s.fitMode)
  const setSelection = useCanvasStore((s) => s.setSelection)
  const bump = useCanvasStore((s) => s.bump)
  const width = useCanvasStore((s) => s.width)
  const height = useCanvasStore((s) => s.height)
  const zoom = useCanvasStore((s) => s.zoom)
  const pan = useCanvasStore((s) => s.pan)
  const setPan = useCanvasStore((s) => s.setPan)
  const backgroundColor = useCanvasStore((s) => s.backgroundColor)
  const canvas = useCanvasStore((s) => s.canvas)
  const snapMode = useCanvasStore((s) => s.snapMode)
  const cropImage = useCanvasStore((s) => s.cropImage)
  const spreadView = useCanvasStore((s) => s.spreadView)
  const activePageType = useCanvasStore((s) => s.pages.find((p) => p.id === s.activePageId)?.type)
  // Single-page framing only applies to a spread (UX-015) — a cover/plain page
  // always shows at full width.
  const singleSpreadView = spreadView === 'single' && activePageType === 'spread'
  // Re-render during transforms so the in-place group outline tracks live (UX-016).
  useCanvasStore((s) => s.tick)

  // Create the fabric canvas once.
  useEffect(() => {
    if (!canvasElRef.current) return
    const canvas = new fabric.Canvas(canvasElRef.current, {
      width,
      height,
      backgroundColor: '#ffffff',
      preserveObjectStacking: true,
    })

    const syncSelection = () => setSelection(canvas.getActiveObjects())
    canvas.on('selection:created', syncSelection)
    canvas.on('selection:updated', syncSelection)
    canvas.on('selection:cleared', () => setSelection([]))
    // Keep property read-outs live during direct-manipulation.
    canvas.on('object:moving', bump)
    canvas.on('object:scaling', bump)
    canvas.on('object:rotating', bump)
    canvas.on('object:modified', bump)
    // Keep every effect clone locked to its host during a live drag/rotate
    // (UX-020) — cheap position-only sync, no rebuild; scale changes and any
    // other transform not covered by these two events (Properties Panel
    // fields, alignment tools, undo/redo — anything that doesn't go through
    // a live canvas drag) are corrected below on object:modified instead.
    const syncEffectPositions = (e: BasicTransformEvent & { target: fabric.FabricObject }) => {
      if (!isEffectClone(e.target)) repositionEffectClones(canvas, e.target)
    }
    canvas.on('object:moving', syncEffectPositions)
    canvas.on('object:rotating', syncEffectPositions)
    // Full rebuild on any completed change to a host with active effects —
    // this is the one path that covers every way a host's transform can
    // change, not just a live canvas drag: Properties Panel fields (e.g.
    // rotating via the Rot input, which never fires object:rotating at all),
    // alignment tools, undo/redo. Without this, a clone-backed second effect
    // (UX-020 phase 2) goes stale and visibly detaches from its host the
    // moment it's transformed any other way (reported bug: outer glow left
    // behind, unrotated, when an object with both drop shadow and glow was
    // rotated via the panel instead of the on-canvas handle).
    canvas.on('object:modified', (e) => {
      const o = e.target as (fabric.FabricObject & { id?: string }) | undefined
      if (!o || isEffectClone(o)) return
      const effects = readShadowEffects(o)
      syncEffectClones(canvas, o, effects.filter((eff) => eff.kind !== 'inner'))
      syncInnerShadow(canvas, o, effects.find((eff) => eff.kind === 'inner') ?? null)
    })
    // A removed host's effect visual(s) would otherwise be orphaned (delete,
    // group, and ungroup all remove the object from the canvas first).
    canvas.on('object:removed', (e) => {
      const o = e.target as (fabric.FabricObject & { id?: string }) | undefined
      if (o?.id && !isEffectClone(o)) removeAllEffectVisuals(canvas, o.id)
    })

    // Push a debounced history snapshot on any structural/transform change,
    // tagged with a human-readable label for the history panel (UX-003).
    // Effect clones (UX-020) are excluded — syncEffectClones removes/recreates
    // them on every effect tweak, which isn't a structural change worth its
    // own undo step (setShadowEffect already records one "Changed effects"
    // step for the whole operation).
    const rec = (label: string) => useHistoryStore.getState().scheduleRecord(label)
    canvas.on('object:added', (e) => {
      if (e.target && !isEffectClone(e.target)) rec(`Added ${kindName(e.target)}`)
    })
    canvas.on('object:removed', (e) => {
      if (e.target && !isEffectClone(e.target)) rec(`Deleted ${kindName(e.target)}`)
    })
    canvas.on('object:modified', (e) => rec(modifiedLabel(e)))
    // Editing text fires text:changed (per keystroke), not a reliable
    // object:modified — record it so text content edits autosave (debounced).
    canvas.on('text:changed', (e) => rec(`Edited ${kindName(e.target)}`))
    // Keep the layers panel in sync when objects are added/removed.
    canvas.on('object:added', (e) => {
      if (e.target && !isEffectClone(e.target)) bump()
    })
    canvas.on('object:removed', (e) => {
      if (e.target && !isEffectClone(e.target)) bump()
    })
    // Guarantee every object (incl. those restored from history) has an id, and
    // keep IText's editing textarea inside the (overflow-hidden) canvas wrapper
    // instead of document.body — fabric appends it at absolute page coordinates
    // with padding-top: fontSize, which otherwise extends the page (BUG-002).
    canvas.on('object:added', (e) => {
      const o = e.target as (fabric.FabricObject & { id?: string }) | undefined
      if (!o) return
      if (!o.id) o.id = crypto.randomUUID()
      if (isEffectClone(o)) return
      // Self-heal stale data: selectable/evented are only ever turned off by the
      // lock toggle (which also sets locked). An un-locked object that loaded as
      // non-selectable is corrupt state — force it interactive again.
      const locked = (o as unknown as { locked?: boolean }).locked === true
      if (!locked && (o.selectable === false || o.evented === false)) {
        o.selectable = true
        o.evented = true
      }
      if (isText(o)) {
        ;(o as unknown as { hiddenTextareaContainer: HTMLElement | null }).hiddenTextareaContainer =
          canvas.wrapperEl
      }
      // Groups (incl. loaded ones): allow entering to edit a child (UX-016), and
      // render children directly so their shadows aren't clipped (UX-011). Reset
      // `interactive` (fabric serializes it) so a fresh single-click hits the
      // whole group, not a child — in-place editing turns it on per double-click.
      if (o.type === 'group') {
        const g = o as fabric.Group
        g.subTargetCheck = true
        g.objectCaching = false
        g.interactive = false
      }
    })

    setCanvas(canvas)

    // SAV-002: open the current project (migrating any SAV-001 single design
    // first), fall back to the most recent project, else start a fresh one.
    // openProject / newProject handle loadFromJSON and the history baseline.
    const store = useCanvasStore.getState()
    let id = getCurrentProjectId() ?? migrateLegacyDesign(() => crypto.randomUUID())
    if (!id || !loadProject(id)) id = listProjects()[0]?.id ?? null
    if (id) store.openProject(id)
    else store.newProject(width, height)
    return () => {
      setCanvas(null)
      canvas.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Live viewport (measureRef) size — drives the fabric canvas dimensions and
  // the artboard centring (UX-013).
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  // Pan-mode cursor: hand while space is held, closed hand while dragging (UX-013).
  const [panCursor, setPanCursor] = useState<'grab' | 'grabbing' | null>(null)
  // The group currently being edited in-place (UX-016), for the muted outline.
  const [isoGroup, setIsoGroup] = useState<fabric.FabricObject | null>(null)
  useLayoutEffect(() => {
    const el = measureRef.current
    if (!el) return
    const measure = () => setViewport({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // On-screen position of artboard (0,0): centred in the viewport, then panned.
  const originX = (viewport.w - width * zoom) / 2 + pan.x
  const originY = (viewport.h - height * zoom) / 2 + pan.y

  // Drive fabric's cursor for pan mode so the hand shows over the canvas too —
  // fabric owns the upper-canvas cursor and resets it on mouse move, so setting
  // its cursor props (and the element directly) is more reliable than CSS (UX-013).
  useEffect(() => {
    const c = useCanvasStore.getState().canvas as
      | (fabric.Canvas & { upperCanvasEl?: HTMLElement })
      | null
    if (!c) return
    const cur = panCursor === 'grabbing' ? 'grabbing' : panCursor === 'grab' ? 'grab' : ''
    c.defaultCursor = cur || 'default'
    c.hoverCursor = cur || 'move'
    c.moveCursor = cur || 'move'
    if (c.upperCanvasEl) c.upperCanvasEl.style.cursor = cur
  }, [panCursor, canvas])

  // Auto-fit the artboard to the viewport on load and on resize — but only while
  // in fit-mode (UX-013); once the user zooms manually we leave their zoom alone.
  useLayoutEffect(() => {
    if (!useCanvasStore.getState().fitMode || viewport.w === 0 || viewport.h === 0) return
    const availW = viewport.w - PADDING * 2
    const availH = viewport.h - PADDING * 2
    if (availW <= 0 || availH <= 0) return
    // "Single page" view (UX-015) fits to one half of a spread, then pans so
    // that half (the left page) is centred instead of the whole spread.
    const fitWidth = singleSpreadView ? width / 2 : width
    const nextZoom = Math.max(Math.min(availW / fitWidth, availH / height, 1), 0.05)
    setZoomRaw(nextZoom)
    setPan(singleSpreadView ? (width * nextZoom) / 4 : 0, 0)
  }, [width, height, fitMode, viewport, setZoomRaw, setPan, singleSpreadView])

  // Stash the artboard size on the canvas so the exporters (which now get a
  // viewport-sized canvas) can crop to the page (UX-013). Cropping the *display*
  // to the page is done with a CSS clip below — deterministic and unaffected by
  // fabric's load/serialize cycle (a fabric clipPath gets cleared by loadFromJSON).
  useEffect(() => {
    const c = useCanvasStore.getState().canvas
    if (!c) return
    ;(c as unknown as { __artboardSize?: { width: number; height: number } }).__artboardSize = {
      width,
      height,
    }
  }, [canvas, width, height])

  // Keep the fabric canvas viewport-sized and its transform in sync with zoom/pan.
  useEffect(() => {
    if (!canvas || viewport.w === 0 || viewport.h === 0) return
    if (canvas.getWidth() !== viewport.w || canvas.getHeight() !== viewport.h) {
      canvas.setDimensions({ width: viewport.w, height: viewport.h })
    }
    canvas.setViewportTransform([zoom, 0, 0, zoom, originX, originY])
  }, [canvas, viewport, zoom, originX, originY])

  // Scroll-wheel zoom, centred on the cursor (UX-013).
  useEffect(() => {
    const el = measureRef.current
    if (!el || !canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const s = useCanvasStore.getState()
      const z = s.zoom
      const ox = (rect.width - s.width * z) / 2 + s.pan.x
      const oy = (rect.height - s.height * z) / 2 + s.pan.y
      // Artboard coord under the cursor — keep it fixed while zooming.
      const coordX = (cx - ox) / z
      const coordY = (cy - oy) / z
      const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * Math.exp(-e.deltaY * 0.0015)))
      const nox = cx - coordX * nz
      const noy = cy - coordY * nz
      s.setZoom(nz)
      s.setPan(nox - (rect.width - s.width * nz) / 2, noy - (rect.height - s.height * nz) / 2)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [canvas])

  // Pan with spacebar-drag or middle-mouse-drag (UX-013). Intercepted as a mouse
  // event in the capture phase (fabric listens on 'mousedown' at the upper canvas,
  // so capturing here + stopPropagation beats it) — a pan gesture never starts an
  // object drag/selection. Space held shows the hand cursor.
  useEffect(() => {
    const el = measureRef.current
    if (!el) return
    let spaceDown = false
    let panning = false
    let lastX = 0
    let lastY = 0
    // Only genuine text entry should block space-pan. A focused range slider
    // (the zoom control), checkbox, or button shouldn't — otherwise using the
    // zoom slider leaves it focused and space stops panning (UX-013).
    const isTyping = () => {
      const a = document.activeElement as HTMLElement | null
      if (!a) return false
      if (a.isContentEditable || a.tagName === 'TEXTAREA') return true
      if (a.tagName === 'INPUT') {
        const type = (a as HTMLInputElement).type
        return !['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file'].includes(type)
      }
      return false
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !spaceDown && !isTyping()) {
        e.preventDefault()
        spaceDown = true
        if (!panning) setPanCursor('grab')
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDown = false
        if (!panning) setPanCursor(null)
      }
    }
    const onMouseDown = (e: MouseEvent) => {
      if ((spaceDown && e.button === 0) || e.button === 1) {
        panning = true
        lastX = e.clientX
        lastY = e.clientY
        setPanCursor('grabbing')
        e.preventDefault()
        e.stopPropagation()
      }
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!panning) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      const p = useCanvasStore.getState().pan
      useCanvasStore.getState().setPan(p.x + dx, p.y + dy)
    }
    const onMouseUp = () => {
      if (!panning) return
      panning = false
      setPanCursor(spaceDown ? 'grab' : null)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    el.addEventListener('mousedown', onMouseDown, true)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      el.removeEventListener('mousedown', onMouseDown, true)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  // CLR-004: smart alignment guides while dragging (snap mode 'guides').
  // Mutually exclusive with grid snap (UX-005), enforced in the store.
  useEffect(() => {
    if (!canvas || snapMode !== 'guides') return
    const guidelines = new AligningGuidelines(canvas, { margin: SNAP_MARGIN, color: '#ec4899' })
    return () => guidelines.dispose()
  }, [canvas, snapMode])

  // Drag snapping in one handler with explicit precedence: grid snap (UX-005)
  // takes priority; otherwise manual ruler guides (UX-004). Alignment guides
  // (CLR-004) are a separate extension, mutually exclusive with grid via the store.
  useEffect(() => {
    if (!canvas) return
    const T = 5
    const clearActive = () =>
      useCanvasStore.getState().setActiveGuides({ horizontal: [], vertical: [] })
    const onMoving = (e: { target?: fabric.FabricObject }) => {
      const { grid, guides, snapGuides, showGuides, setActiveGuides } = useCanvasStore.getState()
      const obj = e.target
      if (!obj) return

      // 1) Grid snap — snap the live top-left point to the nearest intersection
      //    (origin-agnostic, no cached-coord lag that would jitter the drag).
      if (grid.snap) {
        const tl = obj.getPointByOrigin('left', 'top')
        const x = Math.round(tl.x / grid.size) * grid.size
        const y = Math.round(tl.y / grid.size) * grid.size
        obj.setPositionByOrigin(new fabric.Point(x, y), 'left', 'top')
        return
      }

      // 2) Manual guides — snap edges/centre within T px and highlight the lines.
      if (!snapGuides || !showGuides) return
      const bb = obj.getBoundingRect()
      const nearest = (targets: number[], lines: number[]): { d: number; line: number } | null => {
        let best: { d: number; line: number } | null = null
        for (const line of lines) {
          for (const t of targets) {
            const d = line - t
            if (Math.abs(d) <= T && (best === null || Math.abs(d) < Math.abs(best.d))) best = { d, line }
          }
        }
        return best
      }
      const vx = nearest([bb.left, bb.left + bb.width / 2, bb.left + bb.width], guides.vertical)
      const hy = nearest([bb.top, bb.top + bb.height / 2, bb.top + bb.height], guides.horizontal)
      if (vx) obj.set('left', (obj.left ?? 0) + vx.d)
      if (hy) obj.set('top', (obj.top ?? 0) + hy.d)
      if (vx || hy) obj.setCoords()
      setActiveGuides({ horizontal: hy ? [hy.line] : [], vertical: vx ? [vx.line] : [] })
    }
    canvas.on('object:moving', onMoving)
    canvas.on('object:modified', clearActive)
    canvas.on('mouse:up', clearActive)
    return () => {
      canvas.off('object:moving', onMoving)
      canvas.off('object:modified', clearActive)
      canvas.off('mouse:up', clearActive)
    }
  }, [canvas])

  // UX-007: format-painter clicks paste the copied style onto the clicked
  // object; right-click selects the object under the cursor (for the menu).
  useEffect(() => {
    if (!canvas) return
    const onDown = (opt: TPointerEventInfo) => {
      const store = useCanvasStore.getState()
      // Right-click is mouse-only (fabric's event can also be Touch/Pointer);
      // .button doesn't exist on TouchEvent.
      const button = opt.e instanceof MouseEvent ? opt.e.button : undefined
      if (button === 2 && opt.target) {
        canvas.setActiveObject(opt.target)
        canvas.requestRenderAll()
      }
      if (store.painterMode !== 'off' && opt.target) {
        store.pasteStyleOnTarget(opt.target)
      }
    }
    canvas.on('mouse:down', onDown)
    return () => canvas.off('mouse:down', onDown)
  }, [canvas])

  // UX-016: single-click always selects the whole group; double-click a child
  // drills in to edit it (fabric's interactive group) and stays in until you
  // click away. A plain click on the group (no drag) pops back out to the group.
  useEffect(() => {
    const c = useCanvasStore.getState().canvas
    if (!c) return
    let isolated: fabric.Group | null = null
    let downX = 0
    let downY = 0
    let downInside = false
    const exit = () => {
      if (!isolated) return
      isolated.interactive = false
      isolated = null
      setIsoGroup(null)
      c.requestRenderAll()
    }
    // Safety net: outside in-place editing, selecting a group's child promotes to
    // the whole group, so a single-click anywhere on a group selects the group.
    const onSelected = () => {
      if (isolated) return
      const active = c.getActiveObject()
      const parent = active && (active.group as fabric.Group | undefined)
      if (parent && parent.type === 'group') {
        parent.interactive = false
        c.setActiveObject(parent)
        c.requestRenderAll()
      }
    }
    const onDblClick = (opt: TPointerEventInfo) => {
      const t = opt.target
      // Double-click an image → enter crop mode (UX-009).
      if (t && t.type === 'image') {
        useCanvasStore.getState().enterCrop()
        return
      }
      const sub = opt.subTargets?.[0]
      if (t && t.type === 'group' && sub) {
        const g = t as fabric.Group
        // Already inside this group and double-clicked an image child → crop it
        // (UX-009 inside a group). Otherwise drill in to edit the child (UX-016).
        if (g.interactive && sub.type === 'image') {
          exit()
          c.setActiveObject(sub)
          useCanvasStore.getState().enterCrop()
          return
        }
        g.subTargetCheck = true
        g.interactive = true
        isolated = g
        setIsoGroup(g)
        c.setActiveObject(sub)
        c.requestRenderAll()
      }
    }
    const onDown = (opt: TPointerEventInfo) => {
      // Drag-distance tracking is mouse-only (fabric's event can also be
      // Touch/Pointer); touch isn't supported elsewhere in this app either.
      if (!(opt.e instanceof MouseEvent)) return
      downX = opt.e.clientX
      downY = opt.e.clientY
      downInside = !!isolated && !!opt.target && (opt.target === isolated || opt.target.group === isolated)
    }
    const onUp = (opt: TPointerEventInfo) => {
      if (!isolated || !(opt.e instanceof MouseEvent)) return
      // A drag = editing a child → stay isolated. A click → pop back out; if it
      // landed on the group, reselect the whole group (else leave the selection).
      if (Math.hypot(opt.e.clientX - downX, opt.e.clientY - downY) > 4) return
      const g = isolated
      const reselectGroup = downInside
      exit()
      if (reselectGroup) {
        c.setActiveObject(g)
        c.requestRenderAll()
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exit()
    }
    c.on('selection:created', onSelected)
    c.on('selection:updated', onSelected)
    c.on('mouse:dblclick', onDblClick)
    c.on('mouse:down', onDown)
    c.on('mouse:up', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      c.off('selection:created', onSelected)
      c.off('selection:updated', onSelected)
      c.off('mouse:dblclick', onDblClick)
      c.off('mouse:down', onDown)
      c.off('mouse:up', onUp)
      window.removeEventListener('keydown', onKey)
      exit()
    }
  }, [canvas])

  return (
    <div
      ref={measureRef}
      className={`relative flex-1 overflow-hidden bg-editor-desk ${
        panCursor === 'grabbing' ? 'cursor-grabbing' : panCursor === 'grab' ? 'cursor-grab' : ''
      }`}
    >
      {/* Artboard backdrop behind the viewport-sized canvas: the page shadow, and
          a checkerboard when the artboard background is transparent. */}
      <div
        className="pointer-events-none absolute"
        style={{
          left: originX,
          top: originY,
          width: width * zoom,
          height: height * zoom,
          boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
          ...(backgroundColor === '' ? CHECKERBOARD : null),
        }}
      />
      <div className="absolute inset-0">
        <canvas ref={canvasElRef} />
      </div>
      {/* Pasteboard (UX-019): off-page content isn't clipped — it's dimmed by a
          scrim over the surround, so objects can be parked outside the page while
          the artboard stays clearly delineated. Click-through to the canvas. */}
      {(() => {
        const aR = originX + width * zoom
        const aB = originY + height * zoom
        const dim: React.CSSProperties = { position: 'absolute', background: 'rgba(0,0,0,0.55)', pointerEvents: 'none' }
        return (
          <>
            <div style={{ ...dim, left: 0, top: 0, width: viewport.w, height: Math.max(0, originY) }} />
            <div style={{ ...dim, left: 0, top: aB, width: viewport.w, height: Math.max(0, viewport.h - aB) }} />
            <div style={{ ...dim, left: 0, top: originY, width: Math.max(0, originX), height: Math.max(0, aB - originY) }} />
            <div style={{ ...dim, left: aR, top: originY, width: Math.max(0, viewport.w - aR), height: Math.max(0, aB - originY) }} />
          </>
        )
      })()}
      {/* Muted outline of the group being edited in place — from the live union
          of its children so it grows as a child is resized (UX-016). */}
      {isoGroup &&
        (() => {
          const objs = (isoGroup as fabric.Group).getObjects?.() ?? []
          if (objs.length === 0) return null
          let l = Infinity
          let t = Infinity
          let r = -Infinity
          let b = -Infinity
          for (const o of objs) {
            const bb = o.getBoundingRect()
            l = Math.min(l, bb.left)
            t = Math.min(t, bb.top)
            r = Math.max(r, bb.left + bb.width)
            b = Math.max(b, bb.top + bb.height)
          }
          return (
            <div
              className="pointer-events-none absolute rounded-sm border border-dashed border-indigo-400/50"
              style={{
                left: originX + l * zoom,
                top: originY + t * zoom,
                width: (r - l) * zoom,
                height: (b - t) * zoom,
              }}
            />
          )
        })()}
      <CanvasGuides />
      <GridOverlay />
      <CanvasRulers />
      <EyedropperOverlay />
      {cropImage && <CropOverlay />}
    </div>
  )
}
