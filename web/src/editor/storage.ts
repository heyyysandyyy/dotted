import type * as fabric from 'fabric'

/** Legacy single-design key (SAV-001). Read once for migration, then dropped. */
export const CURRENT_DESIGN_KEY = 'dotted:currentDesign'
/** Index of project metadata (newest first). */
export const PROJECTS_INDEX_KEY = 'dotted:projects'
/** Id of the project currently open in the editor. */
export const CURRENT_PROJECT_KEY = 'dotted:currentProjectId'
/** User's saved custom colour palette (shared across projects). */
export const PALETTE_KEY = 'dotted:palette'
/** Cap on saved palette swatches. */
export const MAX_PALETTE = 24

const projectPayloadKey = (id: string) => `dotted:project:${id}`

/** Fabric props persisted beyond the defaults (custom ids/names, lock flags). */
export const EXTRA_PROPS = ['selectable', 'name', 'id', 'lockUniScaling']

export interface SerializedDesign {
  width: number
  height: number
  canvas: object
}

/** Lightweight project descriptor kept in the index for the project list. */
export interface ProjectMeta {
  id: string
  name: string
  width: number
  height: number
  updatedAt: number
}

/** A full stored project: its design payload plus identity/metadata. */
export interface StoredProject extends SerializedDesign {
  id: string
  name: string
  updatedAt: number
}

export function serializeDesign(
  canvas: fabric.Canvas,
  width: number,
  height: number,
): SerializedDesign {
  // fabric 7: toJSON() no longer takes propertiesToInclude; toObject() does.
  return { width, height, canvas: canvas.toObject(EXTRA_PROPS) }
}

/** All saved projects, newest-updated first. Fails soft to an empty list. */
export function listProjects(): ProjectMeta[] {
  try {
    const raw = localStorage.getItem(PROJECTS_INDEX_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as ProjectMeta[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function writeIndex(list: ProjectMeta[]): void {
  localStorage.setItem(PROJECTS_INDEX_KEY, JSON.stringify(list))
}

export function loadProject(id: string): StoredProject | null {
  try {
    const raw = localStorage.getItem(projectPayloadKey(id))
    if (!raw) return null
    return JSON.parse(raw) as StoredProject
  } catch {
    return null
  }
}

/**
 * Persist a project (payload + index upsert), stamping updatedAt and moving it
 * to the front of the list. Fails soft on quota/serialization errors.
 */
export function saveProject(
  id: string,
  name: string,
  canvas: fabric.Canvas,
  width: number,
  height: number,
): boolean {
  try {
    const updatedAt = Date.now()
    const payload: StoredProject = { id, name, updatedAt, ...serializeDesign(canvas, width, height) }
    localStorage.setItem(projectPayloadKey(id), JSON.stringify(payload))

    const meta: ProjectMeta = { id, name, width, height, updatedAt }
    const list = listProjects().filter((p) => p.id !== id)
    list.unshift(meta)
    writeIndex(list)
    return true
  } catch {
    return false
  }
}

export function deleteProject(id: string): void {
  try {
    localStorage.removeItem(projectPayloadKey(id))
    writeIndex(listProjects().filter((p) => p.id !== id))
  } catch {
    // Storage unavailable — nothing more we can do.
  }
}

/**
 * Duplicate an existing project under a new id, named "<name> (copy)".
 * Returns the new project's id, or null if the source is missing or save fails.
 */
export function duplicateProject(id: string, newId: string): string | null {
  const source = loadProject(id)
  if (!source) return null
  try {
    const updatedAt = Date.now()
    const name = `${source.name} (copy)`
    const payload: StoredProject = { ...source, id: newId, name, updatedAt }
    localStorage.setItem(projectPayloadKey(newId), JSON.stringify(payload))

    const meta: ProjectMeta = { id: newId, name, width: source.width, height: source.height, updatedAt }
    const list = listProjects().filter((p) => p.id !== newId)
    list.unshift(meta)
    writeIndex(list)
    return newId
  } catch {
    return null
  }
}

export function getCurrentProjectId(): string | null {
  try {
    return localStorage.getItem(CURRENT_PROJECT_KEY)
  } catch {
    return null
  }
}

export function setCurrentProjectId(id: string): void {
  try {
    localStorage.setItem(CURRENT_PROJECT_KEY, id)
  } catch {
    // Ignore — the in-memory store still tracks the current project.
  }
}

/** The user's saved custom palette colours (newest first). */
export function getPalette(): string[] {
  try {
    const raw = localStorage.getItem(PALETTE_KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list.filter((c): c is string => typeof c === 'string') : []
  } catch {
    return []
  }
}

/** Add a colour to the front of the palette (de-duped, capped). Returns the new list. */
export function addPaletteColor(color: string): string[] {
  const next = [color, ...getPalette().filter((c) => c.toLowerCase() !== color.toLowerCase())].slice(
    0,
    MAX_PALETTE,
  )
  try {
    localStorage.setItem(PALETTE_KEY, JSON.stringify(next))
  } catch {
    // Storage unavailable — return the computed list anyway.
  }
  return next
}

/** Remove a colour from the palette. Returns the new list. */
export function removePaletteColor(color: string): string[] {
  const next = getPalette().filter((c) => c !== color)
  try {
    localStorage.setItem(PALETTE_KEY, JSON.stringify(next))
  } catch {
    // Storage unavailable — return the computed list anyway.
  }
  return next
}

/** Current schema version for exported backup files. */
export const BACKUP_VERSION = 1

/** A portable backup of every saved project. */
export interface DesignBackup {
  version: number
  exportedAt: number
  projects: StoredProject[]
}

function isStoredProject(p: unknown): p is StoredProject {
  if (!p || typeof p !== 'object') return false
  const o = p as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    typeof o.width === 'number' &&
    typeof o.height === 'number' &&
    typeof o.updatedAt === 'number' &&
    typeof o.canvas === 'object' &&
    o.canvas !== null
  )
}

/** Build a backup of every saved project (full payloads, not just metadata). */
export function exportBackup(): DesignBackup {
  const projects = listProjects()
    .map((m) => loadProject(m.id))
    .filter((p): p is StoredProject => p !== null)
  return { version: BACKUP_VERSION, exportedAt: Date.now(), projects }
}

/**
 * Restore projects from a backup file's JSON text, merging into storage
 * (existing ids are overwritten). Returns the number of projects imported.
 * Throws if the text is not a valid backup.
 */
export function importBackup(raw: string): number {
  const data = JSON.parse(raw) as Partial<DesignBackup>
  if (!data || !Array.isArray(data.projects)) {
    throw new Error('Invalid backup file')
  }

  const index = new Map(listProjects().map((m) => [m.id, m]))
  let imported = 0
  for (const p of data.projects) {
    if (!isStoredProject(p)) continue
    localStorage.setItem(projectPayloadKey(p.id), JSON.stringify(p))
    index.set(p.id, { id: p.id, name: p.name, width: p.width, height: p.height, updatedAt: p.updatedAt })
    imported++
  }

  if (imported === 0) throw new Error('No projects found in backup file')
  // Newest-updated first, consistent with saveProject ordering.
  writeIndex([...index.values()].sort((a, b) => b.updatedAt - a.updatedAt))
  return imported
}

/**
 * One-time migration of the SAV-001 single design into a named project.
 * Returns the migrated project's id, or null if there was nothing to migrate.
 */
export function migrateLegacyDesign(makeId: () => string): string | null {
  try {
    const raw = localStorage.getItem(CURRENT_DESIGN_KEY)
    if (!raw) return null
    const legacy = JSON.parse(raw) as SerializedDesign
    const id = makeId()
    const updatedAt = Date.now()
    const payload: StoredProject = { id, name: 'Untitled design', updatedAt, ...legacy }
    localStorage.setItem(projectPayloadKey(id), JSON.stringify(payload))
    writeIndex([{ id, name: 'Untitled design', width: legacy.width, height: legacy.height, updatedAt }])
    localStorage.removeItem(CURRENT_DESIGN_KEY)
    return id
  } catch {
    return null
  }
}
