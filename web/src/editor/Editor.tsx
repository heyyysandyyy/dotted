import { useState } from 'react'
import { TopBar } from './components/TopBar'
import { CanvasStage } from './components/CanvasStage'
import { PageBar } from './components/PageBar'
import { NewDesignModal } from './components/NewDesignModal'
import { ProjectsModal } from './components/ProjectsModal'
import { ExportModal } from './components/ExportModal'
import { LeftSidebar } from './components/LeftSidebar'
import { PropertiesPanel } from './components/PropertiesPanel'
import { LayersPanel } from './components/LayersPanel'
import { ContextToolbar } from './components/ContextToolbar'
import { useEditorShortcuts } from './hooks/useEditorShortcuts'

export function Editor() {
  const [newOpen, setNewOpen] = useState(false)
  const [projectsOpen, setProjectsOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  useEditorShortcuts()

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-neutral-950">
      <TopBar
        onNewDesign={() => setNewOpen(true)}
        onProjects={() => setProjectsOpen(true)}
        onExport={() => setExportOpen(true)}
      />
      <ContextToolbar />

      <div className="flex flex-1 overflow-hidden">
        <LeftSidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <CanvasStage />
          <PageBar />
        </div>

        <aside className="flex w-64 shrink-0 flex-col border-l border-neutral-800 bg-neutral-900">
          <div className="shrink-0 border-b border-neutral-800">
            <PropertiesPanel />
          </div>
          <div className="min-h-0 flex-1">
            <LayersPanel />
          </div>
        </aside>
      </div>

      <NewDesignModal open={newOpen} onClose={() => setNewOpen(false)} />
      <ProjectsModal open={projectsOpen} onClose={() => setProjectsOpen(false)} />
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  )
}
