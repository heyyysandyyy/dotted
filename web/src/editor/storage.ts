import type * as fabric from 'fabric'

/** Legacy single-design key (SAV-001). Read once for migration, then dropped. */
export const CURRENT_DESIGN_KEY = 'dotted:currentDesign'
/** Index of project metadata (newest first). */
export const PROJECTS_INDEX_KEY = 'dotted:projects'
/** Id of the project currently open in the editor. */
export const CURRENT_PROJECT_KEY = 'dotted:currentProjectId'

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
