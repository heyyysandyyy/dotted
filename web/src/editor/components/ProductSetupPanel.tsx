import { useEffect, useRef, useState } from 'react'
import { Circle } from 'lucide-react'
import {
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_LABELS,
  findProductTemplate,
  productCanvasSize,
  productGuideSpec,
  productsInCategory,
  pxToInches,
  PRODUCT_TEMPLATES,
  type PresetTemplate,
  type ProductCategory,
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

  const sizes = productsInCategory(category)
  const template = sizes.find((t) => t.id === templateId) ?? sizes[0]
  const size = productCanvasSize(template)
  const spec = productGuideSpec(template)

  const pickCategory = (next: ProductCategory) => {
    setCategory(next)
    // The size picker below is per-category, so land on that category's first
    // size rather than keeping an id that isn't in the list any more.
    setTemplateId(productsInCategory(next)[0].id)
  }

  const create = () => {
    newProductProject(template)
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
          Create {template.label}
        </button>
      </div>

      <div className="mb-4 flex items-center gap-6">
        <ProductThumb template={template} />
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

      <div className="grid grid-cols-4 gap-3 rounded-md bg-editor-surface/60 p-3 text-xs">
        <Stat label="Canvas" value={`${size.width} × ${size.height} px`} />
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

/** Preview box size (px). The artboard is square for every circular product,
 *  so one number covers both axes. */
const THUMB_SIZE = 132

/** A to-scale preview of the artboard and its guides, drawn with the same
 *  drawProductGuides the canvas overlay uses — so what's promised here is
 *  literally what appears on the canvas, not a hand-drawn approximation
 *  (which is exactly how BookSetupPanel's preview drifted into its own copy
 *  of the book guide maths). */
function ProductThumb({ template }: { template: PresetTemplate }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const size = productCanvasSize(template)

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const dpr = window.devicePixelRatio || 1
    el.width = THUMB_SIZE * dpr
    el.height = THUMB_SIZE * dpr
    el.style.width = `${THUMB_SIZE}px`
    el.style.height = `${THUMB_SIZE}px`
    const ctx = el.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, THUMB_SIZE, THUMB_SIZE)
    // The artboard itself: a white square, same as a new product project's
    // canvas background.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, THUMB_SIZE, THUMB_SIZE)
    drawProductGuides(
      ctx,
      { x: 0, y: 0, width: THUMB_SIZE, height: THUMB_SIZE },
      productGuideSpec(template),
      THUMB_SIZE / size.width,
    )
  }, [template, size.width])

  return <canvas ref={canvasRef} className="shrink-0 rounded-sm shadow" />
}
