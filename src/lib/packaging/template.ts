/**
 * Build empty Loop Packaging Creative Intent workbook (.xlsx).
 * Simplified port of build_template.py — uses xlsx SheetJS write.
 */

import * as XLSX from 'xlsx'
import { ALL_PACKAGING_COMPONENTS, NYX_COMPONENTS } from './components'

export function buildPackagingTemplateWorkbook(): Buffer {
  const wb = XLSX.utils.book_new()

  const readme = [
    ['Loop Packaging Creative Intent — Template'],
    ['Fill Project Info, Product Setup, then each component tab.'],
    ['Run import in Packaging Studio to generate supplier + Creative Intent PDFs.'],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(readme), 'README')

  const projectRows = [
    ['', 'Field', 'Value'],
    ['', 'Project Name', ''],
    ['', 'Product Type', ''],
    ['', 'Product Family', ''],
    ['', 'SKU / Colourway', ''],
    ['', 'Packaging Designer', ''],
    ['', 'Packaging Engineer', ''],
    ['', 'Brand Manager', ''],
    ['', 'Date', ''],
    ['', 'Project Stage', 'MP'],
    ['', 'Supplier', ''],
    ['', 'Internal Reference', ''],
    ['', 'Notes', ''],
    ['', 'Artwork Folder', ''],
    ['', 'Packaging Overview Image', ''],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(projectRows), 'Project Info')

  const libRows = [
    ['', 'Tab', 'Display', '', '', 'Style'],
    ...ALL_PACKAGING_COMPONENTS.map((c) => ['', '', c.slug, c.displayName, '', c.style]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(libRows), 'Components Library')

  const setupRows = [
    ['', '', 'Tab', 'Display', 'Include', 'Page order'],
    ...NYX_COMPONENTS.map((c, i) => ['', '', c.slug, c.displayName, 'Yes', String(i + 1)]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(setupRows), 'Product Setup')

  for (const comp of NYX_COMPONENTS) {
    const rows: string[][] = [
      ['', comp.displayName],
      ['', 'Description', comp.description],
      ['', 'PDF page title', comp.displayName],
      [''],
      ['SPECIFICATIONS'],
      ['Drawing Part Number', ''],
      ['Print Part Number', ''],
      ['Material', ''],
      ['Inks / Print', ''],
      ['Finishes', ''],
      ['Special Effects', ''],
      ['Printing Method', ''],
      ['Coating MSDS Ref.', ''],
      ['Approval Status', 'Draft'],
      ['Notes', ''],
      [''],
      ['Artwork files'],
      ['Artwork Type', 'Caption', 'File Name'],
      ...(comp.style === 'two_face'
        ? [
            ['Mockup', '', ''],
            ['Artwork_Front', '', ''],
            ['Artwork_Back', '', ''],
          ]
        : [
            ['Mockup', '', ''],
            ['Artwork', '', ''],
          ]),
    ]
    if (comp.hasPackingBlock) {
      rows.push([''], ['Packing instructions'], ['Step', 'Instruction', 'Image File Name'])
    }
    rows.push([''], ['Dimensions'], ['Label', 'Value'])
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), comp.slug)
  }

  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return Buffer.from(out)
}
