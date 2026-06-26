import { Bold, Italic, Underline } from 'lucide-react'
import { useCanvasStore } from '../store/useCanvasStore'
import { isText } from '../utils'
import { FontPicker } from './FontPicker'

export function ContextToolbar() {
  useCanvasStore((s) => s.tick) // re-render on live changes
  const selection = useCanvasStore((s) => s.selection)
  const updateActive = useCanvasStore((s) => s.updateActive)

  const obj = selection.length === 1 ? selection[0] : null
  if (!isText(obj)) return null

  const fontSize = obj.fontSize ?? 48
  const isBold = obj.fontWeight === 'bold' || obj.fontWeight === 700
  const isItalic = obj.fontStyle === 'italic'
  const isUnderline = !!obj.underline
  const fill = typeof obj.fill === 'string' ? obj.fill : '#111111'
  const fontFamily = obj.fontFamily ?? 'Arial'

  const toggleBtn = (active: boolean) =>
    `rounded p-1.5 ${active ? 'bg-neutral-700 text-white' : 'text-neutral-300 hover:bg-neutral-800'}`

  return (
    <div className="flex h-11 items-center gap-2 border-b border-neutral-800 bg-neutral-900 px-3 text-neutral-200">
      <FontPicker value={fontFamily} onChange={(family) => updateActive({ fontFamily: family })} />

      <div className="mx-1 h-5 w-px bg-neutral-700" />

      <label className="flex items-center gap-1 text-xs text-neutral-400">
        Size
        <input
          type="number"
          min={1}
          max={400}
          value={Math.round(fontSize)}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (!Number.isNaN(v) && v > 0) updateActive({ fontSize: v })
          }}
          className="w-16 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-right text-neutral-100 outline-none focus:border-neutral-500"
        />
      </label>

      <div className="mx-1 h-5 w-px bg-neutral-700" />

      <button
        className={toggleBtn(isBold)}
        title="Bold"
        onClick={() => updateActive({ fontWeight: isBold ? 'normal' : 'bold' })}
      >
        <Bold size={16} />
      </button>
      <button
        className={toggleBtn(isItalic)}
        title="Italic"
        onClick={() => updateActive({ fontStyle: isItalic ? 'normal' : 'italic' })}
      >
        <Italic size={16} />
      </button>
      <button
        className={toggleBtn(isUnderline)}
        title="Underline"
        onClick={() => updateActive({ underline: !isUnderline })}
      >
        <Underline size={16} />
      </button>

      <div className="mx-1 h-5 w-px bg-neutral-700" />

      <label className="flex items-center gap-1 text-xs text-neutral-400" title="Text colour">
        Colour
        <input
          type="color"
          value={fill}
          onChange={(e) => updateActive({ fill: e.target.value })}
          className="h-6 w-8 cursor-pointer rounded border border-neutral-700 bg-neutral-800"
        />
      </label>
    </div>
  )
}
