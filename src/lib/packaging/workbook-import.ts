/**
 * Read a Creative Intent workbook back in.
 *
 * Deliberately tolerant, because these files round-trip through Google Sheets
 * constantly and come back damaged in predictable ways (loop-packaging-system
 * SKILL.md, "Things that bite"):
 *
 *  - `.gsheet` files are pointers, not spreadsheets — detected and reported
 *    with the fix rather than a parse error.
 *  - Floating preview images get mangled; we only ever read cells, so they are
 *    irrelevant by construction.
 *  - Component tabs go missing in a round-trip. A missing tab keeps whatever is
 *    already in the database instead of wiping the component.
 *  - Legacy workbooks resurrect the retired "Special Effects" row; skipped.
 *  - Dates arrive as strings or Excel serials depending on the editor.
 *
 * Machine-owned spec cells are parsed but flagged, never applied: the .ai is
 * their source of truth.
 */

import * as XLSX from 'xlsx'
import { coerceDate } from './format'
import {
  COMPONENT_TAB,
  DIMENSION_FIELDS,
  LEGACY_SPEC_FIELDS,
  MACHINE_SPEC_FIELDS,
  PROJECT_INFO_ALIASES,
  PROJECT_INFO_FIRST_ROW,
  PROJECT_INFO_LABEL_COL,
  PROJECT_INFO_VALUE_COL,
  SHEETS,
  TABLE_FIRST_COL,
  TABLE_FIRST_ROW,
} from './workbook-layout'

export class PackagingWorkbookError extends Error {
  readonly hint?: string
  constructor(message: string, hint?: string) {
    super(message)
    this.name = 'PackagingWorkbookError'
    this.hint = hint
  }
}

export interface ParsedPackStep {
  stepNumber: number
  instruction: string
  imageFileName: string | null
}

export interface ParsedComponent {
  slug: string
  displayName: string
  includeInCreativeIntent: boolean
  pageOrder: number
  /** Human-owned values, keyed by our DB field names. */
  human: {
    material: string | null
    printingMethod: string | null
    coatingMsdsRef: string | null
    drawingPartNumber: string | null
    approvalStatus: string | null
    engineerNotes: string | null
    pdfPageTitle: string | null
    perProductNotes: string | null
    // Dimensions block (free text — see DIMENSION_FIELDS).
    heightMm: string | null
    widthMm: string | null
    depthMm: string | null
    netWeightG: string | null
    stickerPlacement: string | null
    paperThickness: string | null
  }
  /** Machine-owned values found in the sheet — reported, never applied. */
  machineFound: Record<string, string>
  packSteps: ParsedPackStep[]
  /** True when Product Setup listed it but the tab was gone. */
  tabMissing: boolean
}

export interface ParsedWorkbook {
  projectInfo: {
    projectName: string | null
    productType: string | null
    productFamily: string | null
    skuColourway: string | null
    packagingDesigner: string | null
    packagingEngineer: string | null
    graphicDesigner: string | null
    date: Date | null
    stage: string | null
    supplier: string | null
    internalRef: string | null
    artworkFolder: string | null
    overviewImageName: string | null
    notes: string | null
  }
  components: ParsedComponent[]
  diagnostics: string[]
}

const MAX_SCAN_ROW = 500

function cellStr(sheet: XLSX.WorkSheet, row: number, col: number): string {
  const addr = XLSX.utils.encode_cell({ r: row - 1, c: col - 1 })
  const cell = sheet[addr]
  if (!cell || cell.v == null) return ''
  return String(cell.v).trim()
}

function cellRaw(sheet: XLSX.WorkSheet, row: number, col: number): unknown {
  const addr = XLSX.utils.encode_cell({ r: row - 1, c: col - 1 })
  return sheet[addr]?.v ?? null
}

function blank(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** Sheets renames tabs subtly (case, spaces); match forgivingly. */
function findSheet(wb: XLSX.WorkBook, wanted: string): XLSX.WorkSheet | null {
  const exact = wb.Sheets[wanted]
  if (exact) return exact
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const match = wb.SheetNames.find((name) => norm(name) === norm(wanted))
  return match ? wb.Sheets[match] : null
}

function readProjectInfo(sheet: XLSX.WorkSheet): Record<string, { text: string; raw: unknown }> {
  const info: Record<string, { text: string; raw: unknown }> = {}
  for (let r = PROJECT_INFO_FIRST_ROW; r <= 120; r++) {
    const label = cellStr(sheet, r, PROJECT_INFO_LABEL_COL)
    if (!label) continue
    info[label] = {
      text: cellStr(sheet, r, PROJECT_INFO_VALUE_COL),
      raw: cellRaw(sheet, r, PROJECT_INFO_VALUE_COL),
    }
  }
  return info
}

interface SetupRow {
  slug: string
  displayName: string
  include: boolean
  order: number
  /** Product Setup's "Per-product notes" column. */
  perProductNotes: string | null
}

function readProductSetup(sheet: XLSX.WorkSheet): SetupRow[] {
  const rows: SetupRow[] = []
  for (let r = TABLE_FIRST_ROW; r <= 300; r++) {
    const slug = cellStr(sheet, r, TABLE_FIRST_COL + 1)
    if (!slug) continue
    const display = cellStr(sheet, r, TABLE_FIRST_COL + 2)
    const includeCell = cellStr(sheet, r, TABLE_FIRST_COL + 3).toLowerCase()
    const orderRaw = cellStr(sheet, r, TABLE_FIRST_COL + 4)
    const parsed = Number.parseInt(orderRaw, 10)
    rows.push({
      slug,
      displayName: display || slug,
      // Anything other than an explicit "no" counts as included — a cleared
      // cell after a Sheets edit shouldn't silently drop a component.
      include: includeCell !== 'no' && includeCell !== 'false' && includeCell !== '0',
      order: Number.isNaN(parsed) ? 9999 : parsed,
      perProductNotes: blank(cellStr(sheet, r, TABLE_FIRST_COL + 5)),
    })
  }
  return rows.sort((a, b) => a.order - b.order)
}

/** Find a section band by title prefix; returns its row, or null. */
function findSection(sheet: XLSX.WorkSheet, prefix: string): number | null {
  for (let r = 1; r <= MAX_SCAN_ROW; r++) {
    if (cellStr(sheet, r, 1).startsWith(prefix)) return r
  }
  return null
}

function readComponentTab(
  sheet: XLSX.WorkSheet,
  setup: SetupRow,
  diagnostics: string[]
): ParsedComponent {
  const { labelCol: L, valueCol: V } = COMPONENT_TAB
  const specs: Record<string, string> = {}
  const legacyValues: Record<string, string> = {}

  // Read the specification list by LABEL rather than fixed row, so a sheet
  // whose rows shifted still yields the right values.
  const artworkSection = findSection(sheet, COMPONENT_TAB.sections.artwork)
  const specEnd = artworkSection ? artworkSection - 1 : COMPONENT_TAB.specsFirstRow + 40
  for (let r = COMPONENT_TAB.specsFirstRow; r <= specEnd; r++) {
    const label = cellStr(sheet, r, L)
    if (!label) continue
    if ((LEGACY_SPEC_FIELDS as readonly string[]).includes(label)) {
      // Retired field: never stored, but say so rather than dropping a typed
      // value in silence.
      const v = blank(cellStr(sheet, r, V))
      if (v) legacyValues[label] = v
      continue
    }
    specs[label] = cellStr(sheet, r, V)
  }
  for (const [label, value] of Object.entries(legacyValues)) {
    diagnostics.push(
      `${setup.slug}: "${label}" is retired — special finishes are read from the artwork file, so that value was not imported (${value.length > 40 ? value.slice(0, 40) + '…' : value}).`
    )
  }

  const machineFound: Record<string, string> = {}
  for (const field of MACHINE_SPEC_FIELDS) {
    const value = blank(specs[field] ?? '')
    if (value) machineFound[field] = value
  }

  // Component header rows above Specifications.
  const pdfPageTitle = blank(cellStr(sheet, COMPONENT_TAB.pdfPageTitleRow, V))

  // Dimensions block — label/value pairs, matched case-insensitively so a
  // hand-retyped "height (mm)" still lands.
  const dims: Record<string, string | null> = {}
  const dimSection = findSection(sheet, COMPONENT_TAB.sections.dimensions)
  if (dimSection) {
    for (let r = dimSection + 1; r <= dimSection + 20; r++) {
      const label = cellStr(sheet, r, 1)
      if (!label) continue
      const match = DIMENSION_FIELDS.find(
        (d) => d.label.toLowerCase() === label.toLowerCase()
      )
      if (match) dims[match.field] = blank(cellStr(sheet, r, 2))
    }
  }

  // Packing instructions.
  const packSteps: ParsedPackStep[] = []
  const packSection = findSection(sheet, COMPONENT_TAB.sections.packing)
  if (packSection) {
    const stop = dimSection && dimSection > packSection ? dimSection : MAX_SCAN_ROW
    let n = 0
    for (let r = packSection + 2; r < stop; r++) {
      const instruction = blank(cellStr(sheet, r, 2))
      const imageFileName = blank(cellStr(sheet, r, 3))
      if (!instruction) continue
      n += 1
      packSteps.push({ stepNumber: n, instruction, imageFileName })
    }
  }

  return {
    slug: setup.slug,
    displayName: setup.displayName,
    includeInCreativeIntent: setup.include,
    pageOrder: setup.order,
    human: {
      material: blank(specs['Material'] ?? ''),
      printingMethod: blank(specs['Printing Method'] ?? ''),
      coatingMsdsRef: blank(specs['Coating MSDS Ref.'] ?? ''),
      drawingPartNumber: blank(specs['Drawing Part Number'] ?? ''),
      approvalStatus: blank(specs['Approval Status'] ?? ''),
      engineerNotes: blank(specs['Notes'] ?? ''),
      pdfPageTitle,
      perProductNotes: setup.perProductNotes,
      heightMm: dims.heightMm ?? null,
      widthMm: dims.widthMm ?? null,
      depthMm: dims.depthMm ?? null,
      netWeightG: dims.netWeightG ?? null,
      stickerPlacement: dims.stickerPlacement ?? null,
      paperThickness: dims.paperThickness ?? null,
    },
    machineFound,
    packSteps,
    tabMissing: false,
  }
}

export function parsePackagingWorkbook(buffer: Buffer, fileName?: string): ParsedWorkbook {
  if (fileName && fileName.toLowerCase().endsWith('.gsheet')) {
    throw new PackagingWorkbookError(
      'That is a Google Sheets pointer file, not a spreadsheet — it has no data inside.',
      'In Google Sheets choose File → Download → Microsoft Excel (.xlsx) and upload that.'
    )
  }

  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  } catch {
    throw new PackagingWorkbookError(
      'Could not read that file as a workbook.',
      'Make sure it is a real .xlsx export, not a .gsheet pointer or a CSV.'
    )
  }

  const diagnostics: string[] = []

  const projectSheet = findSheet(wb, SHEETS.projectInfo)
  if (!projectSheet) {
    throw new PackagingWorkbookError(
      `The workbook has no "${SHEETS.projectInfo}" sheet.`,
      'Export a fresh workbook from the packet and edit that copy.'
    )
  }
  const info = readProjectInfo(projectSheet)
  /** Reads a field by its current label, falling back to older labels. */
  const get = (field: string) => {
    for (const label of PROJECT_INFO_ALIASES[field] ?? [field]) {
      const v = blank(info[label]?.text ?? '')
      if (v) return v
    }
    return null
  }

  const rawDate = info['Date']?.raw
  const date = coerceDate(
    typeof rawDate === 'number' ? rawDate : (info['Date']?.text ?? null)
  )
  if (info['Date']?.text && !date) {
    diagnostics.push(`Could not read the Date value "${info['Date'].text}" — left unchanged.`)
  }

  const setupSheet = findSheet(wb, SHEETS.productSetup)
  if (!setupSheet) {
    throw new PackagingWorkbookError(
      `The workbook has no "${SHEETS.productSetup}" sheet.`,
      'That sheet lists which components are in the pack; without it there is nothing to apply.'
    )
  }
  const setup = readProductSetup(setupSheet)
  if (setup.length === 0) {
    diagnostics.push('Product Setup is empty — no component changes will be applied.')
  }

  const components: ParsedComponent[] = []
  for (const row of setup) {
    const sheet = findSheet(wb, row.slug)
    if (!sheet) {
      // Lost in a Sheets round-trip. Keep the row so include/order still apply,
      // but mark it so the importer leaves its specs alone.
      diagnostics.push(`Tab "${row.slug}" is missing — its specs were left unchanged.`)
      components.push({
        slug: row.slug,
        displayName: row.displayName,
        includeInCreativeIntent: row.include,
        pageOrder: row.order,
        human: {
          material: null,
          printingMethod: null,
          coatingMsdsRef: null,
          drawingPartNumber: null,
          approvalStatus: null,
          engineerNotes: null,
          pdfPageTitle: null,
          // Product Setup survived even though the tab didn't, so its column
          // is still readable.
          perProductNotes: row.perProductNotes,
          heightMm: null,
          widthMm: null,
          depthMm: null,
          netWeightG: null,
          stickerPlacement: null,
          paperThickness: null,
        },
        machineFound: {},
        packSteps: [],
        tabMissing: true,
      })
      continue
    }
    components.push(readComponentTab(sheet, row, diagnostics))
  }

  return {
    projectInfo: {
      projectName: get('Project Name'),
      productType: get('Product Type'),
      productFamily: get('Product Family'),
      skuColourway: get('SKU / Colourway'),
      // Her live label; the alias map also accepts the older
      // "Packaging Designer" from build_template.py.
      packagingDesigner: get('Packaging Structural Designer'),
      packagingEngineer: get('Packaging Engineer'),
      graphicDesigner: get('Graphic Designer'),
      date,
      stage: get('Project Stage')?.toUpperCase() ?? null,
      supplier: get('Supplier'),
      internalRef: get('Internal Reference'),
      artworkFolder: get('Artwork Folder'),
      overviewImageName: get('Packaging Overview Image'),
      notes: get('Notes'),
    },
    components,
    diagnostics,
  }
}
