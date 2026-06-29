import { useMemo, useState } from 'react'
import {
  PRESET_FILTERS,
  SIZE_PRESETS,
  SIZE_UNITS,
  type PresetFilter,
  type SizePreset,
  type UnitId,
} from '../constants'
import { useCanvasStore } from '../store/useCanvasStore'

interface Props {
  open: boolean
  onClose: () => void
}

/** Largest thumbnail box (px); the preview keeps the preset's real aspect ratio. */
const THUMB_BOX = 72

const FILTER_LABELS: Record<PresetFilter, string> = {
  all: 'All',
  social: 'Social',
  print: 'Print',
  book: 'Book',
  presentation: 'Presentation',
  video: 'Video',
}

const pxPer = (unit: UnitId) => SIZE_UNITS.find((u) => u.id === unit)!.pxPer

/** Format a px value for display in the chosen unit (whole px, 2dp otherwise). */
function pxToUnit(px: number, unit: UnitId): string {
  const v = px / pxPer(unit)
  return unit === 'px' ? String(Math.round(v)) : v.toFixed(2)
}

export function NewDesignModal({ open, onClose }: Props) {
  const newProject = useCanvasStore((s) => s.newProject)
  const [filter, setFilter] = useState<PresetFilter>('all')
  const [search, setSearch] = useState('')
  const [unit, setUnit] = useState<UnitId>('px')
  const [wStr, setWStr] = useState('1080')
  const [hStr, setHStr] = useState('1080')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const presets = useMemo(() => {
    const q = search.trim().toLowerCase()
    return SIZE_PRESETS.filter(
      (p) =>
        (filter === 'all' || p.category === filter) &&
        (q === '' || p.label.toLowerCase().includes(q)),
    )
  }, [filter, search])

  if (!open) return null

  // Clicking a preset fills the custom-size inputs (in px) rather than creating
  // immediately, so the user can tweak before committing.
  const pickPreset = (p: SizePreset) => {
    setUnit('px')
    setWStr(String(p.width))
    setHStr(String(p.height))
    setSelectedId(p.id)
  }

  const changeUnit = (next: UnitId) => {
    // Preserve the real size: reinterpret the current value into the new unit.
    const toPx = (s: string) => (Number(s) || 0) * pxPer(unit)
    setWStr(pxToUnit(toPx(wStr), next))
    setHStr(pxToUnit(toPx(hStr), next))
    setUnit(next)
  }

  const create = () => {
    const toPx = (s: string) => Math.max(1, Math.round((Number(s) || 0) * pxPer(unit)))
    newProject(toPx(wStr), toPx(hStr))
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-[720px] flex-col rounded-xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            New design
          </div>
          <h2 className="text-xl font-semibold text-neutral-900">What are you creating?</h2>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          {PRESET_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1 text-sm transition ${
                filter === f
                  ? 'border-neutral-900 bg-neutral-900 text-white'
                  : 'border-neutral-300 text-neutral-600 hover:border-neutral-500'
              }`}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search presets…"
            className="ml-auto w-40 rounded-md border border-neutral-300 px-3 py-1 text-sm text-neutral-900 placeholder:text-neutral-400"
          />
        </div>

        <div className="grid max-h-[320px] grid-cols-4 gap-3 overflow-y-auto pr-1">
          {presets.map((p) => {
            const scale = Math.min(THUMB_BOX / p.width, THUMB_BOX / p.height)
            const isSelected = selectedId === p.id
            return (
              <button
                key={p.id}
                onClick={() => pickPreset(p)}
                className={`relative flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition ${
                  isSelected
                    ? 'border-neutral-900 bg-neutral-50'
                    : 'border-neutral-200 hover:border-neutral-900 hover:bg-neutral-50'
                }`}
              >
                {p.category === 'book' && (
                  <span className="absolute right-1.5 top-1.5 rounded-full bg-pink-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    Book
                  </span>
                )}
                <div className="flex h-[72px] w-[72px] items-center justify-center">
                  <div
                    className="rounded-sm bg-neutral-200"
                    style={{ width: p.width * scale, height: p.height * scale }}
                  />
                </div>
                <div className="text-xs font-medium leading-tight text-neutral-800">{p.label}</div>
                <div className="text-[11px] text-neutral-500">
                  {pxToUnit(p.width, unit)} × {pxToUnit(p.height, unit)} {unit}
                </div>
              </button>
            )
          })}
          {presets.length === 0 && (
            <div className="col-span-4 py-10 text-center text-sm text-neutral-400">
              No presets match “{search}”.
            </div>
          )}
        </div>

        <div className="mt-5 rounded-lg border border-neutral-200 p-3">
          <div className="mb-2 text-sm font-medium text-neutral-800">Custom size</div>
          <div className="flex items-end gap-3">
            <label className="flex flex-col text-xs text-neutral-500">
              Width
              <input
                type="number"
                min={1}
                value={wStr}
                onChange={(e) => {
                  setWStr(e.target.value)
                  setSelectedId(null)
                }}
                className="mt-1 w-24 rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-900"
              />
            </label>
            <span className="pb-2 text-neutral-400">×</span>
            <label className="flex flex-col text-xs text-neutral-500">
              Height
              <input
                type="number"
                min={1}
                value={hStr}
                onChange={(e) => {
                  setHStr(e.target.value)
                  setSelectedId(null)
                }}
                className="mt-1 w-24 rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-900"
              />
            </label>
            <label className="flex flex-col text-xs text-neutral-500">
              Units
              <select
                value={unit}
                onChange={(e) => changeUnit(e.target.value as UnitId)}
                className="mt-1 rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-900"
              >
                {SIZE_UNITS.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={create}
              className="ml-auto rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
            >
              Create
            </button>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:text-neutral-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
