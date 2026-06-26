import { createFileRoute } from '@tanstack/react-router'
import { Editor } from '@/editor/Editor'

export const Route = createFileRoute('/')({
  component: Editor,
})
