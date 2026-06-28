import { describe, it, expect, beforeEach } from 'vitest'
import type * as fabric from 'fabric'
import {
  CURRENT_DESIGN_KEY,
  PROJECTS_INDEX_KEY,
  serializeDesign,
  listProjects,
  loadProject,
  saveProject,
  deleteProject,
  duplicateProject,
  getCurrentProjectId,
  setCurrentProjectId,
  migrateLegacyDesign,
} from './storage'

// Minimal canvas stand-in — storage only ever calls toObject(props).
const fakeCanvas = (obj: object): fabric.Canvas =>
  ({ toObject: () => obj }) as unknown as fabric.Canvas

describe('storage', () => {
  beforeEach(() => localStorage.clear())

  it('serializeDesign captures width, height and the canvas json', () => {
    const data = serializeDesign(fakeCanvas({ objects: [] }), 800, 600)
    expect(data).toEqual({ width: 800, height: 600, canvas: { objects: [] } })
  })

  it('saves and loads a project round-trip', () => {
    const ok = saveProject('p1', 'My Design', fakeCanvas({ objects: [{ type: 'rect' }] }), 400, 300)
    expect(ok).toBe(true)
    const loaded = loadProject('p1')
    expect(loaded).toMatchObject({
      id: 'p1',
      name: 'My Design',
      width: 400,
      height: 300,
      canvas: { objects: [{ type: 'rect' }] },
    })
    expect(typeof loaded?.updatedAt).toBe('number')
  })

  it('indexes saved projects newest-first and upserts by id', () => {
    saveProject('a', 'A', fakeCanvas({}), 10, 10)
    saveProject('b', 'B', fakeCanvas({}), 10, 10)
    saveProject('a', 'A renamed', fakeCanvas({}), 20, 20) // re-save existing id

    const list = listProjects()
    expect(list.map((p) => p.id)).toEqual(['a', 'b']) // most-recently-saved first
    expect(list).toHaveLength(2) // no duplicate for 'a'
    expect(list[0]).toMatchObject({ id: 'a', name: 'A renamed', width: 20, height: 20 })
  })

  it('deleteProject removes payload and index entry', () => {
    saveProject('a', 'A', fakeCanvas({}), 10, 10)
    saveProject('b', 'B', fakeCanvas({}), 10, 10)
    deleteProject('a')
    expect(loadProject('a')).toBeNull()
    expect(listProjects().map((p) => p.id)).toEqual(['b'])
  })

  it('tracks the current project id', () => {
    expect(getCurrentProjectId()).toBeNull()
    setCurrentProjectId('p1')
    expect(getCurrentProjectId()).toBe('p1')
  })

  it('listProjects returns [] when the index is corrupt (fail soft)', () => {
    localStorage.setItem(PROJECTS_INDEX_KEY, '{not json')
    expect(listProjects()).toEqual([])
  })

  it('saveProject fails soft when serialization throws', () => {
    const throwing = {
      toObject: () => {
        throw new Error('boom')
      },
    } as unknown as fabric.Canvas
    expect(saveProject('x', 'X', throwing, 1, 1)).toBe(false)
  })

  describe('duplicateProject', () => {
    it('copies the payload under a new id with a "(copy)" name', () => {
      saveProject('a', 'Poster', fakeCanvas({ objects: [{ type: 'rect' }] }), 400, 300)
      const newId = duplicateProject('a', 'a-copy')
      expect(newId).toBe('a-copy')

      const copy = loadProject('a-copy')
      expect(copy).toMatchObject({
        id: 'a-copy',
        name: 'Poster (copy)',
        width: 400,
        height: 300,
        canvas: { objects: [{ type: 'rect' }] },
      })
      // Original is untouched; copy is listed newest-first.
      expect(loadProject('a')?.name).toBe('Poster')
      expect(listProjects().map((p) => p.id)).toEqual(['a-copy', 'a'])
    })

    it('returns null when the source project is missing', () => {
      expect(duplicateProject('nope', 'x')).toBeNull()
      expect(loadProject('x')).toBeNull()
    })
  })

  describe('migrateLegacyDesign', () => {
    it('converts a SAV-001 single design into a project and clears the old key', () => {
      localStorage.setItem(
        CURRENT_DESIGN_KEY,
        JSON.stringify({ width: 500, height: 500, canvas: { objects: [] } }),
      )
      const id = migrateLegacyDesign(() => 'migrated-1')
      expect(id).toBe('migrated-1')
      expect(localStorage.getItem(CURRENT_DESIGN_KEY)).toBeNull()
      expect(listProjects().map((p) => p.id)).toEqual(['migrated-1'])
      expect(loadProject('migrated-1')).toMatchObject({ name: 'Untitled design', width: 500 })
    })

    it('returns null when there is nothing to migrate', () => {
      expect(migrateLegacyDesign(() => 'unused')).toBeNull()
    })
  })
})
