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
- [x] BUG-006 SVG export substitutes a default font for the design's Google font — embed the used faces as `@font-face` data URIs, subsetted by the characters actually typed (issue #239)
- [x] BUG-007 Photo Editor Save failed for an image inside a group — "Couldn't find that image on Canvas anymore": port-back only searched a page's top-level objects, but "Edit in Photo Editor" is offered on an image drilled into inside a group (UX-016), whose JSON lives in the group's own `objects` array; the lookup now recurses into groups and re-places the image in its group's coordinate space
- [x] BUG-008 Delete did nothing to a shape inside a group — deleteActive called canvas.remove() on objects that belong to a group, not to the canvas, so deleting a child drilled into in place (UX-016) silently cleared the selection and left the shape; it now removes the child from its group, takes away any group left empty, and records the deletion (a group's own removal event never reaches the canvas listeners history and autosave hang off)
- [x] BUG-009 A Photo Editor save could not be undone on Canvas — the port-back rewrites the project while CanvasStage is unmounted, so nothing recorded it and the replaced image was gone for good (no way back from an edit that went wrong). The pre-edit project state is now stashed on the store and seeded behind the reloaded state in useHistoryStore.reset (which runs after the async project load, unlike a seed at the call site), so Cmd/Ctrl+Z restores the original image and the History panel shows "Photo Editor edit"
- [x] BUG-010 Uncaught TypeError on every workspace switch ("Cannot read properties of undefined (reading 'ctx')", also in a production build) — page-thumbnail previews start a fabric loadFromJSON and the unmount disposer calls dispose() straight away; fabric's own clear() then runs when the load settles, against a canvas whose contexts are already freed. Every load now takes an AbortSignal that the disposer aborts (preview.ts), and the editor's page loads go through an abortable helper that CanvasStage's teardown cancels too
- [x] BUG-011 Modals could not be closed with Escape and were not exposed as dialogs — New design, Templates, Projects, Resize and Export all trapped users at the mouse and told assistive tech nothing; the shared Modal now closes on Escape (captured, so it doesn't also exit crop/painter mode underneath) and carries role=dialog, aria-modal and a title association
- [x] BUG-012 Page duplicate/delete were mouse-only — the per-page controls in the page strip were `hidden` until hover, so they were out of the DOM's tab order and a keyboard user could never duplicate or delete a page. They now stay in the DOM, faded out and click-through, and appear on focus as well as hover; both they and the stack-view equivalents are labelled per page ("Duplicate page 2") instead of sharing one generic title
- [x] BUG-013 Page-thumbnail hover icons overlapped — the drag-handle hint (top-left) and the duplicate/delete buttons (top-right) collided on a portrait page, whose thumbnail is only ~40px wide at the strip's 52px height. The duplicate and delete buttons are now separate chips with a gap between them (they read as one blob when flush), tucked into the top-right corner, and the decorative drag hint moved to the bottom-left, so nothing collides at any page aspect — measured on an 816 × 1056 page: two 13px chips, 4px apart, inside a 40px-wide thumbnail
- [x] UX-020 Shadow effects (issue #113) — spread control (phase 1, #133), multiple simultaneous effects (phase 2), inner shadow via real raster compositing (phase 3)
- [x] UX-021 Crop rotated images (issue #115)
- [x] REFACTOR-003 Contain the type-cast escape hatches (issue #97)
- [x] UX-022 Object duplicate + copy/paste (Cmd+D, Cmd+C/V) — distinct from the existing style-only clipboard (Cmd+Alt+C/V, UX-007; issue #148)
- [x] UX-023 Layer z-order controls — bring to front/send to back/forward/backward, as shortcuts and in the right-click menu; must reposition any attached effect clones/inner-shadow overlay along with the host (issue #149)
- [x] UX-024 Select all (Cmd+A) for canvas objects — excludes locked objects and synthetic effect visuals, preempts the browser's native page-text select-all (issue #150)
- [x] UX-025 Per-object opacity control (issue #151) — opacity slider in the Properties Panel, works for shapes/text/images alike; debounced into history, isolated from effect clones/inner-shadow overlay
- [x] UX-026 Light/dark theme toggle for the editor chrome — every editor component hardcodes dark-only Tailwind neutral classes; migrate to the semantic CSS-variable theme system already in index.css (shadcn boilerplate, never adopted) and add a toggle (issue #159)
- [x] UX-027 Collapsible panels/sections in the right sidebar — every titled section (Align, Style, Position & size, Appearance, Text, Image, Effects, Layers, History, Background), not just the Layers panel that already had it; collapsed state persists per-section (issue #161)
- [x] UX-028 Expand export dialog options — the dialog currently offers only format (PNG/JPEG/PDF/SVG) and 1x/2x/3x scale; add a transparent-background toggle (PNG only, default on, hidden/disabled for JPEG), an export-scope toggle (full artboard vs. selection only, the latter disabled with nothing selected), a custom numeric scale field alongside the existing chips, and an editable file-name field defaulting to the artboard/project name and sanitized for the filesystem; apply the artboard-bounds crop (left/top/width/height in untransformed coords) across all four formats rather than only whichever path does it today, using the scope toggle's bounds, so no export includes pasteboard or out-of-bounds content
- [x] PHOTO-001 Photo Editor workspace shell — new top-level workspace, separate route/nav tab from Canvas; empty state; no Canvas-specific tools (issue #163)
- [x] PHOTO-002 Image upload into Photo Editor — JPG/PNG via file picker + drag-and-drop (issue #164)
- [x] PHOTO-003 Edit-from-Canvas entry point — "Edit" on a Canvas image opens Photo Editor with it loaded, retaining position/size/layer order for port-back (issue #165)
- [x] PHOTO-004 Brightness/contrast adjustment tools — slider + numeric input, live preview, reset per control (issue #166)
- [x] PHOTO-005 Undo/redo within a Photo Editor session (issue #167)
- [x] PHOTO-006 Flatten-on-exit + port back to Canvas — replaces the original element in place, stores edit metadata for a future non-destructive re-edit (issue #168)
- [x] PHOTO-007 Tonal and color adjustment tools (large — shipped in three phases: tone controls (exposure, highlights, shadows), color controls (saturation/vibrance, hue shift, white balance, color balance, black & white, invert), and levels/curves (live histogram of the adjusted image, input black/white/gamma, point-based per-channel tone curves))
- [x] PHOTO-008 Sharpen, blur and noise tools — unsharp mask sharpen (amount + radius), gaussian and motion blur (with a direction control), edge-preserving noise reduction, add grain; the first photo pass that reads a pixel's neighbours rather than mapping each one on its own (spatialPass.ts, a box-blur-approximated gaussian). Every spatial radius is a fraction of the render's shorter edge, so the capped preview, the 256px histogram proxy and the full-resolution bake all show the same look; the preview renders at a 1400px cap because a full-size blur ran to seconds per frame
- [x] PHOTO-009 Geometry tools for Photo Editor — crop, straighten, rotate to an arbitrary angle, flip, resize/resample, perspective correction; a separate raster pipeline from Canvas's existing crop tools (UX-009, UX-021)
- [ ] PHOTO-010 Retouching brushes (large — spot/blemish removal, clone stamp, red-eye removal, dodge/burn; liquify likely split into its own ticket given warp-mesh complexity)
- [x] PHOTO-011 Selection and local masking (large, foundational — shipped in three phases: (1) rectangle/ellipse marquee, lasso and magic wand selections with new/add/subtract, feather, invert and deselect, confining every tonal/colour/detail adjustment to the selection; (2) adjustment layers — each with its own tone/colour/detail settings, its own mask, opacity and visibility, applied in stack order, add/rename/reorder/delete, undoable; (3) brush and gradient masks — a paint-on brush with size and hardness (Alt erases, strokes build up) and graduated/radial gradient masks, both usable as the base selection or any layer's mask. Every mask kind is stored in normalized source coordinates, so it survives later crop/rotate/keystone changes and rasterizes identically at the preview, the histogram proxy and the full-size bake)
- [x] UX-029 Make the Photo Editor's masking flow legible — PHOTO-011 shipped the capability but not a usable flow: tools were unlabelled icons, nothing said select-then-adjust, the mask was invisible (a dashed outline only, after release), the brush had no size cursor, and turning a selection into its own layer meant finding "New layer" in another panel. Adds labelled tools, a numbered next-step hint, a red mask tint (toggleable, on by default), a brush-size ring under the pointer, an "Adjust this area separately" button that creates the layer from the selection and scrolls to the sliders, and platform-correct modifier names (lib/keyLabels.ts: "Option" and ⌘ on a Mac, "Alt" and Ctrl elsewhere) — the hints told Mac users to hold a key their keyboard does not have
- [ ] PHOTO-012 Filters and preset effects — vignette, duotone/color grading, sepia, preset filter gallery (vintage, warm/cool looks)
- [ ] PHOTO-013 Non-destructive adjustment stack — before/after toggle, persistent per-tool edit-parameter stack for re-editing; builds directly on PHOTO-006's port-back edit metadata
- [ ] PHOTO-014 Cut/copy/paste a selection as a movable layer — Cmd/Ctrl+X and Cmd/Ctrl+C lift the pixels inside the current PHOTO-011 selection (feathered edges kept, trimmed to the selection's bounds); cut leaves transparency behind, never a fill colour (so a JPEG source must then save as PNG); Cmd/Ctrl+V pastes the piece as a floating layer over the photo, pasted in place, that can be dragged to a new position before it's merged down; needs a minimal layer stack in the Photo Editor, so sequence it with PHOTO-011's layer-masks phase; cut holes and pasted layers go through the undo history and PHOTO-006's `edits` metadata so Save and a later re-edit keep them
- [x] PROD-001 Print product templates: pins & magnets — new-design entry point with a category grid + size picker; PresetTemplate data model (category, label, circular shape, diameterIn, bleedIn, safeZoneIn, dpi); canvas sized at (diameter + bleed*2) * 300dpi; concentric trim/bleed/safe-zone guide circles on a non-selectable guide layer, toggleable from the layers panel and always excluded from PNG/PDF export; 7 presets (pins 1"/1.25"/1.5"/2.25"/3", magnets 2"/3"); optional multi-up sheets — US Letter or A4 at 300dpi with a 0.25in printer margin, a customizable count capped at what fits, and a guide set per cell; the two magnet presets can be ordered round or square; custom sizes are the product's own (round diameter or rectangular W × H, 0.5–12in, category margins inherited), with the artboard and the per-page maximum derived from them
- [ ] PROD-002 Print product templates: further product families (not yet scoped — stickers die-cut/kiss-cut, cards postcard/greeting, patches, keychains, totes, mugs, phone cases; extends PROD-001's preset model beyond circular shapes)
- [ ] PROD-003 Print product templates: notepads — a notepad product family built for print-and-guillotine pad making. Rectangular presets (A6, A5, half-letter 5.5×8.5in, quarter-letter 4.25×5.5in, 4×6in, 5×7in, 3×5in memo) plus a custom size, each with paper bleed and a safe zone, at 300dpi. Ganged multi-up sheets are the point: US Letter or A4 with the existing printer margin, as many pads per sheet as fit, count adjustable, guides per cell. Exports carry corner crop marks — short lines at each cell's trim corners, sitting out in the bleed clear of the artwork, the way a print shop expects — rather than the dashed trim outline pins use, so the mark style becomes a property of the product; screen guides (bleed tint, trim, safe zone) stay as they are, and marks must appear in PNG/JPEG/PDF and SVG alike
