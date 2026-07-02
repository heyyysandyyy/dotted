import { useEffect, useRef, useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { useCanvasStore } from '../store/useCanvasStore'
import { TEMPLATES, renderTemplatePreview, type StarterTemplate } from '../templates'
import { renderPreview } from '../preview'
import { listTemplates, deleteTemplate, loadTemplate, type TemplateMeta } from '../storage'
import { Modal } from './Modal'

interface Props {
  open: boolean
  onClose: () => void
}

const CARD_W = 150

function PreviewBox({
  width,
  height,
  draw,
}: {
  width: number
  height: number
  draw: (el: HTMLCanvasElement) => () => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!ref.current) return
    return draw(ref.current)
    // draw closes over the page/template; callers pass a stable identity via key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height])
  const scale = CARD_W / width
  return (
    <div
      className="overflow-hidden rounded border border-neutral-700 bg-white"
      style={{ width: CARD_W, height: Math.round(height * scale) }}
    >
      <canvas ref={ref} style={{ transformOrigin: 'top left', transform: `scale(${scale})` }} />
    </div>
  )
}

function StarterCard({ tpl, onPick }: { tpl: StarterTemplate; onPick: () => void }) {
  return (
    <button
      onClick={onPick}
      className="flex flex-col items-center gap-2 rounded-lg border border-neutral-700 p-3 text-center transition hover:border-neutral-500 hover:bg-neutral-800"
    >
      <PreviewBox width={tpl.width} height={tpl.height} draw={(el) => renderTemplatePreview(el, tpl)} />
      <div className="text-sm font-medium text-neutral-200">{tpl.name}</div>
      <div className="text-xs text-neutral-500">
        {tpl.width} × {tpl.height}
      </div>
    </button>
  )
}

function SavedCard({
  meta,
  onPick,
  onDelete,
}: {
  meta: TemplateMeta
  onPick: () => void
  onDelete: () => void
}) {
  return (
    <div className="group relative flex flex-col items-center gap-2 rounded-lg border border-neutral-700 p-3 text-center transition hover:border-neutral-500 hover:bg-neutral-800">
      <button onClick={onPick} className="flex flex-col items-center gap-2">
        <PreviewBox
          width={meta.width}
          height={meta.height}
          draw={(el) => {
            // Load the template's first page for the thumbnail.
            const tpl = loadTemplate(meta.id)
            return tpl ? renderPreview(el, tpl.pages[0].canvas, meta.width, meta.height) : () => {}
          }}
        />
        <div className="text-sm font-medium text-neutral-200">{meta.name}</div>
        <div className="text-xs text-neutral-500">
          {meta.width} × {meta.height}
          {meta.pageCount > 1 ? ` · ${meta.pageCount} pages` : ''}
        </div>
      </button>
      <button
        onClick={onDelete}
        title="Delete template"
        className="absolute right-2 top-2 rounded p-1 text-neutral-400 opacity-0 transition hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

/** Template gallery — start from a starter or saved template, or save the
 *  current design as a template (TPL-003 / TPL-004). */
export function TemplatesModal({ open, onClose }: Props) {
  const newProjectFromTemplate = useCanvasStore((s) => s.newProjectFromTemplate)
  const newProjectFromSavedTemplate = useCanvasStore((s) => s.newProjectFromSavedTemplate)
  const saveAsTemplate = useCanvasStore((s) => s.saveAsTemplate)
  const designName = useCanvasStore((s) => s.designName)
  const [, refresh] = useState(0)

  if (!open) return null

  const saved = listTemplates()

  const pickStarter = (tpl: StarterTemplate) => {
    newProjectFromTemplate(tpl)
    onClose()
  }

  const pickSaved = (id: string) => {
    newProjectFromSavedTemplate(id)
    onClose()
  }

  const saveCurrent = () => {
    const name = window.prompt('Template name', designName)
    if (name === null) return
    saveAsTemplate(name)
    refresh((n) => n + 1)
  }

  return (
    <Modal title="Templates" widthClass="w-[560px]" onClose={onClose}>
      <div className="mb-4 flex justify-end">
        <button
          onClick={saveCurrent}
          className="flex items-center gap-1.5 rounded-md border border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-300 hover:border-neutral-500"
        >
          <Plus size={15} />
          Save current as template
        </button>
      </div>

      {saved.length > 0 && (
        <>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Your templates
          </div>
          <div className="mb-6 grid grid-cols-3 gap-4">
            {saved.map((m) => (
              <SavedCard
                key={m.id}
                meta={m}
                onPick={() => pickSaved(m.id)}
                onDelete={() => {
                  deleteTemplate(m.id)
                  refresh((n) => n + 1)
                }}
              />
            ))}
          </div>
        </>
      )}

      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Starter templates
      </div>
      <div className="grid grid-cols-3 gap-4">
        {TEMPLATES.map((t) => (
          <StarterCard key={t.id} tpl={t} onPick={() => pickStarter(t)} />
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200">
          Cancel
        </button>
      </div>
    </Modal>
  )
}
