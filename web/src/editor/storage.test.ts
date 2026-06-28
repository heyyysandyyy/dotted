import { describe, it, expect, beforeEach } from 'vitest'
import {
  CURRENT_DESIGN_KEY,
  PROJECTS_INDEX_KEY,
  listProjects,
  loadProject,
  saveProject,
  deleteProject,
  duplicateProject,
  exportBackup,
  importBackup,
  BACKUP_VERSION,
  getCurrentProjectId,
  setCurrentProjectId,
  migrateLegacyDesign,
  getPalette,
  addPaletteColor,
  removePaletteColor,
  MAX_PALETTE,
  listTemplates,
  loadTemplate,
  saveTemplate,
  deleteTemplate,
  type ProjectInput,
  type StoredTemplate,
} from './storage'

const projectKey = (id: string) => `dotted:project:${id}`

// Build a one-page project input with given id/name.
const proj = (id: string, name = 'P', objects: unknown[] = []): ProjectInput => ({
  id,
  name,
  width: 100,
  height: 100,
  pages: [{ id: `${id}-pg`, canvas: { objects } }],
  activePageId: `${id}-pg`,
})

describe('storage', () => {
  beforeEach(() => localStorage.clear())

  describe('palette', () => {
    it('adds colours newest-first and round-trips', () => {
      addPaletteColor('#ff0000')
      addPaletteColor('#00ff00')
      expect(getPalette()).toEqual(['#00ff00', '#ff0000'])
    })
    it('de-dupes case-insensitively, moving the colour to the front', () => {
      addPaletteColor('#ABCDEF')
      addPaletteColor('#111111')
      expect(addPaletteColor('#abcdef')).toEqual(['#abcdef', '#111111'])
    })
    it('caps the palette at MAX_PALETTE', () => {
      for (let i = 0; i < MAX_PALETTE + 5; i++) addPaletteColor(`rgba(0,0,0,${i / 100})`)
      expect(getPalette()).toHaveLength(MAX_PALETTE)
    })
    it('removes a colour', () => {
      addPaletteColor('#ff0000')
      addPaletteColor('#00ff00')
      expect(removePaletteColor('#ff0000')).toEqual(['#00ff00'])
    })
    it('returns [] for a corrupt palette (fail soft)', () => {
      localStorage.setItem('dotted:palette', '{not json')
      expect(getPalette()).toEqual([])
    })
  })

  it('saves and loads a multi-page project round-trip', () => {
    const input: ProjectInput = {
      id: 'p1',
      name: 'My Design',
      width: 400,
      height: 300,
      pages: [
        { id: 'a', canvas: { objects: [1] } },
        { id: 'b', canvas: { objects: [2] } },
      ],
      activePageId: 'b',
    }
    expect(saveProject(input)).toBe(true)
    const loaded = loadProject('p1')
    expect(loaded).toMatchObject({ id: 'p1', name: 'My Design', activePageId: 'b' })
    expect(loaded?.pages.map((pg) => pg.id)).toEqual(['a', 'b'])
    expect(typeof loaded?.updatedAt).toBe('number')
  })

  it('indexes projects newest-first with a page count and upserts by id', () => {
    saveProject(proj('a', 'A'))
    saveProject(proj('b', 'B'))
    saveProject({ ...proj('a', 'A renamed'), pages: [
      { id: 'x', canvas: {} },
      { id: 'y', canvas: {} },
    ], activePageId: 'x' })

    const list = listProjects()
    expect(list.map((p) => p.id)).toEqual(['a', 'b'])
    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({ id: 'a', name: 'A renamed', pageCount: 2 })
  })

  it('deleteProject removes payload and index entry', () => {
    saveProject(proj('a'))
    saveProject(proj('b'))
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

  describe('legacy normalization', () => {
    it('loadProject upgrades a single-canvas project into one page', () => {
      // Old SAV-era payload shape (no pages).
      localStorage.setItem(
        projectKey('old'),
        JSON.stringify({ id: 'old', name: 'Old', width: 50, height: 50, updatedAt: 1, canvas: { objects: [9] } }),
      )
      const loaded = loadProject('old')
      expect(loaded?.pages).toHaveLength(1)
      expect(loaded?.pages[0].canvas).toEqual({ objects: [9] })
      expect(loaded?.activePageId).toBe(loaded?.pages[0].id)
    })
  })

  describe('duplicateProject', () => {
    it('copies all pages under a new id with a "(copy)" name', () => {
      saveProject(proj('a', 'Poster', [{ type: 'rect' }]))
      expect(duplicateProject('a', 'a-copy')).toBe('a-copy')
      const copy = loadProject('a-copy')
      expect(copy).toMatchObject({ id: 'a-copy', name: 'Poster (copy)' })
      expect(copy?.pages[0].canvas).toEqual({ objects: [{ type: 'rect' }] })
      expect(loadProject('a')?.name).toBe('Poster')
    })
    it('returns null when the source is missing', () => {
      expect(duplicateProject('nope', 'x')).toBeNull()
    })
  })

  describe('backup / restore', () => {
    it('round-trips an exported backup (with pages)', () => {
      saveProject(proj('a', 'A', [1]))
      const json = JSON.stringify(exportBackup())
      localStorage.clear()
      expect(importBackup(json)).toBe(1)
      expect(loadProject('a')?.pages[0].canvas).toEqual({ objects: [1] })
    })
    it('imports legacy single-canvas projects, normalizing to pages', () => {
      const json = JSON.stringify({
        version: BACKUP_VERSION,
        exportedAt: Date.now(),
        projects: [{ id: 'leg', name: 'Leg', width: 10, height: 10, updatedAt: 1, canvas: { objects: [] } }],
      })
      expect(importBackup(json)).toBe(1)
      expect(loadProject('leg')?.pages).toHaveLength(1)
    })
    it('throws on malformed json or no usable projects', () => {
      expect(() => importBackup('{not json')).toThrow()
      expect(() => importBackup(JSON.stringify({ version: 1 }))).toThrow()
      expect(() => importBackup(JSON.stringify({ projects: [{ bogus: true }] }))).toThrow()
    })
  })

  describe('templates (TPL-004)', () => {
    const tpl = (id: string, name = 'T'): StoredTemplate => ({
      id,
      name,
      width: 200,
      height: 200,
      pages: [{ id: `${id}-pg`, canvas: { objects: [{ type: 'rect' }] } }],
    })

    it('saves and loads a template, indexed newest-first with page count', () => {
      expect(saveTemplate(tpl('a', 'Alpha'))).toBe(true)
      expect(saveTemplate(tpl('b', 'Beta'))).toBe(true)
      expect(listTemplates().map((t) => t.id)).toEqual(['b', 'a'])
      expect(listTemplates()[0]).toMatchObject({ id: 'b', name: 'Beta', pageCount: 1 })
      expect(loadTemplate('a')?.pages[0].canvas).toEqual({ objects: [{ type: 'rect' }] })
    })

    it('deletes a template', () => {
      saveTemplate(tpl('a'))
      saveTemplate(tpl('b'))
      deleteTemplate('a')
      expect(loadTemplate('a')).toBeNull()
      expect(listTemplates().map((t) => t.id)).toEqual(['b'])
    })

    it('listTemplates fails soft on a corrupt index', () => {
      localStorage.setItem('dotted:templates', '{not json')
      expect(listTemplates()).toEqual([])
    })
  })

  describe('migrateLegacyDesign', () => {
    it('converts a SAV-001 single design into a one-page project and clears the key', () => {
      localStorage.setItem(
        CURRENT_DESIGN_KEY,
        JSON.stringify({ width: 500, height: 500, canvas: { objects: [] } }),
      )
      const id = migrateLegacyDesign(() => 'migrated-1')
      expect(id).toBe('migrated-1')
      expect(localStorage.getItem(CURRENT_DESIGN_KEY)).toBeNull()
      const loaded = loadProject('migrated-1')
      expect(loaded?.pages).toHaveLength(1)
      expect(loaded?.width).toBe(500)
    })
    it('returns null when there is nothing to migrate', () => {
      expect(migrateLegacyDesign(() => 'unused')).toBeNull()
    })
  })
})
