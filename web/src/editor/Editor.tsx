import { useState } from 'react'
import { TopBar } from './components/TopBar'
import { CanvasStage } from './components/CanvasStage'
import { NewDesignModal } from './components/NewDesignModal'
import { LeftSidebar } from './components/LeftSidebar'
import { PropertiesPanel } from './components/PropertiesPanel'
import { useEditorShortcuts } from './hooks/useEditorShortcuts'

export function Editor() {
  const [newOpen, setNewOpen] = useState(false)
  useEditorShortcuts()

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-neutral-950">
      <TopBar onNewDesign={() => setNewOpen(true)} />

      <div className="flex flex-1 overflow-hidden">
        <LeftSidebar />

        <CanvasStage />

        <aside className="w-64 shrink-0 overflow-y-auto border-l border-neutral-800 bg-neutral-900">
          <PropertiesPanel />
        </aside>
      </div>

      <NewDesignModal open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  )
}
