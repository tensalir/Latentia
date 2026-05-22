/**
 * Server-side parser for Loop Packaging Creative Intent workbooks.
 * Cell layout mirrors loop-packaging-system/scripts/generate_creative_intent_pdf.py
 */

import * as XLSX from 'xlsx'
import type { ComponentStyle } from './components'

export class PackagingXlsxParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PackagingXlsxParseError'
  }
}

export interface ParsedArtworkSlot {
  artworkType: string
  caption?: string
  fileName?: string
}

export interface ParsedPackingStep {
  step?: string
  instruction: string
  fileName?: string
}

export interface ParsedPackagingComponent {
  tabName: string
  displayName: string
  style: ComponentStyle
  pageOrder: number
  included: boolean
  specs: Record<string, string>
  packingSteps: ParsedPackingStep[]
  dimensions: Record<string, string>
  artworks: ParsedArtworkSlot[]
}

export interface ParsedPackagingWorkbook {
  projectInfo: Record<string, string>
  components: ParsedPackagingComponent[]
  missingSheets: string[]
}

function cellStr(sheet: XLSX.WorkSheet, row: number, col: number): string {
  const addr = XLSX.utils.encode_cell({ r: row - 1, c: col - 1 })
  const cell = sheet[addr]
  if (!cell || cell.v == null) return ''
  return String(cell.v).trim()
}

function readProjectInfo(sheet: XLSX.WorkSheet): Record<string, string> {
  const info: Record<string, string> = {}
  for (let r = 5; r <= 80; r++) {
    const label = cellStr(sheet, r, 2)
    if (!label) continue
    info[label] = cellStr(sheet, r, 3)
  }
  return info
}

function readComponentsLibrary(wb: XLSX.WorkBook): Record<string, ComponentStyle> {
  const styles: Record<string, ComponentStyle> = {}
  const sheet = wb.Sheets['Components Library']
  if (!sheet) return styles
  for (let r = 5; r <= 200; r++) {
    const tab = cellStr(sheet, r, 3)
    const style = cellStr(sheet, r, 6)
    if (tab && (style === 'two_face' || style === 'single_face')) {
      styles[tab] = style
    }
  }
  return styles
}

function readProductSetup(wb: XLSX.WorkBook): Array<{
  tabName: string
  display: string
  include: boolean
  order: number
}> {
  const sheet = wb.Sheets['Product Setup']
  if (!sheet) return []
  const rows: Array<{ tabName: string; display: string; include: boolean; order: number }> = []
  for (let r = 5; r <= 200; r++) {
    const tab = cellStr(sheet, r, 3)
    const display = cellStr(sheet, r, 4)
    const include = cellStr(sheet, r, 5).toLowerCase() === 'yes'
    const orderRaw = cellStr(sheet, r, 6)
    let order = 9999
    if (orderRaw) {
      const n = parseInt(orderRaw, 10)
      if (!Number.isNaN(n)) order = n
    }
    if (tab) rows.push({ tabName: tab, display, include, order })
  }
  return rows
}

function findBlockEnd(sheet: XLSX.WorkSheet, startRow: number): number {
  let count = 0
  let r = startRow + 1
  while (r <= 500) {
    const a = cellStr(sheet, r, 1)
    if (
      a.startsWith('Packing instructions') ||
      a.startsWith('Dimensions') ||
      a.startsWith('Artwork files')
    ) {
      break
    }
    if (!a && !cellStr(sheet, r, 2) && !cellStr(sheet, r, 3)) {
      const r2 = r + 1
      if (r2 > 500 || !cellStr(sheet, r2, 1)) break
    }
    count++
    r++
  }
  return count
}

function findBlockStart(sheet: XLSX.WorkSheet, keyword: string): number | null {
  for (let r = 1; r <= 500; r++) {
    if (cellStr(sheet, r, 1).startsWith(keyword)) return r + 1
  }
  return null
}

function readComponentTab(
  sheet: XLSX.WorkSheet,
  tabName: string,
  displayName: string,
  style: ComponentStyle
): ParsedPackagingComponent {
  const specs: Record<string, string> = {}
  for (let r = 10; r <= 200; r++) {
    const label = cellStr(sheet, r, 1)
    if (!label) break
    specs[label] = cellStr(sheet, r, 2)
    if (label.startsWith('Notes')) break
  }

  const artworks: ParsedArtworkSlot[] = []
  const artHeader = findBlockStart(sheet, 'Artwork files')
  if (artHeader) {
    const count = findBlockEnd(sheet, artHeader - 1)
    for (let i = 0; i < count; i++) {
      const rr = artHeader + i
      const atype = cellStr(sheet, rr, 1)
      const caption = cellStr(sheet, rr, 2)
      const fname = cellStr(sheet, rr, 3)
      if (atype || fname || caption) {
        artworks.push({ artworkType: atype, caption, fileName: fname })
      }
    }
  }

  const packingSteps: ParsedPackingStep[] = []
  const piHeader = findBlockStart(sheet, 'Packing instructions')
  if (piHeader) {
    const count = findBlockEnd(sheet, piHeader - 1)
    for (let i = 0; i < count; i++) {
      const rr = piHeader + i
      const step = cellStr(sheet, rr, 1)
      const instruction = cellStr(sheet, rr, 2)
      const fname = cellStr(sheet, rr, 3)
      if (instruction || fname) {
        packingSteps.push({ step, instruction, fileName: fname })
      }
    }
  }

  const dimensions: Record<string, string> = {}
  for (let r = 1; r <= 500; r++) {
    if (cellStr(sheet, r, 1).startsWith('Dimensions')) {
      for (let rr = r + 1; rr < r + 8; rr++) {
        const label = cellStr(sheet, rr, 1)
        const value = cellStr(sheet, rr, 2)
        if (label && value) dimensions[label] = value
      }
      break
    }
  }

  return {
    tabName,
    displayName,
    style,
    pageOrder: 9999,
    included: true,
    specs,
    packingSteps,
    dimensions,
    artworks,
  }
}

export function parsePackagingWorkbook(buffer: Buffer): ParsedPackagingWorkbook {
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  } catch {
    throw new PackagingXlsxParseError('Could not read workbook — is it a valid .xlsx file?')
  }

  const missingSheets: string[] = []
  if (!wb.SheetNames.includes('Project Info')) {
    missingSheets.push('Project Info')
  }

  const projectInfo = wb.Sheets['Project Info']
    ? readProjectInfo(wb.Sheets['Project Info'])
    : {}

  const stylesByTab = readComponentsLibrary(wb)
  const setup = readProductSetup(wb)
  const active = setup
    .filter((s) => s.include && wb.SheetNames.includes(s.tabName))
    .sort((a, b) => a.order - b.order)

  const components: ParsedPackagingComponent[] = []
  for (const entry of active) {
    const style = stylesByTab[entry.tabName] ?? 'single_face'
    const comp = readComponentTab(
      wb.Sheets[entry.tabName],
      entry.tabName,
      entry.display || entry.tabName,
      style
    )
    comp.pageOrder = entry.order
    comp.included = true
    components.push(comp)
  }

  if (!components.length) {
    throw new PackagingXlsxParseError(
      'No included components found. Fill Product Setup and mark components as Include = Yes.'
    )
  }

  return { projectInfo, components, missingSheets }
}
