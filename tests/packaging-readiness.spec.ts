import { test, expect } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { summarisePacketReadiness } from '../src/lib/packaging/generation'
import {
  buildCreativeIntentPdf,
  type CreativeIntentComponent,
} from '../src/lib/packaging/creative-intent-pdf'
import { buildSupplierPdf } from '../src/lib/packaging/supplier-pdf'
import {
  creativeIntentPdfStoragePath,
  supplierPdfStoragePath,
  versionSuffix,
} from '../src/lib/packaging/storage'
import type { InfoBoxData } from '../src/lib/packaging/info-box'

/**
 * Readiness is advisory, never a gate: "a component in Product Setup with no
 * files is not an error. It's a planned part." These tests pin that, plus the
 * placeholder paths the Creative Intent must survive.
 */

interface FakeArtwork {
  kind: string
  storagePath: string
  aiCompatible: boolean | null
  fileName: string
}

function fakePacket(options: {
  components: Array<{
    id: string
    displayName: string
    printed?: boolean
    included?: boolean
    material?: string | null
    printingMethod?: string | null
    artworks?: FakeArtwork[]
  }>
  overview?: boolean
}) {
  return {
    id: 'packet-1',
    stage: 'EVT',
    variant: 'Black',
    skuCode: 'Black',
    artworkDate: new Date(Date.UTC(2026, 6, 16)),
    updatedAt: new Date(Date.UTC(2026, 6, 16)),
    project: {
      name: 'Aphrodite',
      slug: 'aphrodite',
      packagingDesignerName: 'Anna',
      packagingEngineerName: 'Engineer',
      graphicDesignerName: 'Delia',
    },
    artworks: options.overview
      ? [{ kind: 'overview', storagePath: 'o.png', aiCompatible: null, fileName: 'o.png' }]
      : [],
    components: options.components.map((c) => ({
      id: c.id,
      displayName: c.displayName,
      includeInCreativeIntent: c.included ?? true,
      material: c.material ?? null,
      printingMethod: c.printingMethod ?? null,
      componentType: { printed: c.printed ?? true, slug: c.displayName.replace(/\s/g, '_') },
      artworks: c.artworks ?? [],
      packSteps: [],
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

const AI: FakeArtwork = {
  kind: 'editable_ai',
  storagePath: 'a.ai',
  aiCompatible: true,
  fileName: 'a.ai',
}
const MOCKUP: FakeArtwork = {
  kind: 'mockup',
  storagePath: 'm.png',
  aiCompatible: null,
  fileName: 'm.png',
}

test('generation is never blocked, whatever is missing', () => {
  const readiness = summarisePacketReadiness(
    fakePacket({ components: [{ id: '1', displayName: 'Closure sticker' }] })
  )
  expect(readiness.canGenerate).toBe(true)
})

test('a planned component with no files produces warnings, not errors', () => {
  const readiness = summarisePacketReadiness(
    fakePacket({ components: [{ id: '1', displayName: 'Closure sticker' }] })
  )
  const component = readiness.components[0]
  expect(component.hasArtwork).toBe(false)
  expect(component.expectsSupplierPdf).toBe(true)
  expect(readiness.warnings.join(' ')).toContain('no editable artwork yet')
})

test('a PDF-incompatible file is called out with the fix', () => {
  const readiness = summarisePacketReadiness(
    fakePacket({
      components: [
        { id: '1', displayName: 'Hangtag', artworks: [{ ...AI, aiCompatible: false }] },
      ],
    })
  )
  expect(readiness.components[0].artworkCompatible).toBe(false)
  expect(readiness.warnings.join(' ')).toContain('Create PDF Compatible File')
})

test('a non-printed component expects no supplier PDF but stays in the brief', () => {
  const readiness = summarisePacketReadiness(
    fakePacket({
      components: [{ id: '1', displayName: 'Tissue paper', printed: false, material: 'Tissue' }],
    })
  )
  const component = readiness.components[0]
  expect(component.expectsSupplierPdf).toBe(false)
  expect(component.includedInCreativeIntent).toBe(true)
  // It must not be nagged about a missing printing method it will never have.
  expect(component.missingSpecs).toEqual([])
  expect(readiness.warnings.join(' ')).not.toContain('Tissue paper: no editable artwork')
})

test('missing material and printing method are reported per component', () => {
  const readiness = summarisePacketReadiness(
    fakePacket({ components: [{ id: '1', displayName: 'Pulp tray', artworks: [AI, MOCKUP] }] })
  )
  expect(readiness.components[0].missingSpecs).toEqual(['Material', 'Printing method'])
})

test('a fully prepared packet warns about nothing', () => {
  const readiness = summarisePacketReadiness(
    fakePacket({
      overview: true,
      components: [
        {
          id: '1',
          displayName: 'Pulp tray',
          material: '450gr',
          printingMethod: 'Offset',
          artworks: [AI, MOCKUP],
        },
      ],
    })
  )
  expect(readiness.warnings).toEqual([])
  expect(readiness.hasOverview).toBe(true)
})

// ── Creative Intent placeholders ────────────────────────────────────────────

const BASE_COMPONENT: Omit<CreativeIntentComponent, 'displayName'> = {
  code: null,
  printed: true,
  material: '450gr Simwhite Paper',
  printingMethod: 'Offset',
  coatingMsdsRef: 'Water Based',
  paperThickness: '450 gsm',
  drawingPartNumber: null,
  approvalStatus: 'Draft',
  engineerNotes: null,
  inks: ['Cyan'],
  finishes: [],
  structural: ['DIE CUT'],
  printPartNumber: null,
  mockupBytes: null,
  artworkBytes: null,
  packSteps: [],
}

function ciInput(
  components: Array<Partial<CreativeIntentComponent> & { displayName: string }>
) {
  return {
    projectName: 'Aphrodite',
    productType: 'Sleep Mask',
    supplier: 'Supplier',
    stage: 'EVT',
    variant: 'Black',
    skuCode: 'Black',
    date: '16-07-2026',
    packagingDesigner: 'Anna',
    graphicDesigner: 'Delia',
    packagingEngineer: 'Engineer',
    overviewBytes: null,
    components: components.map((c) => ({ ...BASE_COMPONENT, ...c })),
  }
}

test('the Creative Intent builds with no artwork at all', async () => {
  const bytes = await buildCreativeIntentPdf(ciInput([{ displayName: 'Closure sticker' }]))
  const pdf = await PDFDocument.load(bytes)
  // Overview page + one component page.
  expect(pdf.getPageCount()).toBe(2)
})

test('an unreadable artwork buffer degrades to a placeholder, not a throw', async () => {
  const bytes = await buildCreativeIntentPdf(
    ciInput([
      {
        displayName: 'Hangtag',
        artworkBytes: new Uint8Array([1, 2, 3, 4]), // not a PDF
        mockupBytes: new Uint8Array([9, 9, 9]), // not an image
      },
    ])
  )
  const pdf = await PDFDocument.load(bytes)
  expect(pdf.getPageCount()).toBe(2)
})

/** pdf-lib only writes a content stream once something is drawn, so draw. */
async function multiPageArtwork(pageCount: number, opts: { blankPages?: number } = {}) {
  const source = await PDFDocument.create()
  const blank = opts.blankPages ?? 0
  for (let i = 0; i < pageCount; i++) {
    const page = source.addPage([595, 842])
    if (i >= pageCount - blank) continue // leave the tail genuinely empty
    page.drawRectangle({ x: 40, y: 40, width: 200, height: 120 })
  }
  return source.save()
}

test('a multi-page artwork embeds without inflating the page count', async () => {
  const artworkBytes = await multiPageArtwork(6)
  const bytes = await buildCreativeIntentPdf(
    ciInput([{ displayName: 'Rigid box lid', artworkBytes }])
  )
  const pdf = await PDFDocument.load(bytes)
  // Still one spec page per component, however many sheets the .ai carries.
  expect(pdf.getPageCount()).toBe(2)
})

test('a blank page inside an artwork does not take the document down', async () => {
  // pdf-lib refuses to embed a page with no content stream and only discovers
  // it at save() time. One odd sheet must not cost every other component.
  const artworkBytes = await multiPageArtwork(3, { blankPages: 2 })
  const bytes = await buildCreativeIntentPdf(
    ciInput([{ displayName: 'Rigid box lid', artworkBytes }, { displayName: 'Pulp tray' }])
  )
  const pdf = await PDFDocument.load(bytes)
  expect(pdf.getPageCount()).toBe(3)
})

test('an artwork with no drawable content at all still renders its page', async () => {
  const source = await PDFDocument.create()
  source.addPage([595, 842])
  const bytes = await buildCreativeIntentPdf(
    ciInput([{ displayName: 'Rigid box lid', artworkBytes: await source.save() }])
  )
  const pdf = await PDFDocument.load(bytes)
  expect(pdf.getPageCount()).toBe(2)
})

test('components render in the order they are given', async () => {
  const bytes = await buildCreativeIntentPdf(
    ciInput([
      { displayName: 'First' },
      { displayName: 'Second' },
      { displayName: 'Third' },
    ])
  )
  const pdf = await PDFDocument.load(bytes)
  expect(pdf.getPageCount()).toBe(4)
  expect(pdf.getTitle()).toBe('Aphrodite EVT Creative Intent Black')
})

// ── Supplier PDF edge cases ─────────────────────────────────────────────────

const INFO: InfoBoxData = {
  projectName: 'Aphrodite',
  partName: 'Hangtag',
  date: '16-07-2026',
  packagingDesigner: 'Anna',
  packagingEngineer: 'Engineer',
  graphicDesigner: 'Delia',
  stage: 'EVT',
  material: '450gr',
  printingMethod: 'Offset',
  coatingMsdsRef: 'Water Based',
  skuCode: 'Black',
  inks: [],
  finishes: [],
  structural: ['DIE CUT', 'GLUE AREA', 'CREASE'],
}

test('a many-page artwork keeps its page count exactly', async () => {
  const source = await PDFDocument.create()
  for (let i = 0; i < 12; i++) source.addPage([842, 595])
  const artwork = Buffer.from(await source.save())
  const result = await buildSupplierPdf({ artwork, data: INFO })
  expect(result.pageCount).toBe(12)
  expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(12)
})

test('stamping is idempotent in page count when run twice', async () => {
  const source = await PDFDocument.create()
  source.addPage([842, 595])
  const once = await buildSupplierPdf({ artwork: Buffer.from(await source.save()), data: INFO })
  const twice = await buildSupplierPdf({ artwork: Buffer.from(once.bytes), data: INFO })
  expect(twice.pageCount).toBe(1)
})

test('a non-PDF buffer throws so the caller can record the failure', async () => {
  await expect(buildSupplierPdf({ artwork: Buffer.from('nope'), data: INFO })).rejects.toThrow()
})

// ── Versioned output paths ──────────────────────────────────────────────────

test('generated PDFs are versioned so a shared link keeps working', () => {
  const first = new Date(Date.UTC(2026, 7, 3, 14, 30))
  const second = new Date(Date.UTC(2026, 7, 3, 15, 5))
  const args = {
    projectSlug: 'aphrodite',
    packetId: 'p1',
    componentSlug: 'Pulp_Tray',
    printPartNumber: 'Pulp_Tray_Black_A120',
  }
  const a = supplierPdfStoragePath({ ...args, generatedAt: first })
  const b = supplierPdfStoragePath({ ...args, generatedAt: second })
  expect(a).not.toBe(b)
  expect(a).toContain('supplier_out/')
  expect(versionSuffix(first)).toBe('202608031430')
})

test('the Creative Intent path carries the canonical stem plus a version', () => {
  const path = creativeIntentPdfStoragePath({
    projectSlug: 'aphrodite',
    packetId: 'p1',
    projectName: 'Aphrodite',
    stage: 'EVT',
    variant: 'Black',
    generatedAt: new Date(Date.UTC(2026, 7, 3, 14, 30)),
  })
  expect(path).toContain('Aphrodite_EVT_Creative_Intent_Black')
  expect(path).toMatch(/_202608031430\.pdf$/)
})

test('supplier output never lands outside supplier_out/', () => {
  // The Creative Intent resolves artwork by kind, but the folder convention is
  // Anna's belt-and-braces guard against a stamped file being mistaken for one.
  const path = supplierPdfStoragePath({
    projectSlug: 'aphrodite',
    packetId: 'p1',
    componentSlug: 'Hangtag',
    printPartNumber: null,
  })
  expect(path).toContain('/components/Hangtag/supplier_out/')
})
