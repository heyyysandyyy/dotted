import { createFileRoute } from '@tanstack/react-router'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import App from '@/App'

export const Route = createFileRoute('/')({
  component: () => (
    <ProtectedRoute>
      <App />
    </ProtectedRoute>
  ),
})
