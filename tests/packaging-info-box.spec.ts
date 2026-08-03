import { test, expect } from '@playwright/test'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import {
  BOX_H_MM,
  BOX_W_MM,
  MARGIN_MM,
  MM,
  computeInfoBoxRect,
  layoutInfoBox,
  type InfoBoxData,
} from '../src/lib/packaging/info-box'
import { buildSupplierPdf } from '../src/lib/packaging/supplier-pdf'
import { coerceDate, formatDateEu, toWinAnsiSafe } from '../src/lib/packaging/format'

// Exact A4 in points — 210×297 mm. Rounded values (595.28) would hide the
// exact-fit edge case this suite is meant to pin down.
const A4_PORTRAIT = { w: 210 * MM, h: 297 * MM }
const A4_LANDSCAPE = { w: 297 * MM, h: 210 * MM }

const DATA: InfoBoxData = {
  projectName: 'Aphrodite',
  partName: 'Rigid box lid',
  date: '16-07-2026',
  packagingDesigner: 'Anna',
  packagingEngineer: 'Engineer',
  graphicDesigner: 'Delia',
  stage: 'EVT',
  material: '450gr Simwhite Paper',
  printingMethod: 'Offset',
  coatingMsdsRef: 'Water Based Coating',
  skuCode: 'Black',
  inks: ['Cyan', 'Magenta', 'Yellow', 'Black', 'Warm Black 2', 'PANTONE 10101 C'],
  finishes: ['holographic foil'],
  structural: ['DIE CUT', 'CREASE'],
}

/** Rough monospace-ish stand-in so layout maths can be tested without a font. */
const measure = (text: string, size: number) => text.length * size * 0.5

test('the box is 200x100mm at a 10mm margin on a large sheet', () => {
  const rect = computeInfoBoxRect(1000 * MM, 700 * MM)
  expect(rect.scale).toBe(1)
  expect(rect.width).toBeCloseTo(BOX_W_MM * MM, 3)
  expect(rect.height).toBeCloseTo(BOX_H_MM * MM, 3)
  // Top-right: margin off the right and top edges.
  expect(rect.x).toBeCloseTo(1000 * MM - BOX_W_MM * MM - MARGIN_MM * MM, 3)
  expect(rect.y).toBeCloseTo(700 * MM - BOX_H_MM * MM - MARGIN_MM * MM, 3)
})

test("A4 portrait — Anna's smallest sheet — fits unscaled, flush left", () => {
  // 200mm box + 10mm right margin == 210mm sheet, so the box runs edge to edge
  // horizontally. Matches her reportlab placement exactly.
  const rect = computeInfoBoxRect(A4_PORTRAIT.w, A4_PORTRAIT.h)
  expect(rect.scale).toBe(1)
  expect(rect.x).toBeCloseTo(0, 3)
  expect(rect.x + rect.width).toBeLessThanOrEqual(A4_PORTRAIT.w + 0.01)
  expect(rect.y + rect.height).toBeLessThanOrEqual(A4_PORTRAIT.h + 0.01)
  // Top margin is still honoured.
  expect(A4_PORTRAIT.h - (rect.y + rect.height)).toBeCloseTo(MARGIN_MM * MM, 3)
})

test('the box never leaves the MediaBox, at any page size', () => {
  const sizes = [
    A4_PORTRAIT,
    A4_LANDSCAPE,
    { w: 1000 * MM, h: 700 * MM },
    { w: 210 * MM, h: 297 * MM },
    { w: 100 * MM, h: 60 * MM }, // smaller than the box: must scale down
    { w: 40 * MM, h: 40 * MM }, // absurdly small sticker sheet
  ]
  for (const size of sizes) {
    const rect = computeInfoBoxRect(size.w, size.h)
    expect(rect.x, `x >= 0 at ${size.w}x${size.h}`).toBeGreaterThanOrEqual(0)
    expect(rect.y, `y >= 0 at ${size.w}x${size.h}`).toBeGreaterThanOrEqual(0)
    expect(rect.x + rect.width, `right edge at ${size.w}x${size.h}`).toBeLessThanOrEqual(size.w + 0.01)
    expect(rect.y + rect.height, `top edge at ${size.w}x${size.h}`).toBeLessThanOrEqual(size.h + 0.01)
  }
})

test('a page smaller than the box scales it down instead of overflowing', () => {
  const rect = computeInfoBoxRect(100 * MM, 60 * MM)
  expect(rect.scale).toBeLessThan(1)
  // Fits within the sheet minus the right margin, and keeps the 2:1 aspect.
  expect(rect.width).toBeLessThanOrEqual(90 * MM + 0.01)
  expect(rect.width / rect.height).toBeCloseTo(BOX_W_MM / BOX_H_MM, 6)
})

test('every drawn op stays inside the box bounds', () => {
  const { rect, ops } = layoutInfoBox({
    pageWidth: A4_LANDSCAPE.w,
    pageHeight: A4_LANDSCAPE.h,
    data: DATA,
    measure,
  })
  const rects = ops.filter((op) => op.op === 'rect')
  // The first rect is the card itself; every later rect (badge, chips) must
  // sit within it, or the box has visually burst.
  for (const op of rects.slice(1)) {
    if (op.op !== 'rect') continue
    expect(op.x).toBeGreaterThanOrEqual(rect.x - 0.01)
    expect(op.x + op.width).toBeLessThanOrEqual(rect.x + rect.width + 0.01)
    expect(op.y).toBeGreaterThanOrEqual(rect.y - 0.01)
    expect(op.y + op.height).toBeLessThanOrEqual(rect.y + rect.height + 0.01)
  }
})

test('chips wrap rather than run off the right column', () => {
  const wide: InfoBoxData = {
    ...DATA,
    inks: Array.from({ length: 12 }, (_, i) => `PANTONE ${1000 + i} C`),
  }
  const { rect, ops } = layoutInfoBox({
    pageWidth: A4_LANDSCAPE.w,
    pageHeight: A4_LANDSCAPE.h,
    data: wide,
    measure,
  })
  const chips = ops.filter((op) => op.op === 'rect').slice(1)
  expect(chips.length).toBeGreaterThan(10)
  for (const chip of chips) {
    if (chip.op !== 'rect') continue
    expect(chip.x + chip.width).toBeLessThanOrEqual(rect.x + rect.width + 0.01)
  }
  // Wrapping means more than one distinct y — a single row would mean overflow.
  const rows = new Set(chips.map((c) => (c.op === 'rect' ? Math.round(c.y) : 0)))
  expect(rows.size).toBeGreaterThan(1)
})

test('empty plate groups draw no chips and no group heading', () => {
  const { ops } = layoutInfoBox({
    pageWidth: A4_LANDSCAPE.w,
    pageHeight: A4_LANDSCAPE.h,
    data: { ...DATA, inks: [], finishes: [], structural: [] },
    measure,
  })
  expect(ops.some((op) => op.op === 'text' && op.text.startsWith('Inks ('))).toBe(false)
})

test('the header carries the three designer roles and no approval field', () => {
  const { ops } = layoutInfoBox({
    pageWidth: A4_LANDSCAPE.w,
    pageHeight: A4_LANDSCAPE.h,
    data: DATA,
    measure,
  })
  const labels = ops.filter((op) => op.op === 'text').map((op) => (op.op === 'text' ? op.text : ''))
  expect(labels).toContain('PACKAGING DESIGNER:')
  expect(labels).toContain('PACKAGING ENGINEER:')
  expect(labels).toContain('GRAPHIC DESIGNER:')
  expect(labels.some((l) => l.toUpperCase().includes('APPROVAL'))).toBe(false)
})

// ── Date formatting ─────────────────────────────────────────────────────────

test('dates render European with no time component', () => {
  expect(formatDateEu(new Date(Date.UTC(2026, 7, 3)))).toBe('03-08-2026')
  expect(formatDateEu('2026-08-03')).toBe('03-08-2026')
  expect(formatDateEu('03-08-2026')).toBe('03-08-2026')
  expect(formatDateEu('03/08/2026')).toBe('03-08-2026')
})

test('Excel serial dates survive a Google Sheets round-trip', () => {
  // 46237 = 2026-08-03 in the Excel serial epoch.
  expect(formatDateEu(46237)).toBe('03-08-2026')
})

test('unparseable dates render blank, never Invalid Date or 00:00:00', () => {
  for (const value of [null, undefined, '', '   ', 'not a date', 0]) {
    expect(formatDateEu(value as never)).toBe('')
  }
  expect(coerceDate('nonsense')).toBeNull()
})

test('exotic glyphs degrade to ? instead of breaking the PDF font', () => {
  expect(toWinAnsiSafe('UV GLOSS')).toBe('UV GLOSS')
  expect(toWinAnsiSafe('PANTONE 松 C')).toBe('PANTONE ? C')
  expect(toWinAnsiSafe('line\nbreak')).toBe('line break')
})

test('WinAnsi punctuation survives — em dashes are not mangled to ?', () => {
  // The box copy and the "—" empty-value placeholder both rely on these.
  expect(toWinAnsiSafe('Printing Brief — auto-generated')).toBe('Printing Brief — auto-generated')
  expect(toWinAnsiSafe('—')).toBe('—')
  expect(toWinAnsiSafe('“curly” ‘quotes’ • bullet … ellipsis – en')).toBe(
    '“curly” ‘quotes’ • bullet … ellipsis – en'
  )
  expect(toWinAnsiSafe('naïve café Ürün')).toBe('naïve café Ürün')
})

// ── End-to-end overlay ──────────────────────────────────────────────────────

test('the overlay preserves page count and produces a valid PDF', async () => {
  const source = await PDFDocument.create()
  source.addPage([A4_LANDSCAPE.w, A4_LANDSCAPE.h])
  source.addPage([A4_PORTRAIT.w, A4_PORTRAIT.h]) // mixed sizes in one file
  const artwork = Buffer.from(await source.save())

  const result = await buildSupplierPdf({ artwork, data: DATA })

  expect(result.pageCount).toBe(2)
  expect(Buffer.from(result.bytes.slice(0, 5)).toString()).toBe('%PDF-')
  expect(result.bytes.byteLength).toBeGreaterThan(artwork.byteLength)

  // The box lands on every page, sized from that page's own MediaBox.
  const out = await PDFDocument.load(result.bytes)
  expect(out.getPageCount()).toBe(2)
})

test('a Helvetica measurer agrees the box fits real text', async () => {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const { rect, ops } = layoutInfoBox({
    pageWidth: A4_LANDSCAPE.w,
    pageHeight: A4_LANDSCAPE.h,
    data: DATA,
    measure: (text, size) => font.widthOfTextAtSize(text, size),
  })
  for (const op of ops) {
    if (op.op !== 'text' || op.align) continue
    const width = font.widthOfTextAtSize(op.text, op.size)
    expect(op.x + width, `"${op.text}" overflows the box`).toBeLessThanOrEqual(
      rect.x + rect.width + 1
    )
  }
})
