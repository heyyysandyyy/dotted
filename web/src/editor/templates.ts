import * as fabric from 'fabric'

/**
 * A starter template (TPL-003). `build()` returns fresh Fabric objects each call
 * — a Fabric object can only live on one canvas, so previews and real designs
 * each get their own instances.
 *
 * Lives outside components/ so it can import the fabric value (the architecture
 * lint rule blocks that only in components).
 */
export interface StarterTemplate {
  id: string
  name: string
  width: number
  height: number
  background: string
  build: () => fabric.FabricObject[]
}

const centeredText = (text: string, opts: Partial<fabric.Textbox>) =>
  new fabric.Textbox(text, {
    originX: 'center',
    textAlign: 'center',
    fontFamily: 'Arial',
    ...opts,
  })

export const TEMPLATES: StarterTemplate[] = [
  {
    id: 'ig-quote',
    name: 'Quote post',
    width: 1080,
    height: 1080,
    background: '#0f172a',
    build: () => [
      centeredText('“Design is intelligence\nmade visible.”', {
        left: 540,
        top: 420,
        width: 820,
        fontSize: 76,
        fontWeight: 'bold',
        fill: '#f8fafc',
        lineHeight: 1.15,
      }),
      centeredText('— ALINA WHEELER', {
        left: 540,
        top: 700,
        width: 820,
        fontSize: 30,
        fill: '#94a3b8',
      }),
    ],
  },
  {
    id: 'ig-promo',
    name: 'Promo post',
    width: 1080,
    height: 1080,
    background: '#fde047',
    build: () => [
      new fabric.Rect({
        left: 90,
        top: 90,
        width: 900,
        height: 900,
        fill: 'rgba(0,0,0,0)',
        stroke: '#111111',
        strokeWidth: 8,
      }),
      centeredText('BIG\nSALE', {
        left: 540,
        top: 300,
        width: 820,
        fontSize: 200,
        fontWeight: 'bold',
        fill: '#111111',
        lineHeight: 0.95,
      }),
      centeredText('Up to 50% off — this weekend only', {
        left: 540,
        top: 760,
        width: 820,
        fontSize: 36,
        fill: '#111111',
      }),
    ],
  },
  {
    id: 'title-slide',
    name: 'Title slide',
    width: 1920,
    height: 1080,
    background: '#ffffff',
    build: () => [
      new fabric.Rect({ left: 0, top: 0, width: 24, height: 1080, fill: '#4f46e5' }),
      new fabric.Textbox('Presentation title', {
        left: 140,
        top: 420,
        width: 1500,
        fontSize: 110,
        fontWeight: 'bold',
        fill: '#111827',
        fontFamily: 'Arial',
      }),
      new fabric.Textbox('Subtitle or author name', {
        left: 144,
        top: 580,
        width: 1500,
        fontSize: 44,
        fill: '#6b7280',
        fontFamily: 'Arial',
      }),
    ],
  },
  {
    id: 'poster',
    name: 'Event poster',
    width: 1080,
    height: 1350,
    background: '#111827',
    build: () => [
      new fabric.Ellipse({
        left: 540,
        top: 360,
        rx: 280,
        ry: 280,
        originX: 'center',
        originY: 'center',
        fill: '#ec4899',
      }),
      centeredText('LIVE', {
        left: 540,
        top: 320,
        width: 600,
        fontSize: 120,
        fontWeight: 'bold',
        fill: '#ffffff',
      }),
      centeredText('Friday · 8 PM\nThe Warehouse', {
        left: 540,
        top: 820,
        width: 900,
        fontSize: 56,
        fill: '#f9fafb',
        lineHeight: 1.3,
      }),
    ],
  },
]

/**
 * Render a template's content into a read-only StaticCanvas for gallery
 * thumbnails. Returns a disposer for effect cleanup.
 */
export function renderTemplatePreview(el: HTMLCanvasElement, tpl: StarterTemplate): () => void {
  const sc = new fabric.StaticCanvas(el, {
    width: tpl.width,
    height: tpl.height,
    backgroundColor: tpl.background,
  })
  tpl.build().forEach((obj) => sc.add(obj))
  sc.requestRenderAll()
  return () => sc.dispose()
}
