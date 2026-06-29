import { Trash2 } from 'lucide-react'
import { useHistoryStore } from '../store/useHistoryStore'

/**
 * UX-003: lists every recorded canvas action newest-first. The current state is
 * highlighted, future (redoable) states are greyed, and clicking a row jumps to
 * that state. "Clear history" keeps the current state as a fresh baseline.
 */
export function HistoryPanel() {
  const labels = useHistoryStore((s) => s.labels)
  const index = useHistoryStore((s) => s.index)
  const jumpTo = useHistoryStore((s) => s.jumpTo)
  const clearHistory = useHistoryStore((s) => s.clearHistory)

  // Display newest-first while keeping each entry's real stack index for jumpTo.
  const rows = labels.map((label, i) => ({ label, i })).reverse()

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pb-1 pt-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          History
        </span>
        <button
          onClick={clearHistory}
          disabled={labels.length <= 1}
          title="Clear history"
          className="text-neutral-500 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {rows.length === 0 ? (
          <div className="px-2 py-2 text-xs text-neutral-600">No history yet</div>
        ) : (
          rows.map(({ label, i }) => {
            const isCurrent = i === index
            const isFuture = i > index
            return (
              <button
                key={i}
                onClick={() => jumpTo(i)}
                className={`block w-full truncate rounded px-2 py-1 text-left text-xs ${
                  isCurrent
                    ? 'bg-indigo-600/30 text-white'
                    : isFuture
                      ? 'text-neutral-600 hover:bg-neutral-800'
                      : 'text-neutral-300 hover:bg-neutral-800'
                }`}
                title={label}
              >
                {label}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
