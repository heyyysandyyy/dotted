import { useState } from 'react'
import { TopBar } from './components/TopBar'
import { CanvasStage } from './components/CanvasStage'
import { NewDesignModal } from './components/NewDesignModal'

export function Editor() {
  const [newOpen, setNewOpen] = useState(false)

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-neutral-950">
      <TopBar onNewDesign={() => setNewOpen(true)} />

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar rail (tools added in later tickets) */}
        <aside className="w-16 shrink-0 border-r border-neutral-800 bg-neutral-900" />

        {/* Center stage */}
        <CanvasStage />

        {/* Right properties rail (populated in later tickets) */}
        <aside className="w-64 shrink-0 border-l border-neutral-800 bg-neutral-900" />
      </div>

      <NewDesignModal open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  )
}
