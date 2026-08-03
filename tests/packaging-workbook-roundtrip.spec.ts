import { test, expect } from '@playwright/test'
import * as XLSX from 'xlsx'
import {
  buildPackagingWorkbook,
  workbookFileName,
  type ExportComponent,
  type ExportInput,
} from '../src/lib/packaging/workbook-export'
import {
  PackagingWorkbookError,
  parsePackagingWorkbook,
} from '../src/lib/packaging/workbook-import'
import {
  actionableDiffs,
  diffWorkbook,
  type DbSnapshot,
} from '../src/lib/packaging/workbook-diff'
import { SHEETS } from '../src/lib/packaging/workbook-layout'

/**
 * The round trip is the risky part of the Excel bridge: export → (Google
 * Sheets mangles it) → import must apply exactly the human edits and nothing
 * else. These tests pin the resolution rules.
 */

function component(overrides: Partial<ExportComponent> = {}): ExportComponent {
  return {
    slug: 'Rigid_Box_Lid',
    code: null,
    displayName: 'Rigid box lid',
    description: 'Lid of the rigid box.',
    printed: true,
    includeInCreativeIntent: true,
    pageOrder: 1,
    material: '450gr Simwhite Paper',
    printingMethod: 'Offset',
    coatingMsdsRef: 'Water Based Coating',
    paperThickness: '450 gsm',
    drawingPartNumber: '510-123456',
    approvalStatus: 'Draft',
    engineerNotes: 'Keep the top-right clear.',
    inks: ['Cyan', 'Magenta', 'Yellow', 'Black', 'PANTONE 10101 C'],
    finishes: ['holographic foil'],
    printPartNumber: 'Rigid_Box_Lid__Black_A120_Aphrodite_EVT_160726_ED',
    artworkFileName: 'Rigid_Box_Lid__Black_A120_Aphrodite_EVT_160726_ED.ai',
    mockupFileName: 'Rigid_Box_Lid_Mockup.png',
    packSteps: [],
    ...overrides,
  }
}

function exportInput(components: ExportComponent[]): ExportInput {
  return {
    projectName: 'Aphrodite',
    productType: 'Sleep Mask',
    productFamily: 'Sleep',
    skuCode: 'Black',
    variant: 'Black',
    stage: 'EVT',
    supplier: 'Sample supplier',
    internalRef: 'A120',
    packagingDesigner: 'Anna',
    packagingEngineer: 'Packaging Engineer',
    graphicDesigner: 'Delia',
    artworkDate: new Date(Date.UTC(2026, 6, 16)),
    fileLocationUrl: 'https://drive.google.com/aphrodite',
    overviewFileName: 'Aphrodite_Overview.png',
    notes: 'First EVT handover.',
    components,
    catalogue: [
      { code: null, slug: 'Rigid_Box_Lid', displayName: 'Rigid box lid', description: null, printed: true },
      { code: null, slug: 'Pulp_Tray', displayName: 'Pulp tray', description: null, printed: true },
      { code: null, slug: 'Tissue_Paper', displayName: 'Tissue paper', description: null, printed: false },
    ],
  }
}

function dbSnapshot(components: ExportComponent[]): DbSnapshot {
  return {
    projectName: 'Aphrodite',
    productType: 'Sleep Mask',
    productFamily: 'Sleep',
    supplier: 'Sample supplier',
    internalRef: 'A120',
    packagingDesignerName: 'Anna',
    packagingEngineerName: 'Packaging Engineer',
    graphicDesignerName: 'Delia',
    fileLocationUrl: 'https://drive.google.com/aphrodite',
    notes: 'First EVT handover.',
    stage: 'EVT',
    variant: 'Black',
    skuCode: 'Black',
    artworkDate: new Date(Date.UTC(2026, 6, 16)),
    components: components.map((c) => ({
      slug: c.slug,
      displayName: c.displayName,
      includeInCreativeIntent: c.includeInCreativeIntent,
      pageOrder: c.pageOrder,
      material: c.material,
      printingMethod: c.printingMethod,
      coatingMsdsRef: c.coatingMsdsRef,
      paperThickness: c.paperThickness,
      drawingPartNumber: c.drawingPartNumber,
      approvalStatus: c.approvalStatus,
      engineerNotes: c.engineerNotes,
      packStepCount: c.packSteps.length,
    })),
  }
}

const LIBRARY = ['Rigid_Box_Lid', 'Pulp_Tray', 'Tissue_Paper']

/** Round-trip a workbook, optionally mutating cells the way a human would. */
function roundTrip(
  input: ExportInput,
  mutate?: (wb: XLSX.WorkBook) => void
): ReturnType<typeof parsePackagingWorkbook> {
  const buffer = buildPackagingWorkbook(input)
  const wb = XLSX.read(buffer, { type: 'buffer' })
  mutate?.(wb)
  const rewritten = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer)
  return parsePackagingWorkbook(rewritten, 'Aphrodite_EVT_Creative_Intent_Black.xlsx')
}

function setCell(sheet: XLSX.WorkSheet, addr: string, value: string) {
  sheet[addr] = { t: 's', v: value }
}

// ── Structure ───────────────────────────────────────────────────────────────

test('the export carries the canonical sheets plus one tab per component', () => {
  const buffer = buildPackagingWorkbook(exportInput([component(), component({ slug: 'Pulp_Tray', displayName: 'Pulp tray', pageOrder: 2 })]))
  const wb = XLSX.read(buffer, { type: 'buffer' })
  expect(wb.SheetNames).toEqual([
    SHEETS.readme,
    SHEETS.projectInfo,
    SHEETS.componentsLibrary,
    SHEETS.productSetup,
    'Rigid_Box_Lid',
    'Pulp_Tray',
  ])
})

test('the filename follows Anna\'s convention', () => {
  expect(workbookFileName({ projectName: 'Aphrodite', stage: 'EVT', variant: 'Black' })).toBe(
    'Aphrodite_EVT_Creative_Intent_Black.xlsx'
  )
})

// ── The clean round trip ────────────────────────────────────────────────────

test('export then import with no edits reports nothing to apply', () => {
  const components = [component()]
  const parsed = roundTrip(exportInput(components))
  const diff = diffWorkbook({ parsed, db: dbSnapshot(components), librarySlugs: LIBRARY })

  expect(diff.counts.apply).toBe(0)
  expect(diff.counts['add-component']).toBe(0)
  expect(diff.counts['unknown-component']).toBe(0)
  // Machine fields are present in the sheet, so they are reported as skipped.
  expect(diff.counts['machine-skip']).toBe(3)
})

test('every human field survives the round trip intact', () => {
  const components = [component()]
  const parsed = roundTrip(exportInput(components))
  const c = parsed.components[0]
  expect(c.human).toEqual({
    material: '450gr Simwhite Paper',
    printingMethod: 'Offset',
    coatingMsdsRef: 'Water Based Coating',
    paperThickness: '450 gsm',
    drawingPartNumber: '510-123456',
    approvalStatus: 'Draft',
    engineerNotes: 'Keep the top-right clear.',
  })
  expect(parsed.projectInfo.projectName).toBe('Aphrodite')
  expect(parsed.projectInfo.stage).toBe('EVT')
  expect(parsed.projectInfo.skuColourway).toBe('Black')
  expect(parsed.projectInfo.date?.toISOString().slice(0, 10)).toBe('2026-07-16')
})

// ── Human edits ─────────────────────────────────────────────────────────────

test('editing Material in the sheet applies exactly that one change', () => {
  const components = [component()]
  const parsed = roundTrip(exportInput(components), (wb) => {
    setCell(wb.Sheets['Rigid_Box_Lid'], 'B12', '300gr Kraft')
  })
  const diff = diffWorkbook({ parsed, db: dbSnapshot(components), librarySlugs: LIBRARY })
  const applied = actionableDiffs(diff).filter((d) => d.action === 'apply')
  expect(applied).toHaveLength(1)
  expect(applied[0]).toMatchObject({
    componentSlug: 'Rigid_Box_Lid',
    field: 'Material',
    sheetValue: '300gr Kraft',
    dbValue: '450gr Simwhite Paper',
  })
})

test('hand-edited machine cells are skipped, not applied', () => {
  const components = [component()]
  const parsed = roundTrip(exportInput(components), (wb) => {
    const sheet = wb.Sheets['Rigid_Box_Lid']
    setCell(sheet, 'B11', 'SOMETHING_TYPED_BY_HAND') // Print Part Number
    setCell(sheet, 'B13', 'Cyan, Invented Ink') // Inks / Print
    setCell(sheet, 'B14', 'Invented finish') // Finishes
  })
  const diff = diffWorkbook({ parsed, db: dbSnapshot(components), librarySlugs: LIBRARY })

  const skipped = actionableDiffs(diff).filter((d) => d.action === 'machine-skip')
  expect(skipped.map((d) => d.field).sort()).toEqual([
    'Finishes',
    'Inks / Print',
    'Print Part Number',
  ])
  // Crucially: none of them became an `apply`.
  expect(actionableDiffs(diff).filter((d) => d.action === 'apply')).toHaveLength(0)
})

test('clearing a cell in Sheets does not wipe the stored value', () => {
  const components = [component()]
  const parsed = roundTrip(exportInput(components), (wb) => {
    setCell(wb.Sheets['Rigid_Box_Lid'], 'B12', '') // Material emptied
  })
  const diff = diffWorkbook({ parsed, db: dbSnapshot(components), librarySlugs: LIBRARY })
  const material = diff.components.find((d) => d.field === 'Material')
  expect(material?.action).toBe('unchanged')
  expect(material?.note).toContain('kept the existing value')
})

test('toggling Include? in Product Setup applies', () => {
  const components = [component()]
  const parsed = roundTrip(exportInput(components), (wb) => {
    setCell(wb.Sheets[SHEETS.productSetup], 'E5', 'No')
  })
  const diff = diffWorkbook({ parsed, db: dbSnapshot(components), librarySlugs: LIBRARY })
  const include = diff.components.find((d) => d.field === 'In Creative Intent')
  expect(include).toMatchObject({ action: 'apply', sheetValue: 'No', dbValue: 'Yes' })
})

// ── Google Sheets damage ────────────────────────────────────────────────────

test('a component tab deleted by a Sheets round-trip keeps its specs', () => {
  const components = [component()]
  const parsed = roundTrip(exportInput(components), (wb) => {
    delete wb.Sheets['Rigid_Box_Lid']
    wb.SheetNames = wb.SheetNames.filter((n) => n !== 'Rigid_Box_Lid')
  })
  expect(parsed.components[0].tabMissing).toBe(true)
  expect(parsed.diagnostics.join(' ')).toContain('missing')

  const diff = diffWorkbook({ parsed, db: dbSnapshot(components), librarySlugs: LIBRARY })
  expect(diff.counts['missing-tab-keep']).toBe(1)
  // No spec field is applied for a component whose tab vanished.
  expect(
    diff.components.filter((d) => d.action === 'apply' && d.field === 'Material')
  ).toHaveLength(0)
})

test('the retired "Special Effects" row in a legacy workbook is ignored', () => {
  const components = [component()]
  const parsed = roundTrip(exportInput(components), (wb) => {
    // A legacy sheet carries the retired row; it must not become a spec field.
    setCell(wb.Sheets['Rigid_Box_Lid'], 'A19', 'Special Effects')
    setCell(wb.Sheets['Rigid_Box_Lid'], 'B19', 'Resurrected value')
  })
  const diff = diffWorkbook({ parsed, db: dbSnapshot(components), librarySlugs: LIBRARY })
  expect(actionableDiffs(diff).some((d) => d.field === 'Special Effects')).toBe(false)
})

test('a sheet renamed by case or spacing still resolves', () => {
  const components = [component()]
  const parsed = roundTrip(exportInput(components), (wb) => {
    wb.Sheets['project info'] = wb.Sheets[SHEETS.projectInfo]
    delete wb.Sheets[SHEETS.projectInfo]
    wb.SheetNames = wb.SheetNames.map((n) => (n === SHEETS.projectInfo ? 'project info' : n))
  })
  expect(parsed.projectInfo.projectName).toBe('Aphrodite')
})

test('a .gsheet pointer is rejected with the fix, not a parse error', () => {
  let error: unknown
  try {
    parsePackagingWorkbook(Buffer.from('not a spreadsheet'), 'Aphrodite.gsheet')
  } catch (err) {
    error = err
  }
  expect(error).toBeInstanceOf(PackagingWorkbookError)
  expect((error as PackagingWorkbookError).message).toContain('pointer file')
  expect((error as PackagingWorkbookError).hint).toContain('Download')
})

test('a workbook with no Project Info sheet fails with a usable message', () => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['nothing']]), 'Sheet1')
  const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer)
  expect(() => parsePackagingWorkbook(buffer, 'x.xlsx')).toThrow(/Project Info/)
})

// ── Component set changes ───────────────────────────────────────────────────

test('a component added in the sheet is flagged for adding, not silently applied', () => {
  const onPacket = [component()]
  const inSheet = [component(), component({ slug: 'Pulp_Tray', displayName: 'Pulp tray', pageOrder: 2 })]
  const parsed = roundTrip(exportInput(inSheet))
  const diff = diffWorkbook({ parsed, db: dbSnapshot(onPacket), librarySlugs: LIBRARY })
  expect(diff.newComponentSlugs).toEqual(['Pulp_Tray'])
  expect(diff.counts['add-component']).toBe(1)
})

test('a component not in the library is reported as unknown', () => {
  const inSheet = [component({ slug: 'Invented_Part', displayName: 'Invented part' })]
  const parsed = roundTrip(exportInput(inSheet))
  const diff = diffWorkbook({ parsed, db: dbSnapshot([]), librarySlugs: LIBRARY })
  expect(diff.unknownComponentSlugs).toEqual(['Invented_Part'])
})

test('a packet component missing from the sheet is left alone, never deleted', () => {
  const onPacket = [component(), component({ slug: 'Pulp_Tray', displayName: 'Pulp tray', pageOrder: 2 })]
  const parsed = roundTrip(exportInput([component()]))
  const diff = diffWorkbook({ parsed, db: dbSnapshot(onPacket), librarySlugs: LIBRARY })
  expect(diff.untouchedComponentSlugs).toEqual(['Pulp_Tray'])
})

test('the stage cannot be changed by an import', () => {
  const components = [component()]
  const parsed = roundTrip(exportInput(components), (wb) => {
    setCell(wb.Sheets[SHEETS.projectInfo], 'C13', 'DVT') // Project Stage row
  })
  const diff = diffWorkbook({ parsed, db: dbSnapshot(components), librarySlugs: LIBRARY })
  const stage = diff.packet.find((d) => d.field === 'Project stage')
  expect(stage?.action).toBe('unchanged')
  expect(stage?.note).toContain('cannot be changed by import')
})

// ── Pack instructions ───────────────────────────────────────────────────────

test('pack instruction steps round-trip and renumber sequentially', () => {
  const components = [
    component({
      slug: 'Tissue_Paper',
      displayName: 'Tissue paper',
      printed: false,
      packSteps: [
        { stepNumber: 1, instruction: 'Lay the tissue flat.', imageFileName: 'step1.png' },
        { stepNumber: 2, instruction: 'Hold it in the middle and stick it centred.', imageFileName: null },
      ],
    }),
  ]
  const parsed = roundTrip(exportInput(components))
  expect(parsed.components[0].packSteps).toEqual([
    { stepNumber: 1, instruction: 'Lay the tissue flat.', imageFileName: 'step1.png' },
    { stepNumber: 2, instruction: 'Hold it in the middle and stick it centred.', imageFileName: null },
  ])
})

test('a step typed into a blank row is picked up', () => {
  const components = [component({ packSteps: [] })]
  const parsed = roundTrip(exportInput(components), (wb) => {
    const sheet = wb.Sheets['Rigid_Box_Lid']
    // First blank step row sits under the packing header.
    setCell(sheet, 'B28', 'Fold along the crease before packing.')
  })
  expect(parsed.components[0].packSteps).toEqual([
    { stepNumber: 1, instruction: 'Fold along the crease before packing.', imageFileName: null },
  ])
})

test('a non-printed component exports Printing Method as N/A', () => {
  const buffer = buildPackagingWorkbook(
    exportInput([component({ slug: 'Tissue_Paper', displayName: 'Tissue paper', printed: false, printingMethod: null })])
  )
  const wb = XLSX.read(buffer, { type: 'buffer' })
  expect(wb.Sheets['Tissue_Paper']['B15']?.v).toBe('N/A')
})
