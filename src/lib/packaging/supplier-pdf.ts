/**
 * Supplier PDF — Option A overlay (info box top-right on artwork pages).
 * Port of loop-packaging-system/scripts/generate_supplier_pdf.py
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import type { ExtractedPlates } from './plates'

const MM = 2.834645669
const BOX_W = 200 * MM
const BOX_H = 100 * MM
const MARGIN = 10 * MM

const INK = rgb(0.1, 0.1, 0.1)
const INK_MID = rgb(0.42, 0.42, 0.42)
const BAND = rgb(0.95, 0.95, 0.95)
const ACCENT = rgb(200 / 255, 16 / 255, 46 / 255)

export interface SupplierPdfInput {
  artworkBuffer: Buffer
  project: Record<string, string>
  component: Record<string, string>
  componentDisplay: string
  plates: ExtractedPlates
}

export async function buildSupplierPdfOverlay(input: SupplierPdfInput): Promise<Uint8Array> {
  const src = await PDFDocument.load(input.artworkBuffer, { ignoreEncryption: true })
  const out = await PDFDocument.create()
  const fontBold = await out.embedFont(StandardFonts.HelveticaBold)
  const fontReg = await out.embedFont(StandardFonts.Helvetica)
  const fontMono = await out.embedFont(StandardFonts.Courier)

  const pages = await out.copyPages(src, src.getPageIndices())

  for (const page of pages) {
    out.addPage(page)
    const { width, height } = page.getSize()
    const boxX = width - MARGIN - BOX_W
    const boxY = height - MARGIN - BOX_H

    page.drawRectangle({
      x: boxX,
      y: boxY,
      width: BOX_W,
      height: BOX_H,
      color: rgb(1, 1, 1),
      borderColor: INK,
      borderWidth: 0.5,
    })

    let y = boxY + BOX_H - 14
    const left = boxX + 8

    page.drawText('loop', { x: left, y, size: 11, font: fontBold, color: INK })
    y -= 12
    const kv = (label: string, value: string) => {
      page.drawText(label, { x: left, y, size: 6, font: fontBold, color: INK })
      page.drawText(value.slice(0, 48), { x: left + 72, y, size: 6, font: fontReg, color: INK })
      y -= 9
    }

    kv('PROJECT:', input.project['Project Name'] || input.project.projectName || '')
    kv('PART:', input.componentDisplay)
    kv('DATE:', input.project['Date'] || input.project.date || '')
    kv('DRAWING PN:', input.component['Drawing Part Number'] || '')
    kv('PRINT PN:', input.component['Print Part Number'] || '')
    kv('SKU:', input.project['SKU / Colourway'] || input.project.skuColourway || '')

    y -= 4
    page.drawRectangle({ x: left, y: y - 2, width: BOX_W - 16, height: 10, color: BAND })
    page.drawText('INKS & FINISHES', { x: left + 2, y, size: 6, font: fontBold, color: INK })
    y -= 12

    const lines: string[] = []
    if (input.plates.inks.length) lines.push(`Inks: ${input.plates.inks.join(', ')}`)
    if (input.plates.finishes.length) lines.push(`Finishes: ${input.plates.finishes.join(', ')}`)
    if (input.plates.dielines.length) lines.push(`Dielines: ${input.plates.dielines.join(', ')}`)
    if (!lines.length) lines.push('(from artwork plates)')

    for (const line of lines.slice(0, 6)) {
      page.drawText(line.slice(0, 70), { x: left, y, size: 5.5, font: fontMono, color: INK_MID })
      y -= 8
    }

    const material = input.component['Material'] || ''
    if (material) {
      y -= 2
      page.drawText(`Material: ${material}`.slice(0, 70), {
        x: left,
        y,
        size: 5.5,
        font: fontReg,
        color: INK,
      })
    }

    const stage = input.project['Project Stage'] || input.project.stage || ''
    if (stage) {
      page.drawText(stage, {
        x: boxX + BOX_W - 28,
        y: boxY + BOX_H - 12,
        size: 7,
        font: fontBold,
        color: ACCENT,
      })
    }
  }

  return out.save()
}
