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
- [x] UX-009 Image crop
- [x] UX-010 Background remover (offline solid-bg flood-fill, option 3)
- [x] UX-011 Shadow and glow effects (drop shadow + outer glow; inner shadow deferred)
- [x] UX-012 Color picker redesign with fill and stroke
- [x] UX-013 Canvas zoom
- [x] UX-014 Resize canvas
- [x] UX-015 Book format engine (setup panel, bleed/spine guides, spread canvas, book PDF)
- [x] UX-016 Object grouping (group/ungroup, in-place edit); nested layers panel shipped as UX-018
- [x] UX-017 Guide exact-position input (double-click a guide)
- [x] UX-018 Nested layers panel (grouped layers tree, cross-group drag, world-position-preserving moves)
- [x] BOOK-002 Stack view — spread and guides (bottom strip upgraded to real thumbnails with bleed/trim/cut-mark/spine overlays, shared with the main canvas; issue #135)
- [x] BOOK-003 Draggable page reorder in strip (issue #136)
- [ ] BOOK-001 Page templates system (large — data model, template UI, page numbers, resize propagation; to be phased like UX-015)
- [ ] BOOK-004 Print export modal for book projects (large — PDF/X-1a & CMYK, font embed/outline, page range, zip bundling; likely needs phasing too, issue #126)
- [x] BUG-003 Zoom slider not functional in stack view (issue #128)
- [x] BUG-004 Stack view — cover/spread pages render at inconsistent sizes (issue #129)
- [x] BUG-005 Stack view — cover page right-aligned to spread's right edge (issue #130; back-cover mirroring left as a documented no-op — no back-cover PageType variant exists yet)
- [~] UX-020 Shadow effects (issue #113) — spread control shipped in phase 1 (#133), multiple simultaneous effects shipped in phase 2; inner shadow remains (needs real raster compositing, not just another clone)
- [x] UX-021 Crop rotated images (issue #115)
- [x] REFACTOR-003 Contain the type-cast escape hatches (issue #97)
