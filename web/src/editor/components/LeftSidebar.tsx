import { useRef } from 'react'
import { Square, Type, ImagePlus } from 'lucide-react'
import { useCanvasStore } from '../store/useCanvasStore'

function ToolButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="flex h-12 w-12 flex-col items-center justify-center gap-1 rounded-lg text-[10px] text-neutral-300 hover:bg-neutral-800"
    >
      {icon}
      {label}
    </button>
  )
}

const ACCEPT = 'image/jpeg,image/png,image/webp,image/svg+xml,image/gif'

export function LeftSidebar() {
  const addBox = useCanvasStore((s) => s.addBox)
  const addText = useCanvasStore((s) => s.addText)
  const addImageFromFile = useCanvasStore((s) => s.addImageFromFile)
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <aside className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-neutral-800 bg-neutral-900 py-2">
      <ToolButton icon={<Type size={18} />} label="Text" onClick={addText} />
      <ToolButton
        icon={<ImagePlus size={18} />}
        label="Upload"
        onClick={() => fileRef.current?.click()}
      />
      <ToolButton icon={<Square size={18} />} label="Box" onClick={addBox} />

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) addImageFromFile(file)
          e.target.value = '' // allow re-uploading the same file
        }}
      />
    </aside>
  )
}
