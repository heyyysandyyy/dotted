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

/** One page of a design — a serialized Fabric canvas (TPL-001). */
export interface PageData {
  id: string
  canvas: object
}

/** Lightweight project descriptor kept in the index for the project list. */
export interface ProjectMeta {
  id: string
  name: string
  width: number
  height: number
  updatedAt: number
  pageCount: number
}

/** A full stored project: its pages plus identity/metadata. */
export interface StoredProject {
  id: string
  name: string
  width: number
  height: number
  updatedAt: number
  pages: PageData[]
  activePageId: string
}

/** What callers hand to saveProject (updatedAt is stamped on write). */
export type ProjectInput = Omit<StoredProject, 'updatedAt'>

/**
 * Normalize a parsed payload into a StoredProject, upgrading the legacy
 * single-canvas shape ({ canvas }) into a one-page project. Returns null if the
 * shape can't be recognized.
 */
function normalizeProject(raw: unknown): StoredProject | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (
    typeof o.id !== 'string' ||
    typeof o.name !== 'string' ||
    typeof o.width !== 'number' ||
    typeof o.height !== 'number'
  ) {
    return null
  }

  let pages: PageData[]
  let activePageId: string
  if (Array.isArray(o.pages)) {
    pages = (o.pages as unknown[]).filter(
      (p): p is PageData =>
        !!p && typeof (p as PageData).id === 'string' && typeof (p as PageData).canvas === 'object',
    )
    if (pages.length === 0) return null
    activePageId =
      typeof o.activePageId === 'string' && pages.some((p) => p.id === o.activePageId)
        ? o.activePageId
        : pages[0].id
  } else if (o.canvas && typeof o.canvas === 'object') {
    // Legacy single-canvas project → wrap as one page.
    const pid = `page-${o.id}`
    pages = [{ id: pid, canvas: o.canvas as object }]
    activePageId = pid
  } else {
    return null
  }

  return {
    id: o.id,
    name: o.name,
    width: o.width,
    height: o.height,
    updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : Date.now(),
    pages,
    activePageId,
  }
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

function metaOf(p: StoredProject): ProjectMeta {
  return { id: p.id, name: p.name, width: p.width, height: p.height, updatedAt: p.updatedAt, pageCount: p.pages.length }
}

function upsertMeta(meta: ProjectMeta): void {
  const list = listProjects().filter((p) => p.id !== meta.id)
  list.unshift(meta)
  writeIndex(list)
}

export function loadProject(id: string): StoredProject | null {
  try {
    const raw = localStorage.getItem(projectPayloadKey(id))
    if (!raw) return null
    return normalizeProject(JSON.parse(raw))
  } catch {
    return null
  }
}

/**
 * Persist a project (payload + index upsert), stamping updatedAt and moving it
 * to the front of the list. Fails soft on quota/serialization errors.
 */
export function saveProject(input: ProjectInput): boolean {
  try {
    const payload: StoredProject = { ...input, updatedAt: Date.now() }
    localStorage.setItem(projectPayloadKey(payload.id), JSON.stringify(payload))
    upsertMeta(metaOf(payload))
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
  const ok = saveProject({
    ...source,
    id: newId,
    name: `${source.name} (copy)`,
  })
  return ok ? newId : null
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

/** Build a backup of every saved project (full payloads, not just metadata). */
export function exportBackup(): DesignBackup {
  const projects = listProjects()
    .map((m) => loadProject(m.id))
    .filter((p): p is StoredProject => p !== null)
  return { version: BACKUP_VERSION, exportedAt: Date.now(), projects }
}

/**
 * Restore projects from a backup file's JSON text, merging into storage
 * (existing ids are overwritten). Accepts legacy single-canvas projects too.
 * Returns the number of projects imported. Throws if the text isn't a backup.
 */
export function importBackup(raw: string): number {
  const data = JSON.parse(raw) as Partial<DesignBackup>
  if (!data || !Array.isArray(data.projects)) {
    throw new Error('Invalid backup file')
  }

  const index = new Map(listProjects().map((m) => [m.id, m]))
  let imported = 0
  for (const entry of data.projects) {
    const project = normalizeProject(entry)
    if (!project) continue
    localStorage.setItem(projectPayloadKey(project.id), JSON.stringify(project))
    index.set(project.id, metaOf(project))
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
    const legacy = JSON.parse(raw) as { width: number; height: number; canvas: object }
    const id = makeId()
    const ok = saveProject({
      id,
      name: 'Untitled design',
      width: legacy.width,
      height: legacy.height,
      pages: [{ id: `page-${id}`, canvas: legacy.canvas }],
      activePageId: `page-${id}`,
    })
    if (ok) localStorage.removeItem(CURRENT_DESIGN_KEY)
    return ok ? id : null
  } catch {
    return null
  }
}
