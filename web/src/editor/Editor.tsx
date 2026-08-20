import { useEffect, useState } from 'react'
import { TopBar } from './components/TopBar'
import { CanvasStage } from './components/CanvasStage'
import { PageBar } from './components/PageBar'
import { PageStack } from './components/PageStack'
import { NewDesignModal } from './components/NewDesignModal'
import { TemplatesModal } from './components/TemplatesModal'
import { ProjectsModal } from './components/ProjectsModal'
import { ExportModal } from './components/ExportModal'
import { ResizeModal, type ResizePrefs } from './components/ResizeModal'
import { LeftSidebar } from './components/LeftSidebar'
import { PropertiesPanel } from './components/PropertiesPanel'
import { LayersPanel } from './components/LayersPanel'
import { HistoryPanel } from './components/HistoryPanel'
import { ContextToolbar } from './components/ContextToolbar'
import { ContextMenu } from './components/ContextMenu'
import { SaveErrorBanner } from './components/SaveErrorBanner'
import { useEditorShortcuts } from './hooks/useEditorShortcuts'
import { useCanvasStore } from './store/useCanvasStore'

export function Editor() {
  const [newOpen, setNewOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [projectsOpen, setProjectsOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [resizeOpen, setResizeOpen] = useState(false)
  const [resizePrefs, setResizePrefs] = useState<ResizePrefs>({ unit: 'px', lock: false, scale: false })
  const viewMode = useCanvasStore((s) => s.viewMode)
  useEditorShortcuts()

  // Open the resize modal from the top bar's size display or Cmd/Ctrl+Shift+R.
  useEffect(() => {
    const onResize = () => setResizeOpen(true)
    window.addEventListener('dotted:resize-canvas', onResize)
    return () => window.removeEventListener('dotted:resize-canvas', onResize)
  }, [])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-editor-shell">
      <TopBar
        onNewDesign={() => setNewOpen(true)}
        onTemplates={() => setTemplatesOpen(true)}
        onProjects={() => setProjectsOpen(true)}
        onExport={() => setExportOpen(true)}
      />
      <SaveErrorBanner />

      <div className="flex flex-1 overflow-hidden">
        <LeftSidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative flex-1 overflow-hidden">
            {/* CanvasStage stays mounted (canvas alive) but hidden in stack view. */}
            <div className={viewMode === 'stack' ? 'hidden' : 'flex h-full'}>
              <CanvasStage />
            </div>
            {viewMode === 'stack' && <PageStack />}
            {/* Floating text toolbar — overlays the canvas while editing text,
                so showing/hiding it never reflows the canvas (no jump). */}
            {viewMode !== 'stack' && <ContextToolbar />}
          </div>
          <PageBar />
        </div>

        <aside className="flex w-64 shrink-0 flex-col border-l border-editor bg-editor-bg">
          <div className="shrink-0 border-b border-editor">
            <PropertiesPanel />
          </div>
          <div className="min-h-0 flex-1 border-b border-editor">
            <LayersPanel />
          </div>
          <div className="min-h-0 flex-1">
            <HistoryPanel />
          </div>
        </aside>
      </div>

      <NewDesignModal open={newOpen} onClose={() => setNewOpen(false)} />
      <TemplatesModal open={templatesOpen} onClose={() => setTemplatesOpen(false)} />
      <ProjectsModal open={projectsOpen} onClose={() => setProjectsOpen(false)} />
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} />
      {resizeOpen && (
        <ResizeModal
          prefs={resizePrefs}
          onPrefsChange={setResizePrefs}
          onClose={() => setResizeOpen(false)}
        />
      )}
      <ContextMenu />
    </div>
  )
}
