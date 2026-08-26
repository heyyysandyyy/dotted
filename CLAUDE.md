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
gallery, save-as-template), plus the fabric.js 5→7 security upgrade. Photo Editor Mode (Phase 2)
is also done — its own workspace/route, image upload, edit-from-Canvas with flatten-on-exit
port-back, brightness/contrast adjustments, and session-scoped undo/redo.

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
- [x] UX-020 Shadow effects (issue #113) — spread control (phase 1, #133), multiple simultaneous effects (phase 2), inner shadow via real raster compositing (phase 3)
- [x] UX-021 Crop rotated images (issue #115)
- [x] REFACTOR-003 Contain the type-cast escape hatches (issue #97)
- [x] UX-022 Object duplicate + copy/paste (Cmd+D, Cmd+C/V) — distinct from the existing style-only clipboard (Cmd+Alt+C/V, UX-007; issue #148)
- [x] UX-023 Layer z-order controls — bring to front/send to back/forward/backward, as shortcuts and in the right-click menu; must reposition any attached effect clones/inner-shadow overlay along with the host (issue #149)
- [x] UX-024 Select all (Cmd+A) for canvas objects — excludes locked objects and synthetic effect visuals, preempts the browser's native page-text select-all (issue #150)
- [x] UX-025 Per-object opacity control (issue #151) — opacity slider in the Properties Panel, works for shapes/text/images alike; debounced into history, isolated from effect clones/inner-shadow overlay
- [x] UX-026 Light/dark theme toggle for the editor chrome — every editor component hardcodes dark-only Tailwind neutral classes; migrate to the semantic CSS-variable theme system already in index.css (shadcn boilerplate, never adopted) and add a toggle (issue #159)
- [x] UX-027 Collapsible panels/sections in the right sidebar — every titled section (Align, Style, Position & size, Appearance, Text, Image, Effects, Layers, History, Background), not just the Layers panel that already had it; collapsed state persists per-section (issue #161)
- [x] PHOTO-001 Photo Editor workspace shell — new top-level workspace, separate route/nav tab from Canvas; empty state; no Canvas-specific tools (issue #163)
- [x] PHOTO-002 Image upload into Photo Editor — JPG/PNG via file picker + drag-and-drop (issue #164)
- [x] PHOTO-003 Edit-from-Canvas entry point — "Edit" on a Canvas image opens Photo Editor with it loaded, retaining position/size/layer order for port-back (issue #165)
- [x] PHOTO-004 Brightness/contrast adjustment tools — slider + numeric input, live preview, reset per control (issue #166)
- [x] PHOTO-005 Undo/redo within a Photo Editor session (issue #167)
- [x] PHOTO-006 Flatten-on-exit + port back to Canvas — replaces the original element in place, stores edit metadata for a future non-destructive re-edit (issue #168)
- [x] PHOTO-007 Tonal and color adjustment tools (large — shipped in three phases: tone controls (exposure, highlights, shadows), color controls (saturation/vibrance, hue shift, white balance, color balance, black & white, invert), and levels/curves (live histogram of the adjusted image, input black/white/gamma, point-based per-channel tone curves))
- [ ] PHOTO-008 Sharpen, blur and noise tools — unsharp mask sharpen, gaussian/motion blur, noise reduction, add grain
- [ ] PHOTO-009 Geometry tools for Photo Editor — crop, straighten, rotate to an arbitrary angle, flip, resize/resample, perspective correction; a separate raster pipeline from Canvas's existing crop tools (UX-009, UX-021)
- [ ] PHOTO-010 Retouching brushes (large — spot/blemish removal, clone stamp, red-eye removal, dodge/burn; liquify likely split into its own ticket given warp-mesh complexity)
- [ ] PHOTO-011 Selection and local masking (large, foundational — marquee/lasso/magic wand selection, layer masks, graduated/radial local adjustment brush; unlocks locally-scoped versions of PHOTO-007/008/010 tools, so worth sequencing before those where possible)
- [ ] PHOTO-012 Filters and preset effects — vignette, duotone/color grading, sepia, preset filter gallery (vintage, warm/cool looks)
- [ ] PHOTO-013 Non-destructive adjustment stack — before/after toggle, persistent per-tool edit-parameter stack for re-editing; builds directly on PHOTO-006's port-back edit metadata
- [x] PROD-001 Print product templates: pins & magnets — new-design entry point with a category grid + size picker; PresetTemplate data model (category, label, circular shape, diameterIn, bleedIn, safeZoneIn, dpi); canvas sized at (diameter + bleed*2) * 300dpi; concentric trim/bleed/safe-zone guide circles on a non-selectable guide layer, toggleable from the layers panel and always excluded from PNG/PDF export; 6 presets (pins 1"/1.5"/2.25"/3", magnets 2"/3")
- [ ] PROD-002 Print product templates: further product families (not yet scoped — stickers die-cut/kiss-cut, cards postcard/greeting, patches, keychains, totes, mugs, phone cases; extends PROD-001's preset model beyond circular shapes)
