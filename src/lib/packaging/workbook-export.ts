/**
 * Export a packet as a Creative Intent workbook.
 *
 * The TypeScript equivalent of Anna's `build_template.py`, but filled from live
 * database state instead of blank. The team keeps working in Google Sheets, so
 * this is one half of the round trip — `workbook-import.ts` reads it back.
 *
 * Machine fields (Print Part Number, Inks / Print, Finishes) ARE written, so
 * the sheet is informative offline, but they come back read-only: the importer
 * ignores them because the .ai is their source of truth.
 */

import * as XLSX from 'xlsx'
import { formatDateEu } from './format'
import {
  ARTWORK_SLOT_LABELS,
  COMPONENT_HEADER_FIELDS,
  COMPONENT_TAB,
  DIMENSION_FIELDS,
  LIBRARY_HEADERS,
  PROJECT_INFO_FIELDS,
  PROJECT_INFO_FIRST_ROW,
  PROJECT_INFO_HEADER_ROW,
  SETUP_HEADERS,
  SHEETS,
  SPEC_FIELDS,
  TABLE_FIRST_COL,
  TABLE_FIRST_ROW,
  TABLE_HEADER_ROW,
} from './workbook-layout'
import type { ComponentStyle } from './catalogue'

export interface ExportComponent {
  slug: string
  code: string | null
  displayName: string
  description: string | null
  printed: boolean
  style: ComponentStyle | string
  includeInCreativeIntent: boolean
  pageOrder: number
  material: string | null
  printingMethod: string | null
  coatingMsdsRef: string | null
  drawingPartNumber: string | null
  approvalStatus: string | null
  engineerNotes: string | null
  pdfPageTitle: string | null
  perProductNotes: string | null
  heightMm: string | null
  widthMm: string | null
  depthMm: string | null
  netWeightG: string | null
  stickerPlacement: string | null
  paperThickness: string | null
  inks: string[]
  finishes: string[]
  printPartNumber: string | null
  artworkFileName: string | null
  /** Back face of a two_face component. */
  artworkBackFileName: string | null
  mockupFileName: string | null
  packSteps: Array<{ stepNumber: number; instruction: string; imageFileName: string | null }>
}

export interface ExportInput {
  projectName: string
  productType: string | null
  productFamily: string | null
  skuCode: string | null
  variant: string
  stage: string
  supplier: string | null
  internalRef: string | null
  packagingDesigner: string | null
  packagingEngineer: string | null
  graphicDesigner: string | null
  artworkDate: Date | string | null
  fileLocationUrl: string | null
  overviewFileName: string | null
  notes: string | null
  components: ExportComponent[]
  /** Full library so the sheet still documents what could be added. */
  catalogue: Array<{
    code: string | null
    slug: string
    displayName: string
    description: string | null
    printed: boolean
    style: ComponentStyle | string
  }>
}

/** Sparse cell writer — mirrors the 1-indexed row/col addressing of the layout. */
function put(sheet: XLSX.WorkSheet, row: number, col: number, value: string | number) {
  const addr = XLSX.utils.encode_cell({ r: row - 1, c: col - 1 })
  sheet[addr] = typeof value === 'number' ? { t: 'n', v: value } : { t: 's', v: value }
}

function finalise(sheet: XLSX.WorkSheet, maxRow: number, maxCol: number) {
  sheet['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: Math.max(maxRow, 1) - 1, c: Math.max(maxCol, 1) - 1 },
  })
}

function styleOf(component: { style: ComponentStyle | string }): keyof typeof ARTWORK_SLOT_LABELS {
  return component.style === 'two_face' ? 'two_face' : 'single_face'
}

function buildReadme(input: ExportInput): XLSX.WorkSheet {
  const lines = [
    ['Loop Packaging — Creative Intent'],
    [`${input.projectName} · ${input.stage} · ${input.variant}`],
    [''],
    ['Exported from Vesper (Packaging Studio). Vesper is the source of truth.'],
    ['Edit the human fields here or in Google Sheets, then re-import to update the packet.'],
    [''],
    ['Read-only on re-import (they are read from the Illustrator file, not typed):'],
    ['  Print Part Number, Inks / Print, Finishes, and the structural plate list.'],
    ['Editing those cells has no effect — the next artwork upload rewrites them.'],
    [''],
    ['Do not rename sheets or reorder the Specifications rows: the importer'],
    ['and the packaging scripts both address them by position.'],
  ]
  return XLSX.utils.aoa_to_sheet(lines)
}

function buildProjectInfo(input: ExportInput): XLSX.WorkSheet {
  const sheet: XLSX.WorkSheet = {}
  put(sheet, 1, 1, 'Project Info')
  put(sheet, PROJECT_INFO_HEADER_ROW, TABLE_FIRST_COL, 'Field')
  put(sheet, PROJECT_INFO_HEADER_ROW, TABLE_FIRST_COL + 1, 'Value')
  put(sheet, PROJECT_INFO_HEADER_ROW, TABLE_FIRST_COL + 2, 'Hint')

  const values: Record<(typeof PROJECT_INFO_FIELDS)[number], string> = {
    'Project Name': input.projectName,
    'Product Type': input.productType ?? '',
    'Product Family': input.productFamily ?? '',
    'SKU / Colourway': input.skuCode ?? input.variant,
    'Packaging Structural Designer': input.packagingDesigner ?? '',
    'Packaging Engineer': input.packagingEngineer ?? '',
    'Graphic Designer': input.graphicDesigner ?? '',
    Date: formatDateEu(input.artworkDate),
    'Project Stage': input.stage,
    Supplier: input.supplier ?? '',
    'Internal Reference': input.internalRef ?? '',
    'Artwork Folder': input.fileLocationUrl ?? '',
    'Packaging Overview Image': input.overviewFileName ?? '',
    Notes: input.notes ?? '',
  }

  let row = PROJECT_INFO_FIRST_ROW
  for (const field of PROJECT_INFO_FIELDS) {
    put(sheet, row, TABLE_FIRST_COL, field)
    put(sheet, row, TABLE_FIRST_COL + 1, values[field])
    row++
  }
  finalise(sheet, row, TABLE_FIRST_COL + 2)
  return sheet
}

function buildComponentsLibrary(input: ExportInput): XLSX.WorkSheet {
  const sheet: XLSX.WorkSheet = {}
  put(sheet, 1, 1, 'Components Library')
  LIBRARY_HEADERS.forEach((header, i) => put(sheet, TABLE_HEADER_ROW, TABLE_FIRST_COL + i, header))

  let row = TABLE_FIRST_ROW
  for (const entry of input.catalogue) {
    put(sheet, row, TABLE_FIRST_COL, entry.code ?? '')
    put(sheet, row, TABLE_FIRST_COL + 1, entry.slug)
    put(sheet, row, TABLE_FIRST_COL + 2, entry.displayName)
    put(sheet, row, TABLE_FIRST_COL + 3, entry.description ?? '')
    put(sheet, row, TABLE_FIRST_COL + 4, styleOf(entry))
    row++
  }
  finalise(sheet, row, TABLE_FIRST_COL + LIBRARY_HEADERS.length)
  return sheet
}

function buildProductSetup(input: ExportInput): XLSX.WorkSheet {
  const sheet: XLSX.WorkSheet = {}
  put(sheet, 1, 1, 'Product Setup')
  SETUP_HEADERS.forEach((header, i) => put(sheet, TABLE_HEADER_ROW, TABLE_FIRST_COL + i, header))

  let row = TABLE_FIRST_ROW
  for (const component of input.components) {
    put(sheet, row, TABLE_FIRST_COL, component.code ?? '')
    put(sheet, row, TABLE_FIRST_COL + 1, component.slug)
    put(sheet, row, TABLE_FIRST_COL + 2, component.displayName)
    put(sheet, row, TABLE_FIRST_COL + 3, component.includeInCreativeIntent ? 'Yes' : 'No')
    put(sheet, row, TABLE_FIRST_COL + 4, component.pageOrder)
    put(
      sheet,
      row,
      TABLE_FIRST_COL + 5,
      component.perProductNotes ?? (component.printed ? '' : 'Not printed')
    )
    row++
  }
  finalise(sheet, row, TABLE_FIRST_COL + SETUP_HEADERS.length)
  return sheet
}

function buildComponentTab(component: ExportComponent): XLSX.WorkSheet {
  const sheet: XLSX.WorkSheet = {}
  const { labelCol: L, valueCol: V } = COMPONENT_TAB

  put(sheet, 1, 1, `${component.displayName} — Component Spec`)
  put(sheet, 3, 1, 'Component header')
  put(sheet, COMPONENT_TAB.displayNameRow, L, 'Display Name')
  put(sheet, COMPONENT_TAB.displayNameRow, V, component.displayName)
  put(sheet, COMPONENT_TAB.descriptionRow, L, 'Description')
  put(sheet, COMPONENT_TAB.descriptionRow, V, component.description ?? '')
  put(sheet, COMPONENT_TAB.pdfPageTitleRow, L, COMPONENT_HEADER_FIELDS.pdfPageTitle)
  put(sheet, COMPONENT_TAB.pdfPageTitleRow, V, component.pdfPageTitle ?? '')

  put(sheet, 8, 1, 'Specifications')
  put(sheet, COMPONENT_TAB.specsHeaderRow, L, 'Field')
  put(sheet, COMPONENT_TAB.specsHeaderRow, V, 'Value')

  const specValues: Record<(typeof SPEC_FIELDS)[number], string> = {
    'Drawing Part Number': component.drawingPartNumber ?? '',
    'Print Part Number': component.printPartNumber ?? '',
    Material: component.material ?? '',
    'Inks / Print': component.inks.join(', '),
    Finishes: component.finishes.join(', '),
    // Retired in favour of Finishes (read from the .ai), but the row stays so
    // the sheet keeps the shape her scripts and team expect.
    'Special Effects': '',
    'Printing Method': component.printed ? component.printingMethod ?? '' : 'N/A',
    'Coating MSDS Ref.': component.coatingMsdsRef ?? '',
    'Approval Status': component.approvalStatus ?? 'Draft',
    Notes: component.engineerNotes ?? '',
  }
  SPEC_FIELDS.forEach((field, i) => {
    const row = COMPONENT_TAB.specsFirstRow + i
    put(sheet, row, L, field)
    put(sheet, row, V, specValues[field])
  })

  // Artwork block at its fixed offset.
  put(sheet, COMPONENT_TAB.artworkSectionRow, 1, 'Artwork files (file name OR full path)')
  COMPONENT_TAB.artworkHeaders.forEach((header, i) =>
    put(sheet, COMPONENT_TAB.artworkHeaderRow, 1 + i, header)
  )
  const slots: Array<[string, string | null]> =
    styleOf(component) === 'two_face'
      ? [
          ['Mockup', component.mockupFileName],
          ['Artwork_Front', component.artworkFileName],
          ['Artwork_Back', component.artworkBackFileName],
        ]
      : [
          ['Mockup', component.mockupFileName],
          ['Artwork', component.artworkFileName],
        ]
  let row = COMPONENT_TAB.artworkFirstRow
  for (const [type, fileName] of slots) {
    put(sheet, row, 1, type)
    put(sheet, row, 2, '')
    put(sheet, row, 3, fileName ?? '')
    row++
  }

  // Packing instructions — always emitted so a step can be added in the sheet.
  row += 1
  put(sheet, row, 1, 'Packing instructions (text + reference image)')
  row += 1
  COMPONENT_TAB.packingHeaders.forEach((header, i) => put(sheet, row, 1 + i, header))
  row += 1
  const steps = component.packSteps.length > 0 ? component.packSteps : []
  const stepRows = Math.max(steps.length, 3) // blank rows invite new steps
  for (let i = 0; i < stepRows; i++) {
    const step = steps[i]
    put(sheet, row, 1, `Step ${step?.stepNumber ?? i + 1}`)
    put(sheet, row, 2, step?.instruction ?? '')
    put(sheet, row, 3, step?.imageFileName ?? '')
    row++
  }

  // Dimensions — free-form label/value, and where paper thickness lives (adding
  // it to Specifications would shift the fixed artwork offset above).
  row += 1
  put(sheet, row, 1, 'Dimensions')
  row += 1
  COMPONENT_TAB.dimensionHeaders.forEach((header, i) => put(sheet, row, 1 + i, header))
  row += 1
  for (const dim of DIMENSION_FIELDS) {
    put(sheet, row, 1, dim.label)
    put(sheet, row, 2, component[dim.field] ?? '')
    row++
  }

  finalise(sheet, row, 5)
  return sheet
}

/** Excel caps sheet names at 31 chars and forbids `[]:*?/\`. */
export function safeSheetName(slug: string): string {
  return slug.replace(/[[\]:*?/\\]/g, '_').slice(0, 31)
}

export function buildPackagingWorkbook(input: ExportInput): Buffer {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, buildReadme(input), SHEETS.readme)
  XLSX.utils.book_append_sheet(wb, buildProjectInfo(input), SHEETS.projectInfo)
  XLSX.utils.book_append_sheet(wb, buildComponentsLibrary(input), SHEETS.componentsLibrary)
  XLSX.utils.book_append_sheet(wb, buildProductSetup(input), SHEETS.productSetup)

  const used = new Set<string>()
  for (const component of input.components) {
    let name = safeSheetName(component.slug)
    // Truncation could collide; disambiguate rather than silently overwrite.
    let n = 2
    while (used.has(name)) name = `${safeSheetName(component.slug).slice(0, 29)}_${n++}`
    used.add(name)
    XLSX.utils.book_append_sheet(wb, buildComponentTab(component), name)
  }

  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer)
}

/** The filename Anna's convention expects. */
export function workbookFileName(input: {
  projectName: string
  stage: string
  variant: string
}): string {
  const clean = (s: string) => s.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return `${clean(input.projectName)}_${clean(input.stage)}_Creative_Intent_${clean(input.variant)}.xlsx`
}
