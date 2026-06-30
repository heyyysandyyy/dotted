import {
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
} from 'lucide-react'
import { useCanvasStore } from '../store/useCanvasStore'
import type { AlignMode } from '../utils'

/** Align & distribute controls, shown when objects are selected (UX-006). */
export function AlignmentToolbar() {
  const selection = useCanvasStore((s) => s.selection)
  const alignObjects = useCanvasStore((s) => s.alignObjects)
  const distributeObjects = useCanvasStore((s) => s.distributeObjects)

  if (selection.length === 0) return null
  const canDistribute = selection.length >= 3

  const aligns: { mode: AlignMode; label: string; Icon: typeof AlignStartVertical }[] = [
    { mode: 'left', label: 'Align left', Icon: AlignStartVertical },
    { mode: 'centerH', label: 'Align horizontal centres', Icon: AlignCenterVertical },
    { mode: 'right', label: 'Align right', Icon: AlignEndVertical },
    { mode: 'top', label: 'Align top', Icon: AlignStartHorizontal },
    { mode: 'middleV', label: 'Align vertical centres', Icon: AlignCenterHorizontal },
    { mode: 'bottom', label: 'Align bottom', Icon: AlignEndHorizontal },
  ]

  const btn = 'rounded p-1.5 text-neutral-300 hover:bg-neutral-800'

  return (
    <div className="space-y-2 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {selection.length > 1 ? 'Align to selection' : 'Align to canvas'}
      </div>
      <div className="flex flex-wrap gap-1">
        {aligns.map(({ mode, label, Icon }) => (
          <button key={mode} onClick={() => alignObjects(mode)} title={label} className={btn}>
            <Icon size={16} />
          </button>
        ))}
        <button
          onClick={() => distributeObjects('horizontal')}
          disabled={!canDistribute}
          title="Distribute horizontally (3+ objects)"
          className={`${btn} disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent`}
        >
          <AlignHorizontalDistributeCenter size={16} />
        </button>
        <button
          onClick={() => distributeObjects('vertical')}
          disabled={!canDistribute}
          title="Distribute vertically (3+ objects)"
          className={`${btn} disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent`}
        >
          <AlignVerticalDistributeCenter size={16} />
        </button>
      </div>
    </div>
  )
}
