import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
} from 'lucide-react'
import { useCanvasStore } from '../store/useCanvasStore'
import { isText } from '../utils'
import { FontPicker } from './FontPicker'

export function ContextToolbar() {
  useCanvasStore((s) => s.tick) // re-render on live changes
  const selection = useCanvasStore((s) => s.selection)
  const updateActive = useCanvasStore((s) => s.updateActive)

  const obj = selection.length === 1 ? selection[0] : null
  // Shown whenever a single text object is selected. It floats over the canvas
  // (absolute) so appearing/disappearing never reflows the canvas — the jump
  // came from it living in the layout, not from showing on selection.
  if (!isText(obj)) return null

  const fontSize = obj.fontSize ?? 48
  const isBold = obj.fontWeight === 'bold' || obj.fontWeight === 700
  const isItalic = obj.fontStyle === 'italic'
  const isUnderline = !!obj.underline
  const fill = typeof obj.fill === 'string' ? obj.fill : '#111111'
  const fontFamily = obj.fontFamily ?? 'Arial'
  const align = obj.textAlign ?? 'left'

  const toggleBtn = (active: boolean) =>
    `rounded p-1.5 ${active ? 'bg-editor-surface-2 text-editor-text-strong' : 'text-editor-text-secondary hover:bg-editor-surface'}`

  return (
    <div className="absolute left-1/2 top-3 z-20 flex h-11 -translate-x-1/2 items-center gap-2 rounded-lg border border-editor-strong bg-editor-bg/95 px-3 text-editor-text shadow-xl backdrop-blur">
      <FontPicker value={fontFamily} onChange={(family) => updateActive({ fontFamily: family })} />

      <div className="mx-1 h-5 w-px bg-editor-surface-2" />

      <label className="flex items-center gap-1 text-xs text-editor-text-muted">
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
          className="w-16 rounded border border-editor-strong bg-editor-surface px-2 py-1 text-right text-editor-text-strong outline-none focus:border-editor-input"
        />
      </label>

      <div className="mx-1 h-5 w-px bg-editor-surface-2" />

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

      <div className="mx-1 h-5 w-px bg-editor-surface-2" />

      <button
        className={toggleBtn(align === 'left')}
        title="Align left"
        onClick={() => updateActive({ textAlign: 'left' })}
      >
        <AlignLeft size={16} />
      </button>
      <button
        className={toggleBtn(align === 'center')}
        title="Align centre"
        onClick={() => updateActive({ textAlign: 'center' })}
      >
        <AlignCenter size={16} />
      </button>
      <button
        className={toggleBtn(align === 'right')}
        title="Align right"
        onClick={() => updateActive({ textAlign: 'right' })}
      >
        <AlignRight size={16} />
      </button>
      <button
        className={toggleBtn(align === 'justify')}
        title="Justify"
        onClick={() => updateActive({ textAlign: 'justify' })}
      >
        <AlignJustify size={16} />
      </button>

      <div className="mx-1 h-5 w-px bg-editor-surface-2" />

      <label className="flex items-center gap-1 text-xs text-editor-text-muted" title="Text colour">
        Colour
        <input
          type="color"
          value={fill}
          onChange={(e) => updateActive({ fill: e.target.value })}
          className="h-6 w-8 cursor-pointer rounded border border-editor-strong bg-editor-surface"
        />
      </label>
    </div>
  )
}
