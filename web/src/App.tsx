import { Button } from '@/components/ui/button'

export default function App() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">myapp</h1>
        <p className="text-muted-foreground">Rails API + React + Tailwind + shadcn/ui</p>
        <Button>Get started</Button>
      </div>
    </main>
  )
}
