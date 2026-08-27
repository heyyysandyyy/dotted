import { useEffect, useRef, useState } from 'react'
import { Circle } from 'lucide-react'
import {
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_LABELS,
  SHEET_SIZES,
  buildSheetLayout,
  findProductTemplate,
  productArtboardSize,
  productGuideSpec,
  productsInCategory,
  pxToInches,
  sheetCapacity,
  PRODUCT_TEMPLATES,
  type PresetTemplate,
  type ProductCategory,
  type ProductSheetLayout,
  type SheetId,
} from '../products'
import { drawProductGuides } from '../productGuides'
import { useCanvasStore } from '../store/useCanvasStore'

interface Props {
  /** The product card clicked in the preset grid; changeable here. */
  initialTemplateId: string
  onCreated: () => void
}

/**
 * Product setup flow shown in the new-design modal once a print product is
 * picked (PROD-001) — the same shape as BookSetupPanel: choose the category,
 * then the size, see exactly what will be printed and what gets lost around
 * the edge, then create.
 */
export function ProductSetupPanel({ initialTemplateId, onCreated }: Props) {
  const newProductProject = useCanvasStore((s) => s.newProductProject)
  const initial = findProductTemplate(initialTemplateId) ?? PRODUCT_TEMPLATES[0]
  const [category, setCategory] = useState<ProductCategory>(initial.category)
  const [templateId, setTemplateId] = useState(initial.id)
  const [sheetMode, setSheetMode] = useState(false)
  const [sheetId, setSheetId] = useState<SheetId>('letter')
  // null means "as many as fit" — so switching product or paper keeps filling
  // the sheet instead of holding onto a number that no longer makes sense.
  const [wantedCount, setWantedCount] = useState<number | null>(null)

  const sizes = productsInCategory(category)
  const template = sizes.find((t) => t.id === templateId) ?? sizes[0]
  const capacity = sheetCapacity(template, sheetId)
  const count = Math.max(1, Math.min(wantedCount ?? capacity.max, capacity.max))
  const layout: ProductSheetLayout | null =
    sheetMode && capacity.max > 0 ? buildSheetLayout(template, { sheetId, count }) : null
  const size = productArtboardSize(template, layout)
  const spec = productGuideSpec(template, layout)

  const pickCategory = (next: ProductCategory) => {
    setCategory(next)
    // The size picker below is per-category, so land on that category's first
    // size rather than keeping an id that isn't in the list any more.
    setTemplateId(productsInCategory(next)[0].id)
  }

  const create = () => {
    newProductProject(template, layout ? { sheetId, count } : undefined)
    onCreated()
  }

  return (
    <div className="rounded-lg border border-editor-strong p-4">
      <div className="mb-2 text-sm font-medium text-editor-text">Product setup</div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        {PRODUCT_CATEGORIES.map((option) => {
          const selected = category === option
          return (
            <button
              key={option}
              onClick={() => pickCategory(option)}
              aria-pressed={selected}
              className={`flex items-center gap-3 rounded-lg border p-3 text-left transition ${
                selected
                  ? 'border-indigo-500 bg-editor-surface'
                  : 'border-editor-strong hover:border-editor-input hover:bg-editor-surface'
              }`}
            >
              <Circle size={22} className={selected ? 'text-indigo-400' : 'text-editor-text-subtle'} />
              <span>
                <span className="block text-sm font-medium text-editor-text">
                  {PRODUCT_CATEGORY_LABELS[option]}
                </span>
                <span className="block text-[11px] text-editor-text-subtle">
                  {productsInCategory(option).length} sizes
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="mb-4 flex items-end gap-3">
        <div className="flex flex-col text-xs text-editor-text-muted">
          Size
          <div className="mt-1 flex flex-wrap gap-1.5">
            {sizes.map((option) => {
              const selected = option.id === template.id
              return (
                <button
                  key={option.id}
                  onClick={() => setTemplateId(option.id)}
                  aria-pressed={selected}
                  className={`rounded-md border px-2.5 py-1 text-sm transition ${
                    selected
                      ? 'border-indigo-500 bg-indigo-600 text-white'
                      : 'border-editor-strong text-editor-text-secondary hover:border-editor-input'
                  }`}
                >
                  {option.diameterIn}″
                </button>
              )
            })}
          </div>
        </div>
        <button
          onClick={create}
          className="ml-auto rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          {layout ? `Create sheet of ${count}` : `Create ${template.label}`}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-4 rounded-md border border-editor-strong p-3">
        <div className="flex flex-col text-xs text-editor-text-muted">
          Layout
          <div className="mt-1 flex items-center rounded-md bg-editor-surface p-0.5 text-xs">
            <button
              onClick={() => setSheetMode(false)}
              aria-pressed={!sheetMode}
              className={`rounded px-2 py-1 font-medium ${
                sheetMode ? 'text-editor-text-muted' : 'bg-editor-surface-2 text-editor-text-strong'
              }`}
            >
              One per artboard
            </button>
            <button
              onClick={() => setSheetMode(true)}
              aria-pressed={sheetMode}
              disabled={capacity.max === 0}
              className={`rounded px-2 py-1 font-medium disabled:opacity-40 ${
                sheetMode ? 'bg-editor-surface-2 text-editor-text-strong' : 'text-editor-text-muted'
              }`}
            >
              Several per page
            </button>
          </div>
        </div>

        {sheetMode && (
          <>
            <label className="flex flex-col text-xs text-editor-text-muted">
              Paper
              <select
                value={sheetId}
                onChange={(e) => setSheetId(e.target.value as SheetId)}
                className="mt-1 rounded border border-editor-strong bg-editor-surface px-2 py-1 text-sm text-editor-text-strong outline-none focus:border-editor-input"
              >
                {SHEET_SIZES.map((sheet) => (
                  <option key={sheet.id} value={sheet.id}>
                    {sheet.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-xs text-editor-text-muted">
              Per page
              <input
                type="number"
                min={1}
                max={capacity.max}
                value={count}
                onChange={(e) => setWantedCount(Number(e.target.value) || 1)}
                className="mt-1 w-20 rounded border border-editor-strong bg-editor-surface px-2 py-1 text-sm text-editor-text-strong outline-none focus:border-editor-input"
              />
            </label>
            <p className="pb-1 text-[11px] text-editor-text-subtle">
              Up to {capacity.max} fit on {SHEET_SIZES.find((s) => s.id === sheetId)?.label} —{' '}
              {capacity.columns} across × {capacity.rows} down.
            </p>
          </>
        )}
        {capacity.max === 0 && (
          <p className="pb-1 text-[11px] text-editor-text-subtle">
            A {template.label} is too big to gang up on either paper size.
          </p>
        )}
      </div>

      <div className="mb-4 flex items-center gap-6">
        <ProductThumb template={template} layout={layout} />
        <ul className="space-y-1 text-xs text-editor-text-muted">
          <li>
            <span className="text-editor-text">Pink</span> — wrap and bleed, trimmed away or folded
            around the edge.
          </li>
          <li>
            <span className="text-editor-text">Dashed black</span> — the finished{' '}
            {`${template.diameterIn}″`} face.
          </li>
          <li>
            <span className="text-editor-text">Dashed blue</span> — safe zone; keep text and logos
            inside it.
          </li>
        </ul>
      </div>

      <div className="grid grid-cols-5 gap-3 rounded-md bg-editor-surface/60 p-3 text-xs">
        <Stat label="Canvas" value={`${size.width} × ${size.height} px`} />
        <Stat label="Products" value={String(layout?.count ?? 1)} />
        <Stat label="Bleed" value={pxToInches(spec.bleedPx, spec.dpi)} />
        <Stat label="Safe zone" value={pxToInches(spec.safeZonePx, spec.dpi)} />
        <Stat label="Resolution" value={`${template.dpi} dpi`} />
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

/** Longest edge of the preview box (px) — the artboard is square for a single
 *  product but portrait for a sheet, so the short side follows from the
 *  artboard's own aspect ratio. */
const THUMB_SIZE = 132

/** A to-scale preview of the artboard and its guides, drawn with the same
 *  drawProductGuides the canvas overlay uses — so what's promised here is
 *  literally what appears on the canvas, not a hand-drawn approximation
 *  (which is exactly how BookSetupPanel's preview drifted into its own copy
 *  of the book guide maths). */
function ProductThumb({
  template,
  layout,
}: {
  template: PresetTemplate
  layout: ProductSheetLayout | null
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const size = productArtboardSize(template, layout)
  const scale = THUMB_SIZE / Math.max(size.width, size.height)
  const boxW = size.width * scale
  const boxH = size.height * scale

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
    // The artboard itself: white, same as a new product project's canvas
    // background.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, boxW, boxH)
    drawProductGuides(
      ctx,
      { x: 0, y: 0, width: boxW, height: boxH },
      productGuideSpec(template, layout),
      scale,
    )
  }, [template, layout, boxW, boxH, scale])

  return <canvas ref={canvasRef} className="shrink-0 rounded-sm shadow" />
}
