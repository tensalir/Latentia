import { test, expect } from '@playwright/test'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import {
  CMF_EXPLORER_PALETTE,
  CMF_LEGEND_COLOURS,
  resolveLegendHex,
  resolveSwatchHex,
} from '../src/lib/cmf/clown-legend'
import {
  buildCmfPacketPdf,
  CMF_PDF_GEOMETRY,
  fitHeaderValue,
  planCmfPages,
} from '../src/lib/cmf/pdf'

/**
 * Smoke test for the CMF PDF builder. We don't try to compare visual output —
 * just confirm the build completes, returns a valid PDF magic header, and
 * exercises both the single-SKU and multi-SKU branches.
 */

const SINGLE_RENDER = {
  id: '00000000-0000-0000-0000-000000000001',
  label: 'Switch 2 Sage',
  colorwayName: 'Sage',
  productSlug: 'switch2',
  productCode: 'SW2-SAGE-001',
  ean: '5400000000017',
  componentSpecs: [
    {
      region: 'pom_ring',
      label: 'POM ring',
      pantone: 'PANTONE 17-5641 TCX',
      colorHex: '#7ba47a',
      material: 'POM',
      finish: 'Matte',
    },
  ],
  paletteSwatches: [],
  renderUrl: null,
  enhancedPrompt: null,
  status: 'ready',
}

function pdfHeader(bytes: Uint8Array): string {
  // Avoid spread syntax over Uint8Array so this compiles under the
  // tsconfig target the rest of the repo uses.
  return Buffer.from(bytes.slice(0, 5)).toString('utf8')
}

test('buildCmfPacketPdf returns valid PDF bytes for a single SKU', async () => {
  const pdf = await buildCmfPacketPdf({
    packetName: 'Switch 2 Sage',
    cmfCode: 'CMF-001234revA',
    notes: 'Spring 2026 launch',
    renders: [SINGLE_RENDER as any],
  })
  expect(pdf.length).toBeGreaterThan(500)
  expect(pdfHeader(pdf)).toBe('%PDF-')
})

test('buildCmfPacketPdf returns valid PDF bytes for multi-SKU packets', async () => {
  const renders = [
    SINGLE_RENDER,
    {
      ...SINGLE_RENDER,
      id: '00000000-0000-0000-0000-000000000002',
      label: 'Switch 2 Boreas',
      colorwayName: 'Boreas',
    },
    {
      ...SINGLE_RENDER,
      id: '00000000-0000-0000-0000-000000000003',
      label: 'Switch 2 Aphrodite',
      colorwayName: 'Aphrodite',
    },
  ]
  const pdf = await buildCmfPacketPdf({
    packetName: 'Switch 2 4-Pack',
    cmfCode: 'CMF-001234revA',
    notes: 'Includes shared breakdown page',
    renders: renders as any,
  })
  expect(pdf.length).toBeGreaterThan(500)
  expect(pdfHeader(pdf)).toBe('%PDF-')
})

/* ── Source-template structure (Damien's Loop CMF deck) ─────────────── */

test('buildCmfPacketPdf renders A4 portrait pages, matching the source CMF deck', async () => {
  const pdf = await buildCmfPacketPdf({
    packetName: 'Switch 2 Emerald',
    cmfCode: 'CMF-001234revA',
    notes: null,
    renders: [SINGLE_RENDER as any],
  })
  const doc = await PDFDocument.load(pdf)
  const page = doc.getPage(0)
  const size = page.getSize()
  // A4 portrait: 595 × 842 pt — Damien's source template orientation.
  expect(Math.round(size.width)).toBe(CMF_PDF_GEOMETRY.PAGE_W)
  expect(Math.round(size.height)).toBe(CMF_PDF_GEOMETRY.PAGE_H)
  expect(size.height).toBeGreaterThan(size.width)
})

test('buildCmfPacketPdf single-SKU packet is 2 pages (render + shared part breakdown)', async () => {
  const pdf = await buildCmfPacketPdf({
    packetName: 'Switch 2 Emerald',
    cmfCode: 'CMF-001234revA',
    notes: null,
    renders: [SINGLE_RENDER as any],
  })
  const doc = await PDFDocument.load(pdf)
  expect(doc.getPageCount()).toBe(2)
})

test('buildCmfPacketPdf multi-SKU packet is one render page per SKU + a single breakdown, no pack overview', async () => {
  const renders = [
    SINGLE_RENDER,
    {
      ...SINGLE_RENDER,
      id: '00000000-0000-0000-0000-000000000002',
      label: 'Switch 2 Gold',
      colorwayName: 'Gold',
    },
  ]
  const pdf = await buildCmfPacketPdf({
    packetName: 'Switch 2 Spring 2026',
    cmfCode: 'CMF-001234revA',
    notes: null,
    renders: renders as any,
  })
  const doc = await PDFDocument.load(pdf)
  // 2 render pages + 1 shared part breakdown = 3. The per-SKU breakdown
  // repeats and the trailing pack-overview page were removed on Damien's
  // feedback (2026-07-06).
  expect(doc.getPageCount()).toBe(3)
})

test('buildCmfPacketPdf stays portrait for every page even with many SKUs', async () => {
  const renders = Array.from({ length: 3 }).map((_, i) => ({
    ...SINGLE_RENDER,
    id: `00000000-0000-0000-0000-00000000000${i + 1}`,
    label: `Switch 2 #${i + 1}`,
    colorwayName: `Way ${i + 1}`,
  }))
  const pdf = await buildCmfPacketPdf({
    packetName: 'Switch 2 Trio',
    cmfCode: 'CMF-001234revA',
    notes: null,
    renders: renders as any,
  })
  const doc = await PDFDocument.load(pdf)
  for (let i = 0; i < doc.getPageCount(); i++) {
    const { width, height } = doc.getPage(i).getSize()
    expect(height).toBeGreaterThan(width)
  }
})

/* ── Page plan (render pages first, one shared breakdown last) ──────── */

test('planCmfPages puts a single shared breakdown last for same-product packs', () => {
  const plan = planCmfPages([
    { productSlug: 'switch2' },
    { productSlug: 'switch2' },
    { productSlug: 'switch2' },
  ])
  expect(plan.map((p) => p.type)).toEqual(['render', 'render', 'render', 'breakdown'])
  expect(plan[3].renderIndex).toBe(0)
})

test('planCmfPages sources the breakdown from the first render with a clown', () => {
  const clown = { imageUrl: 'https://example.com/clown.png', label: 'clown', components: [] }
  const plan = planCmfPages([
    { productSlug: 'switch2' },
    { productSlug: 'switch2', clown },
    { productSlug: 'switch2' },
  ])
  expect(plan[plan.length - 1]).toEqual({ type: 'breakdown', renderIndex: 1 })
})

test('planCmfPages emits one breakdown per distinct product, after all render pages', () => {
  const plan = planCmfPages([
    { productSlug: 'switch2' },
    { productSlug: 'case-switch2' },
    { productSlug: 'switch2' },
  ])
  expect(plan.map((p) => p.type)).toEqual([
    'render',
    'render',
    'render',
    'breakdown',
    'breakdown',
  ])
  expect(plan[3].renderIndex).toBe(0) // switch2 breakdown ← its first render
  expect(plan[4].renderIndex).toBe(1) // case-switch2 breakdown ← its first render
})

/* ── Meta header fitting (edit date × SKU name overlap) ─────────────── */

test('fitHeaderValue keeps short values at 9pt untouched', async () => {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fitted = fitHeaderValue('2026-06-30', font, 166)
  expect(fitted).toEqual({ text: '2026-06-30', size: 9 })
})

test('fitHeaderValue never lets a long product·colourway value exceed the cell', async () => {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  // Actual header cell width from the 3×3 grid geometry.
  const cellW = (CMF_PDF_GEOMETRY.PAGE_W - CMF_PDF_GEOMETRY.MARGIN * 2) / 3 - 8
  // The exact value that used to wrap onto the Edit date row below it.
  const value = 'Loop Experience 2 Carry Case · Coachella desert sun'
  const fitted = fitHeaderValue(value, font, cellW)
  expect(font.widthOfTextAtSize(fitted.text, fitted.size)).toBeLessThanOrEqual(cellW)
  expect(fitted.size).toBeLessThanOrEqual(9)
  expect(fitted.size).toBeGreaterThanOrEqual(6.5)
})

test('fitHeaderValue ellipsis-truncates values that cannot shrink to fit', async () => {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const value =
    'An unreasonably long product name that no header cell could ever hold on one line'
  const fitted = fitHeaderValue(value, font, 120)
  expect(fitted.text.endsWith('…')).toBe(true)
  expect(fitted.size).toBe(6.5)
  expect(font.widthOfTextAtSize(fitted.text, fitted.size)).toBeLessThanOrEqual(120)
})

/* ── Clown legend colours (Damien's region markers) ─────────────────── */

test('resolveLegendHex returns canonical Switch 2 legend colours', () => {
  expect(resolveLegendHex({ region: 'pom_ring' })).toBe(CMF_LEGEND_COLOURS.pom_ring)
  expect(resolveLegendHex({ region: 'cosmetic_cap' })).toBe(CMF_LEGEND_COLOURS.cosmetic_cap)
  expect(resolveLegendHex({ region: 'nozzle_piece' })).toBe(CMF_LEGEND_COLOURS.nozzle_piece)
  expect(resolveLegendHex({ region: 'eartip' })).toBe(CMF_LEGEND_COLOURS.eartip)
  expect(resolveLegendHex({ region: 'artwork' })).toBeNull()
})

test('resolveLegendHex prefers per-asset clown metadata over canonical map', () => {
  expect(
    resolveLegendHex(
      { region: 'pom_ring' },
      [{ region: 'pom_ring', label: 'POM ring', colorHex: '#AABBCC' }],
    ),
  ).toBe('#AABBCC')
})

test('resolveLegendHex uses explorer palette for Cocoon when clown has no metadata', () => {
  expect(
    resolveLegendHex(
      { region: 'ear_cushion' },
      [],
      {
        productSlug: 'cocoon',
        catalogRegions: ['ear_cushion', 'foam', 'earcup', 'front_strap', 'velcro_front', 'pouch'],
      },
    ),
  ).toBe(CMF_EXPLORER_PALETTE[0])
})

test('resolveSwatchHex ignores product Pantone when a clown is attached', () => {
  expect(
    resolveSwatchHex(
      { region: 'ear_cushion', colorHex: '#663399' },
      {
        hasClown: true,
        productSlug: 'cocoon',
        catalogRegions: ['ear_cushion', 'foam', 'earcup'],
      },
    ),
  ).toBe(CMF_EXPLORER_PALETTE[0])
  expect(
    resolveSwatchHex(
      { region: 'ear_cushion', colorHex: '#663399' },
      {
        hasClown: false,
        productSlug: 'cocoon',
        catalogRegions: ['ear_cushion', 'foam', 'earcup'],
      },
    ),
  ).toBe('#663399')
})

/* ── Merged clown + part breakdown page ─────────────────────────────── */

// A minimal valid 1×1 PNG so the PDF builder can embed something without
// touching the network.
const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

test('buildCmfPacketPdf keeps 2 pages for a single SKU with a clown (merged layout)', async () => {
  const pdf = await buildCmfPacketPdf({
    packetName: 'Switch 2 Emerald',
    cmfCode: 'CMF-001234revA',
    notes: null,
    renders: [
      {
        ...SINGLE_RENDER,
        clown: {
          imageUrl: TINY_PNG_DATA_URL,
          label: 'Switch 2 default clown',
          components: [
            { region: 'pom_ring', label: 'POM ring', colorHex: '#ff3344' },
            { region: 'cosmetic_cap', label: 'Cosmetic cap', colorHex: '#3366ff' },
          ],
        },
      } as any,
    ],
  })
  const doc = await PDFDocument.load(pdf)
  // CMF spec + Part breakdown (clown + legend merged) = 2 pages.
  expect(doc.getPageCount()).toBe(2)
})

test('buildCmfPacketPdf omits clown band on breakdown when no clown is provided', async () => {
  const pdf = await buildCmfPacketPdf({
    packetName: 'Switch 2 Emerald',
    cmfCode: 'CMF-001234revA',
    notes: null,
    renders: [SINGLE_RENDER as any],
  })
  const doc = await PDFDocument.load(pdf)
  expect(doc.getPageCount()).toBe(2)
})

test('buildCmfPacketPdf multi-SKU packet with clown shares a single breakdown page', async () => {
  const pdf = await buildCmfPacketPdf({
    packetName: 'Switch 2 Spring 2026',
    cmfCode: 'CMF-001234revA',
    notes: null,
    renders: [
      {
        ...SINGLE_RENDER,
        clown: {
          imageUrl: TINY_PNG_DATA_URL,
          label: 'Switch 2 default clown',
          components: [
            { region: 'pom_ring', label: 'POM ring', colorHex: '#ff3344' },
          ],
        },
      },
      {
        ...SINGLE_RENDER,
        id: '00000000-0000-0000-0000-000000000002',
        label: 'Switch 2 Gold',
        colorwayName: 'Gold',
      },
    ] as any,
  })
  const doc = await PDFDocument.load(pdf)
  // 2 render pages + 1 shared breakdown = 3 (no per-SKU breakdown repeats,
  // no pack overview).
  expect(doc.getPageCount()).toBe(3)
})

test('buildCmfPacketPdf three-SKU pack is 4 pages (3 renders + 1 shared breakdown)', async () => {
  const clown = {
    imageUrl: TINY_PNG_DATA_URL,
    label: 'Switch 2 default clown',
    components: [{ region: 'pom_ring', label: 'POM ring', colorHex: '#2BA34D' }],
  }
  const renders = Array.from({ length: 3 }).map((_, i) => ({
    ...SINGLE_RENDER,
    id: `00000000-0000-0000-0000-00000000000${i + 1}`,
    label: `Switch 2 #${i + 1}`,
    colorwayName: `Way ${i + 1}`,
    clown,
  }))
  const pdf = await buildCmfPacketPdf({
    packetName: 'Switch 2 Trio',
    cmfCode: 'CMF-DRAFT',
    notes: null,
    renders: renders as any,
  })
  const doc = await PDFDocument.load(pdf)
  expect(doc.getPageCount()).toBe(4)
})
