import { describe, it, expect } from 'vitest'
import * as fabric from 'fabric'
import { flattenRows, isDescendantRow, type Row } from './layerTree'

describe('flattenRows (UX-018)', () => {
  it('flattens root objects top-first', () => {
    const a = new fabric.Rect()
    const b = new fabric.Rect()
    const rows: Row[] = []
    flattenRows([a, b], 0, null, new Set(), rows) // bottom-first input: a below b
    expect(rows.map((r) => r.obj)).toEqual([b, a]) // top-first output
    expect(rows.every((r) => r.depth === 0 && r.parent === null)).toBe(true)
  })

  it("includes an expanded group's children, indented one level deeper", () => {
    const child = new fabric.Rect()
    const group = new fabric.Group([child])
    ;(group as unknown as { id: string }).id = 'group'
    const rows: Row[] = []
    flattenRows([group], 0, null, new Set(), rows)

    expect(rows).toHaveLength(2)
    expect(rows[0].obj).toBe(group)
    expect(rows[0].depth).toBe(0)
    expect(rows[1].obj).toBe(child)
    expect(rows[1].depth).toBe(1)
    expect(rows[1].parent).toBe(group)
  })

  it("skips a collapsed group's children entirely", () => {
    const child = new fabric.Rect()
    const group = new fabric.Group([child])
    ;(group as unknown as { id: string }).id = 'group'
    const rows: Row[] = []
    flattenRows([group], 0, null, new Set(['group']), rows)

    expect(rows).toHaveLength(1)
    expect(rows[0].obj).toBe(group)
  })
})

describe('isDescendantRow (UX-018)', () => {
  it('is true for a direct child of the ancestor group', () => {
    const child = new fabric.Rect()
    const group = new fabric.Group([child])
    ;(group as unknown as { id: string }).id = 'group'
    const rows: Row[] = []
    flattenRows([group], 0, null, new Set(), rows)
    const childRow = rows.find((r) => r.obj === child)!

    expect(isDescendantRow(rows, 'group', childRow)).toBe(true)
  })

  it('is true for a nested grandchild (group inside a group)', () => {
    const leaf = new fabric.Rect()
    const inner = new fabric.Group([leaf])
    ;(inner as unknown as { id: string }).id = 'inner'
    const outer = new fabric.Group([inner])
    ;(outer as unknown as { id: string }).id = 'outer'
    const rows: Row[] = []
    flattenRows([outer], 0, null, new Set(), rows)
    const leafRow = rows.find((r) => r.obj === leaf)!

    // Dragging "outer" onto the leaf nested two levels inside it must be
    // blocked — this is the case that would otherwise make outer its own
    // ancestor once moveLayerObject ran.
    expect(isDescendantRow(rows, 'outer', leafRow)).toBe(true)
  })

  it('is false for an unrelated root object', () => {
    const other = new fabric.Rect()
    const child = new fabric.Rect()
    const group = new fabric.Group([child])
    ;(group as unknown as { id: string }).id = 'group'
    const rows: Row[] = []
    flattenRows([group, other], 0, null, new Set(), rows)
    const otherRow = rows.find((r) => r.obj === other)!

    expect(isDescendantRow(rows, 'group', otherRow)).toBe(false)
  })
})
