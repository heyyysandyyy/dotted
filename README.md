# dotted

A browser-based design editor — think a lightweight Canva. Build single-page
designs or multi-page book projects with shapes, text, images, and effects,
then export to PNG, JPEG, PDF, or SVG. Everything runs client-side: every
design is saved to `localStorage`, no account and no server round-trip
required.

## Features

- **Canvas** — configurable artboard size, select/drag/resize/rotate,
  snap-to-grid and alignment guides, full undo/redo history
- **Text** — rich text boxes with Google Fonts, alignment, line height, bold/
  italic/underline
- **Shapes & images** — a built-in shape library, image upload, crop
  (including rotated images), an offline background remover
- **Effects** — drop shadow, outer glow, and inner shadow, independently
  stackable, with spread control
- **Layers** — a draggable, nested layers panel with lock/rename/collapse and
  grouping
- **Colour** — a fill/stroke colour picker with alpha, custom palettes,
  canvas background colour or image
- **Books** — multi-page projects with a dedicated book format engine (bleed
  and spine guides, spread canvas, cover + spread pages, book-aware PDF
  export) and a stack view showing every page at once
- **Templates** — a starter gallery, save-your-own templates, duplicate a
  page
- **Save** — autosave, named projects with a project list, duplicate a
  project, JSON backup/restore
- **Export** — PNG (with alpha), JPEG, PDF, and SVG

## Getting started

Requires Node 20+.

```bash
cd web
npm install
npm run dev
```

Open the URL Vite prints (`http://localhost:5173` by default — it'll pick
the next free port if that one's taken). That's it: no database, no API
server, no environment variables. Every design is persisted to
`localStorage` in the browser.

### Scripts

Run from `web/`:

| Command | Does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check (`tsc -b`) and build for production |
| `npm run preview` | Preview a production build locally |
| `npm run lint` | ESLint |
| `npm test` | Run the Vitest suite |
| `npm run audit` | Dependency security audit (`audit-ci`) |

## Keyboard shortcuts

`Cmd` on macOS, `Ctrl` on Windows/Linux — every shortcut below works with
either. Shortcuts that touch the canvas selection are disabled while you're
typing in a text box or a panel field, so they never fight normal text
editing.

### Edit

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` | Redo |
| `Cmd/Ctrl + Y` | Redo |
| `Cmd/Ctrl + D` | Duplicate the selection |
| `Cmd/Ctrl + C` | Copy the selection |
| `Cmd/Ctrl + V` | Paste |
| `Cmd/Ctrl + Alt + C` | Copy style (fill/stroke/font) from the selection |
| `Cmd/Ctrl + Alt + V` | Paste style onto the selection |
| `Cmd/Ctrl + A` | Select all objects on the page |
| `Delete` / `Backspace` | Delete the selection |
| `Escape` | Cancel: exits format-painter mode, cancels an in-progress crop, cancels an in-progress eyedropper pick, or steps back out of in-place group editing, depending on what's active |

### Arrange

| Shortcut | Action |
|---|---|
| `Arrow keys` | Nudge the selection 1px |
| `Shift + Arrow keys` | Nudge the selection 10px |
| `Cmd/Ctrl + ]` | Bring forward one step |
| `Cmd/Ctrl + Shift + ]` | Bring to front |
| `Cmd/Ctrl + [` | Send backward one step |
| `Cmd/Ctrl + Shift + [` | Send to back |
| `Cmd/Ctrl + G` | Group the selection |
| `Cmd/Ctrl + Shift + G` | Ungroup |

### View

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + =` / `+` | Zoom in |
| `Cmd/Ctrl + -` | Zoom out |
| `Cmd/Ctrl + 0` | Reset zoom to 100% |
| `Cmd/Ctrl + Shift + H` | Fit the artboard to the window |
| `Space + drag` or middle-mouse drag | Pan the canvas |
| `Cmd/Ctrl + R` | Toggle rulers |
| `Cmd/Ctrl + Shift + R` | Open the resize-canvas dialog |
| `Cmd/Ctrl + ;` | Toggle guides |
| `Cmd/Ctrl + '` | Toggle the grid overlay |

In stack view, the zoom shortcuts above scale the page thumbnails instead of
the single-page canvas.

### Tools

| Shortcut | Action |
|---|---|
| `I` | Eyedropper — sample a colour under the cursor onto the selected object's fill |

### While cropping an image

| Shortcut | Action |
|---|---|
| `Enter` | Apply the crop |
| `Escape` | Cancel the crop |

## Project structure

```
web/     the app — everything above lives here
api/     inherited Rails boilerplate; not used by the app (see below)
scripts/ repo maintenance scripts
```

`dotted` was bootstrapped from a Rails + React starter template. The `api/`
directory and its Postgres/MailCatcher setup (`compose.yml`) are leftover
scaffolding from that template — every design mutation goes through the
Zustand store in `web/` and is persisted to `localStorage`; there are no
backend calls. You only need `cd web && npm install && npm run dev` to run
the app.

## Tech stack

| Layer | Technology |
|---|---|
| Framework | React 19, TypeScript, Vite |
| Canvas | Fabric.js 7 |
| State | Zustand |
| Styling | Tailwind CSS 4 |
| Export | jsPDF |
| Colour | tinycolor2 |
| Drag & drop | @dnd-kit/sortable |
