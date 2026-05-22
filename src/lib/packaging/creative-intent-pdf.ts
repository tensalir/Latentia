/**
 * Creative Intent wrap-around PDF — cover + one page per component.
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

const PAGE_W = 842
const PAGE_H = 595
const MARGIN = 16 * 2.834645669

const INK = rgb(0.1, 0.1, 0.1)
const INK_MID = rgb(0.42, 0.42, 0.42)
const BAND = rgb(0.95, 0.95, 0.95)
const ACCENT = rgb(200 / 255, 16 / 255, 46 / 255)

export interface CreativeIntentComponent {
  displayName: string
  pageOrder: number
  specs: Record<string, string>
  packingSteps: Array<{ step?: string; instruction: string }>
}

export interface CreativeIntentInput {
  project: Record<string, string>
  components: CreativeIntentComponent[]
}

const SPEC_LINES: Array<[string, string]> = [
  ['Drawing Part Number', 'DRAWING PART NUMBER'],
  ['Print Part Number', 'PRINT PART NUMBER'],
  ['Material', 'MATERIAL'],
  ['Inks / Print', 'INKS'],
  ['Finishes', 'FINISHES'],
  ['Printing Method', 'PRINTING METHOD'],
]

export async function buildCreativeIntentPdf(input: CreativeIntentInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const fontReg = await doc.embedFont(StandardFonts.Helvetica)

  const sorted = [...input.components].sort((a, b) => a.pageOrder - b.pageOrder)

  // Cover
  const cover = doc.addPage([PAGE_W, PAGE_H])
  cover.drawRectangle({ x: 0, y: PAGE_H - 48, width: PAGE_W, height: 48, color: rgb(0.15, 0.15, 0.15) })
  cover.drawText('loop', { x: MARGIN, y: PAGE_H - 32, size: 22, font: fontBold, color: rgb(1, 1, 1) })
  cover.drawText('Packaging Creative Intent', {
    x: MARGIN,
    y: PAGE_H - 72,
    size: 18,
    font: fontBold,
    color: INK,
  })

  const title = input.project['Project Name'] || input.project.projectName || 'Packaging'
  cover.drawText(title, { x: MARGIN, y: PAGE_H - 96, size: 14, font: fontReg, color: INK_MID })
  cover.drawText(
    `${input.project['SKU / Colourway'] || ''} · ${input.project['Project Stage'] || 'MP'}`,
    { x: MARGIN, y: PAGE_H - 114, size: 10, font: fontReg, color: INK_MID }
  )

  let listY = PAGE_H - 150
  cover.drawText('Components', { x: MARGIN, y: listY, size: 11, font: fontBold, color: INK })
  listY -= 18
  for (const c of sorted) {
    cover.drawText(`${c.pageOrder}. ${c.displayName}`, {
      x: MARGIN + 8,
      y: listY,
      size: 10,
      font: fontReg,
      color: INK,
    })
    listY -= 14
  }

  // Component pages
  for (const comp of sorted) {
    const page = doc.addPage([PAGE_W, PAGE_H])
    page.drawRectangle({ x: 0, y: PAGE_H - 40, width: PAGE_W, height: 40, color: BAND })
    page.drawText('loop', { x: MARGIN, y: PAGE_H - 28, size: 14, font: fontBold, color: INK })
    page.drawText(comp.displayName.toUpperCase(), {
      x: PAGE_W / 2 - 80,
      y: PAGE_H - 28,
      size: 12,
      font: fontBold,
      color: INK,
    })
    page.drawText('Creative Intent', {
      x: PAGE_W - MARGIN - 100,
      y: PAGE_H - 28,
      size: 9,
      font: fontReg,
      color: INK_MID,
    })

    let y = PAGE_H - 56
    for (const [key, label] of SPEC_LINES) {
      const val = comp.specs[key] || '—'
      page.drawText(label, { x: MARGIN, y, size: 7, font: fontBold, color: INK_MID })
      page.drawText(String(val).slice(0, 120), { x: MARGIN + 140, y, size: 8, font: fontReg, color: INK })
      y -= 14
    }

    if (comp.packingSteps.length) {
      y -= 8
      page.drawText('PACKING INSTRUCTIONS', { x: MARGIN, y, size: 8, font: fontBold, color: ACCENT })
      y -= 14
      for (const step of comp.packingSteps.slice(0, 8)) {
        const line = step.step ? `${step.step}. ${step.instruction}` : step.instruction
        page.drawText(line.slice(0, 100), { x: MARGIN, y, size: 7, font: fontReg, color: INK })
        y -= 12
      }
    }

    const notes = comp.specs['Notes'] || ''
    if (notes) {
      y -= 6
      page.drawText('NOTES', { x: MARGIN, y, size: 7, font: fontBold, color: INK_MID })
      y -= 12
      page.drawText(notes.slice(0, 200), { x: MARGIN, y, size: 7, font: fontReg, color: INK })
    }
  }

  return doc.save()
}
