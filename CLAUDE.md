# CLAUDE.md

## Stack
- React 18, TypeScript, Fabric.js 5.x, Zustand, Tailwind CSS
- jsPDF, tinycolor2, @dnd-kit/sortable
- Rails backend (boilerplate only — all design data stored in localStorage)

## Key Rules
- All canvas mutations go through Zustand (useCanvasStore)
- Never manipulate Fabric.js canvas directly inside a React component
- Every canvas change pushes a history snapshot, debounced 300ms
- PNG export preserves alpha and exports the artboard as-is; a transparent PNG comes from a transparent canvas background (backgroundColor = "" — empty string, not null/'transparent')
- Google Fonts: use free CSS embed API (fonts.googleapis.com), no API key, lazy-load on demand
- All design data persisted to localStorage, no backend calls

## Shipped so far
Foundational editor work is done — core canvas (configurable size, select/drag/resize/rotate,
undo+redo), text (add/edit, Google Fonts, alignment + line height), images & shapes (upload,
shape library, layers panel), export (PNG/JPEG/PDF/SVG), save (autosave, named projects + list,
duplicate, JSON backup/restore), colour (canvas background colour/image, opacity picker, custom
palettes, snap-to-grid + alignment guides), templates (multi-page, duplicate a page, starter
gallery, save-as-template), plus the fabric.js 5→7 security upgrade.

The detailed record (description, acceptance criteria, implementing PR) for every shipped ticket
lives in its **closed GitHub issue** — `gh issue list --state closed`. This file stays a lean
checklist of the *active* batch only.

## Ticket Checklist
<!-- Build order (deps): UX-013 → UX-003 → UX-004 → UX-005 → UX-008 → UX-012 →
     UX-002 → UX-006 → UX-007 → UX-009 → UX-010 → UX-011 → UX-001 → UX-014 -->
- [x] UX-001 New design modal overhaul (book engine split to UX-015)
- [x] UX-002 Draggable layers panel (lock/rename/collapse; grouping split to UX-016)
- [x] UX-003 Undo/redo history panel
- [x] UX-004 Rulers and guides (exact-position input split to UX-017)
- [x] UX-005 Grid overlay
- [x] UX-006 Object alignment tools
- [x] UX-007 Copy and paste styles
- [x] UX-008 Eyedropper
- [ ] UX-009 Image crop
- [x] UX-010 Background remover (offline solid-bg flood-fill, option 3)
- [x] UX-011 Shadow and glow effects (drop shadow + outer glow; inner shadow deferred)
- [x] UX-012 Color picker redesign with fill and stroke
- [x] UX-013 Canvas zoom
- [x] UX-014 Resize canvas
- [ ] UX-015 Book format engine (setup panel, bleed/spine guides, spread canvas, book PDF)
- [~] UX-016 Object grouping (group/ungroup, in-place edit); nested layers panel deferred
- [x] UX-017 Guide exact-position input (double-click a guide)
