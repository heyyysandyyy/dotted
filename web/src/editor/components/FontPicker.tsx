import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { GOOGLE_FONTS, loadGoogleFont, setLastFont } from '../fonts'

interface Props {
  value: string
  onChange: (family: string) => void
}

/** Searchable Google Fonts dropdown. Selecting lazy-loads then applies. */
export function FontPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const filtered = GOOGLE_FONTS.filter((f) =>
    f.toLowerCase().includes(query.trim().toLowerCase()),
  )

  const select = async (family: string) => {
    setOpen(false)
    setQuery('')
    await loadGoogleFont(family)
    setLastFont(family)
    onChange(family)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-44 items-center justify-between gap-2 rounded border border-editor-strong bg-editor-surface px-2 py-1 text-sm text-editor-text-strong hover:border-editor-input"
        title="Font family"
      >
        <span className="truncate">{value}</span>
        <ChevronDown size={14} className="shrink-0 text-editor-text-muted" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-editor-strong bg-editor-surface shadow-xl">
          <div className="p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search fonts…"
              className="w-full rounded border border-editor-strong bg-editor-bg px-2 py-1 text-sm text-editor-text-strong outline-none focus:border-editor-input"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-xs text-editor-text-subtle">No matches</li>
            )}
            {filtered.map((f) => (
              <li key={f}>
                <button
                  onClick={() => select(f)}
                  className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-editor-surface-2 ${
                    f === value ? 'text-editor-text-strong' : 'text-editor-text-secondary'
                  }`}
                >
                  {f}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
