import { useEffect, useRef } from 'react'
import { useCanvasStore } from '../store/useCanvasStore'
import { TEMPLATES, renderTemplatePreview, type StarterTemplate } from '../templates'

interface Props {
  open: boolean
  onClose: () => void
}

const CARD_W = 150

function TemplateCard({ tpl, onPick }: { tpl: StarterTemplate; onPick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!ref.current) return
    return renderTemplatePreview(ref.current, tpl)
  }, [tpl])

  const scale = CARD_W / tpl.width

  return (
    <button
      onClick={onPick}
      className="flex flex-col items-center gap-2 rounded-lg border border-neutral-200 p-3 text-center transition hover:border-neutral-900 hover:bg-neutral-50"
    >
      <div
        className="overflow-hidden rounded border border-neutral-200 bg-white"
        style={{ width: CARD_W, height: Math.round(tpl.height * scale) }}
      >
        <canvas ref={ref} style={{ transformOrigin: 'top left', transform: `scale(${scale})` }} />
      </div>
      <div className="text-sm font-medium text-neutral-800">{tpl.name}</div>
      <div className="text-xs text-neutral-500">
        {tpl.width} × {tpl.height}
      </div>
    </button>
  )
}

/** Starter template gallery — pick one to begin a new design (TPL-003). */
export function TemplatesModal({ open, onClose }: Props) {
  const newProjectFromTemplate = useCanvasStore((s) => s.newProjectFromTemplate)

  if (!open) return null

  const pick = (tpl: StarterTemplate) => {
    newProjectFromTemplate(tpl)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-[560px] overflow-y-auto rounded-xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-neutral-900">Start from a template</h2>
        <div className="grid grid-cols-3 gap-4">
          {TEMPLATES.map((t) => (
            <TemplateCard key={t.id} tpl={t} onPick={() => pick(t)} />
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:text-neutral-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
