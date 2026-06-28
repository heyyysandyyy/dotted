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
- [ ] UX-001 New design modal overhaul + book preset
- [ ] UX-002 Draggable layers panel
