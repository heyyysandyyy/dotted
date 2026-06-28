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

## Ticket Checklist
- [x] CVS-001 Blank canvas with configurable dimensions
- [x] CVS-002 Select, drag, resize, rotate objects
- [x] CVS-003 Undo and redo
- [x] TXT-001 Add and edit text objects
- [x] TXT-002 Google Fonts picker
- [x] TXT-003 Text alignment and line height
- [x] IMG-001 Upload and place images
- [x] IMG-002 Basic shape library
- [x] IMG-003 Layers panel
- [x] EXP-001 Export as transparent PNG
- [x] EXP-002 Export as JPEG
- [x] EXP-003 Export as PDF
- [ ] EXP-004 Export as SVG
- [x] SAV-001 Auto-save to localStorage
- [x] SAV-002 Named projects and project list
- [x] SAV-003 Duplicate a design
- [x] SAV-004 JSON backup and restore
- [x] CLR-001 Canvas background colour and image
- [x] CLR-002 Colour picker with opacity
- [ ] CLR-003 Custom colour palettes
- [ ] CLR-004 Snap-to-grid and alignment guides
- [ ] TPL-001 Multi-page designs
- [ ] TPL-002 Duplicate a page
- [ ] TPL-003 Starter template gallery
- [ ] TPL-004 Save design as a template
