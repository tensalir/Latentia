/**
 * The 200 × 100 mm supplier info box — pure layout.
 *
 * Faithful port of `render_info_overlay_stamp` in Anna's
 * loop-packaging-system/scripts/generate_supplier_pdf.py. This module owns the
 * geometry and emits draw primitives; `supplier-pdf.ts` renders them with
 * pdf-lib. Keeping the maths pdf-lib-free means the layout is unit-testable
 * (box placement, column budgets, chip wrapping) without building a PDF.
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │ loop   PROJECT / PART / DATE      DESIGNER / ENGINEER     [EVT]  │
 *   │ ──────────────────────────────────────────────────────────────── │
 *   │ MATERIAL & PROCESS (2-col)      │ INKS & FINISHES [chips]        │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * Positioned top-RIGHT with a 10 mm margin, sized from each page's own
 * MediaBox — so it lands identically on every sheet size. Artwork must keep
 * the top-right 210 × 110 mm clear (illustrator_setup.md).
 */

/** 1 mm in PDF points. */
export const MM = 2.834645669291339

export const BOX_W_MM = 200
export const BOX_H_MM = 100
export const MARGIN_MM = 10

export const COLORS = {
  ink: '#1A1A1A',
  inkMid: '#6B6B6B',
  body: '#262626',
  line: '#D0D0D0',
  accent: '#C8102E',
  white: '#FFFFFF',
} as const

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export type DrawOp =
  | {
      op: 'rect'
      x: number
      y: number
      width: number
      height: number
      fill?: string
      stroke?: string
      lineWidth?: number
      radius?: number
    }
  | { op: 'line'; x1: number; y1: number; x2: number; y2: number; color: string; lineWidth: number }
  | {
      op: 'text'
      x: number
      y: number
      text: string
      size: number
      bold: boolean
      color: string
      align?: 'left' | 'center' | 'right'
    }

/** Measure rendered text width. Supply `font.widthOfTextAtSize` bound to the
 *  regular/bold face chosen by `bold`. */
export type MeasureText = (text: string, size: number, bold: boolean) => number

export interface InfoBoxData {
  projectName: string
  partName: string
  /** Already formatted DD-MM-YYYY (see `format.ts`). */
  date: string
  packagingDesigner: string
  packagingEngineer: string
  graphicDesigner: string
  stage: string
  material: string
  printingMethod: string
  coatingMsdsRef: string
  skuCode: string
  inks: string[]
  finishes: string[]
  structural: string[]
}

/**
 * Where the box sits on a page of the given size.
 *
 * The margin applies to the edges the box is anchored to — right and top. The
 * left and bottom edges are free to run flush, which is exactly what happens on
 * A4 portrait: 200 mm of box plus a 10 mm right margin is 210 mm, the full
 * sheet width, so the box starts at x ≈ 0. That is Anna's smallest supported
 * sheet and her reportlab version places it the same way.
 *
 * Only a page too small to hold the box at all scales it down, uniformly, so
 * "the box is always fully inside the MediaBox" holds everywhere.
 */
export function computeInfoBoxRect(
  pageWidth: number,
  pageHeight: number
): Rect & { scale: number } {
  const margin = MARGIN_MM * MM
  const wanted = { w: BOX_W_MM * MM, h: BOX_H_MM * MM }
  const availableW = Math.max(0, pageWidth - margin)
  const availableH = Math.max(0, pageHeight - margin)
  // Exact-fit sheets (A4 portrait) land within floating-point noise of 1.0;
  // the epsilon stops that becoming a 0.9999 scale and a hairline resize.
  const EPSILON = 1e-6
  const raw = Math.min(availableW / wanted.w, availableH / wanted.h)
  const scale = raw >= 1 - EPSILON ? 1 : raw
  const width = wanted.w * scale
  const height = wanted.h * scale
  // Anchor top-right; clamp so a degenerate page can't yield a negative origin.
  const x = Math.max(0, pageWidth - width - margin)
  const y = Math.max(0, pageHeight - height - margin)
  return { x, y, width, height, scale }
}

/** Truncate to a pixel budget, appending an ellipsis when it had to cut. */
function fit(text: string, size: number, bold: boolean, maxWidth: number, measure: MeasureText): string {
  if (!text) return ''
  if (maxWidth <= 0) return ''
  if (measure(text, size, bold) <= maxWidth) return text
  let out = text
  while (out.length > 1 && measure(`${out}…`, size, bold) > maxWidth) {
    out = out.slice(0, -1)
  }
  return `${out.trimEnd()}…`
}

function wrap(
  text: string,
  size: number,
  maxWidth: number,
  measure: MeasureText,
  maxLines: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word
    if (measure(trial, size, false) <= maxWidth) {
      line = trial
    } else {
      if (line) lines.push(line)
      line = word
    }
    if (lines.length >= maxLines) break
  }
  if (line && lines.length < maxLines) lines.push(line)
  return lines.length > 0 ? lines.slice(0, maxLines) : ['—']
}

/**
 * Build the complete op list for one page's info box.
 * All coordinates are absolute PDF points on that page (origin bottom-left).
 */
export function layoutInfoBox(args: {
  pageWidth: number
  pageHeight: number
  data: InfoBoxData
  measure: MeasureText
}): { rect: Rect; ops: DrawOp[] } {
  const { data, measure } = args
  const rect = computeInfoBoxRect(args.pageWidth, args.pageHeight)
  const s = rect.scale
  const ops: DrawOp[] = []

  // Background card
  ops.push({
    op: 'rect',
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    fill: COLORS.white,
    stroke: COLORS.ink,
    lineWidth: 0.8 * s,
  })

  const padX = 16 * s
  const padY = 14 * s
  const innerLeft = rect.x + padX
  const innerRight = rect.x + rect.width - padX
  const innerW = rect.width - 2 * padX
  const topY = rect.y + rect.height - padY

  // ── Header ────────────────────────────────────────────────────────────────
  ops.push({
    op: 'text',
    x: innerLeft,
    y: topY - 16 * s,
    text: 'loop',
    size: 22 * s,
    bold: true,
    color: COLORS.ink,
  })

  const headerY = topY - 4 * s
  const colAx = innerLeft + 62 * s
  const colBx = innerLeft + innerW * 0.45
  const labelW = 70 * s
  const rightLabelW = 106 * s
  const badgeW = 56 * s
  const badgeH = 20 * s
  const colAValW = colBx - colAx - labelW - 8 * s
  const colBValW = innerRight - badgeW - 8 * s - (colBx + rightLabelW)

  const kv = (
    x: number,
    y: number,
    label: string,
    value: string,
    lblW: number,
    valW: number
  ) => {
    const size = 8 * s
    ops.push({ op: 'text', x, y, text: label, size, bold: true, color: COLORS.ink })
    ops.push({
      op: 'text',
      x: x + lblW,
      y,
      text: fit(value ?? '', size, false, valW, measure),
      size,
      bold: false,
      color: COLORS.body,
    })
  }

  kv(colAx, headerY - 2 * s, 'PROJECT NAME:', data.projectName, labelW, colAValW)
  kv(colAx, headerY - 16 * s, 'PART NAME:', data.partName, labelW, colAValW)
  kv(colAx, headerY - 30 * s, 'DATE:', data.date, labelW, colAValW)

  kv(colBx, headerY - 2 * s, 'PACKAGING DESIGNER:', data.packagingDesigner, rightLabelW, colBValW)
  kv(colBx, headerY - 16 * s, 'PACKAGING ENGINEER:', data.packagingEngineer, rightLabelW, colBValW)
  kv(colBx, headerY - 30 * s, 'GRAPHIC DESIGNER:', data.graphicDesigner, rightLabelW, colBValW)

  // Stage badge, top-right
  if (data.stage) {
    const bx = innerRight - badgeW
    const by = topY - badgeH
    ops.push({ op: 'rect', x: bx, y: by, width: badgeW, height: badgeH, fill: COLORS.body })
    ops.push({
      op: 'text',
      x: bx + badgeW / 2,
      y: by + 6 * s,
      text: data.stage,
      size: 12 * s,
      bold: true,
      color: COLORS.white,
      align: 'center',
    })
  }

  ops.push({
    op: 'text',
    x: innerRight,
    y: topY - 44 * s,
    text: 'Printing Brief — auto-generated',
    size: 8 * s,
    bold: false,
    color: COLORS.inkMid,
    align: 'right',
  })

  // Separator
  const sepY = topY - 48 * s
  ops.push({
    op: 'line',
    x1: innerLeft,
    y1: sepY,
    x2: innerRight,
    y2: sepY,
    color: COLORS.line,
    lineWidth: 0.5 * s,
  })

  // ── Body: two columns ─────────────────────────────────────────────────────
  const bodyTop = sepY - 12 * s
  const colGap = 24 * s
  const leftColW = (innerW - colGap) * 0.52
  const rightColW = (innerW - colGap) * 0.48
  const rightColX = innerLeft + leftColW + colGap

  ops.push({
    op: 'text',
    x: innerLeft,
    y: bodyTop,
    text: 'MATERIAL & PROCESS',
    size: 10 * s,
    bold: true,
    color: COLORS.accent,
  })

  let y = bodyTop - 16 * s
  const specValueX = innerLeft + 110 * s
  const specValueW = leftColW - 110 * s

  const specRow = (label: string, value: string) => {
    const size = 9 * s
    ops.push({ op: 'text', x: innerLeft, y, text: label, size, bold: true, color: COLORS.ink })
    const lines = wrap(value || '—', size, specValueW, measure, 3)
    lines.forEach((line, i) => {
      ops.push({
        op: 'text',
        x: specValueX,
        y: y - i * 11 * s,
        text: line,
        size,
        bold: false,
        color: COLORS.body,
      })
    })
    y -= Math.max(16 * s, 11 * s * lines.length + 6 * s)
  }

  specRow('MATERIAL:', data.material)
  specRow('METHOD:', data.printingMethod)
  specRow('MSDS:', data.coatingMsdsRef)
  specRow('SKU CODE:', data.skuCode)

  // RIGHT — plate chips, read from the .ai
  ops.push({
    op: 'text',
    x: rightColX,
    y: bodyTop,
    text: 'INKS & FINISHES  (read from AI file)',
    size: 10 * s,
    bold: true,
    color: COLORS.accent,
  })

  let yr = bodyTop - 16 * s

  const chipRow = (title: string, items: string[], color: string) => {
    if (items.length === 0) return
    ops.push({ op: 'text', x: rightColX, y: yr, text: title, size: 9 * s, bold: true, color: COLORS.ink })
    yr -= 20 * s
    let cx = rightColX
    let cy = yr
    const chipSize = 8.5 * s
    for (const item of items) {
      const chipW = measure(item, chipSize, false) + 14 * s
      if (cx > rightColX && cx + chipW > rightColX + rightColW) {
        cx = rightColX
        cy -= 26 * s
      }
      ops.push({
        op: 'rect',
        x: cx,
        y: cy - 4 * s,
        width: chipW,
        height: 16 * s,
        fill: color,
        radius: 4 * s,
      })
      ops.push({
        op: 'text',
        x: cx + 7 * s,
        y: cy + 1 * s,
        text: item,
        size: chipSize,
        bold: false,
        color: COLORS.white,
      })
      cx += chipW + 6 * s
    }
    yr = cy - 22 * s
  }

  chipRow(`Inks (${data.inks.length})`, data.inks, COLORS.ink)
  chipRow(`Special finishes (${data.finishes.length})`, data.finishes, COLORS.accent)
  chipRow(`Structural plates (${data.structural.length})`, data.structural, COLORS.inkMid)

  return { rect, ops }
}
