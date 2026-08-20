import { createFileRoute } from '@tanstack/react-router'
import { PhotoEditor } from '@/photo-editor/PhotoEditor'

export const Route = createFileRoute('/photo-editor')({
  component: PhotoEditor,
})
