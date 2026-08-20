import { useEffect, useRef, useState } from 'react'
import { Shapes } from 'lucide-react'
import { useCanvasStore } from '../store/useCanvasStore'
import type { ShapeKind } from '../store/useCanvasStore'

const SHAPES: { kind: ShapeKind; label: string; svg: React.ReactNode }[] = [
  { kind: 'rect', label: 'Rectangle', svg: <rect x="2" y="6" width="20" height="12" /> },
  {
    kind: 'roundedRect',
    label: 'Rounded',
    svg: <rect x="2" y="6" width="20" height="12" rx="4" />,
  },
  { kind: 'ellipse', label: 'Ellipse', svg: <ellipse cx="12" cy="12" rx="10" ry="7" /> },
  { kind: 'triangle', label: 'Triangle', svg: <polygon points="12,3 22,21 2,21" /> },
  {
    kind: 'line',
    label: 'Line',
    svg: <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="2" />,
  },
  {
    kind: 'arrow',
    label: 'Arrow',
    svg: <polygon points="2,9 13,9 13,5 22,12 13,19 13,15 2,15" />,
  },
]

export function ShapesMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const addShape = useCanvasStore((s) => s.addShape)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Shapes"
        className="flex h-12 w-12 flex-col items-center justify-center gap-1 rounded-lg text-[10px] text-editor-text-secondary hover:bg-editor-surface"
      >
        <Shapes size={18} />
        Shapes
      </button>

      {open && (
        <div className="absolute left-full top-0 z-50 ml-1 w-40 rounded-lg border border-editor-strong bg-editor-surface p-2 shadow-xl">
          <div className="grid grid-cols-3 gap-1">
            {SHAPES.map((s) => (
              <button
                key={s.kind}
                title={s.label}
                onClick={() => {
                  addShape(s.kind)
                  setOpen(false)
                }}
                className="flex aspect-square items-center justify-center rounded text-editor-text hover:bg-editor-surface-2"
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current">
                  {s.svg}
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
