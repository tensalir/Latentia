/**
 * The Creative Intent PDF — the document the brand and the supplier review
 * together.
 *
 * Structure (loop-packaging-system SKILL.md step 6): an overview page (the
 * exploded render plus a component key in Product Setup page order), then one
 * spec page per included component showing the filled specifications, the
 * mockup, and the CLEAN artwork.
 *
 * Two rules this module enforces:
 *  - No info box anywhere. The 200×100 box belongs only on supplier PDFs; the
 *    caller passes clean editable artwork here, never a stamped file.
 *  - A component with no artwork is not an error. It renders `[no artwork]`
 *    and the document still builds ("a planned part is not an error").
 *
 * Artwork embeds as vector via `embedPdf` — no rasterisation, so no poppler
 * or Ghostscript dependency (Anna's Python pipeline needed pdftoppm for this).
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { toWinAnsiSafe } from './format'

const PAGE_W = 842 // A4 landscape
const PAGE_H = 595

const C = {
  ink: rgb(0.1, 0.1, 0.1),
  body: rgb(0.15, 0.15, 0.15),
  mid: rgb(0.42, 0.42, 0.42),
  line: rgb(0.82, 0.82, 0.82),
  accent: rgb(0.784, 0.063, 0.18), // Loop red #C8102E
  panel: rgb(0.97, 0.97, 0.97),
  white: rgb(1, 1, 1),
}

export interface CreativeIntentPackStep {
  stepNumber: number
  instruction: string
  imageBytes: Uint8Array | null
}

export interface CreativeIntentComponent {
  displayName: string
  code: string | null
  printed: boolean
  material: string | null
  printingMethod: string | null
  coatingMsdsRef: string | null
  paperThickness: string | null
  drawingPartNumber: string | null
  approvalStatus: string | null
  engineerNotes: string | null
  inks: string[]
  finishes: string[]
  structural: string[]
  printPartNumber: string | null
  mockupBytes: Uint8Array | null
  /** Clean editable artwork (.ai / PDF bytes). */
  artworkBytes: Uint8Array | null
  packSteps: CreativeIntentPackStep[]
}

export interface CreativeIntentInput {
  projectName: string
  productType: string | null
  supplier: string | null
  stage: string
  variant: string
  skuCode: string | null
  /** Pre-formatted DD-MM-YYYY. */
  date: string
  packagingDesigner: string | null
  graphicDesigner: string | null
  packagingEngineer: string | null
  overviewBytes: Uint8Array | null
  components: CreativeIntentComponent[]
}

interface Fonts {
  regular: PDFFont
  bold: PDFFont
}

async function embedImage(pdf: PDFDocument, bytes: Uint8Array | null) {
  if (!bytes || bytes.length === 0) return null
  try {
    return await pdf.embedPng(bytes)
  } catch {
    try {
      return await pdf.embedJpg(bytes)
    } catch {
      return null
    }
  }
}

function text(
  page: PDFPage,
  value: string,
  opts: { x: number; y: number; size: number; font: PDFFont; color?: ReturnType<typeof rgb> }
) {
  const safe = toWinAnsiSafe(value)
  if (!safe) return
  page.drawText(safe, { x: opts.x, y: opts.y, size: opts.size, font: opts.font, color: opts.color ?? C.body })
}

function wrapText(
  page: PDFPage,
  value: string,
  opts: {
    x: number
    y: number
    size: number
    font: PDFFont
    maxWidth: number
    maxLines?: number
    color?: ReturnType<typeof rgb>
    lineHeight?: number
  }
): number {
  const safe = toWinAnsiSafe(value)
  if (!safe) return opts.y
  const words = safe.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word
    if (opts.font.widthOfTextAtSize(trial, opts.size) <= opts.maxWidth || !line) {
      line = trial
    } else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  const limit = opts.maxLines ?? lines.length
  const lh = opts.lineHeight ?? opts.size * 1.3
  let cursor = opts.y
  for (const l of lines.slice(0, limit)) {
    page.drawText(l, { x: opts.x, y: cursor, size: opts.size, font: opts.font, color: opts.color ?? C.body })
    cursor -= lh
  }
  return cursor
}

/** Contain-fit a source box inside a target box, centred. */
function fitBox(
  srcW: number,
  srcH: number,
  box: { x: number; y: number; width: number; height: number }
) {
  if (srcW <= 0 || srcH <= 0) return { x: box.x, y: box.y, width: box.width, height: box.height }
  const scale = Math.min(box.width / srcW, box.height / srcH)
  const width = srcW * scale
  const height = srcH * scale
  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  }
}

function placeholder(
  page: PDFPage,
  fonts: Fonts,
  box: { x: number; y: number; width: number; height: number },
  label: string
) {
  page.drawRectangle({ ...box, color: C.panel, borderColor: C.line, borderWidth: 0.5 })
  const size = 9
  const w = fonts.regular.widthOfTextAtSize(label, size)
  text(page, label, {
    x: box.x + (box.width - w) / 2,
    y: box.y + box.height / 2 - size / 2,
    size,
    font: fonts.regular,
    color: C.mid,
  })
}

function drawPageHeader(
  page: PDFPage,
  fonts: Fonts,
  input: CreativeIntentInput,
  title: string,
  pageLabel: string
) {
  text(page, 'loop', { x: 40, y: PAGE_H - 46, size: 20, font: fonts.bold, color: C.ink })
  text(page, title, { x: 100, y: PAGE_H - 44, size: 15, font: fonts.bold, color: C.ink })
  const meta = [input.projectName, input.stage, input.variant, input.skuCode]
    .filter(Boolean)
    .join('  ·  ')
  text(page, meta, { x: 100, y: PAGE_H - 60, size: 8.5, font: fonts.regular, color: C.mid })

  const right = 'CREATIVE INTENT'
  const rw = fonts.bold.widthOfTextAtSize(right, 9)
  text(page, right, { x: PAGE_W - 40 - rw, y: PAGE_H - 44, size: 9, font: fonts.bold, color: C.accent })
  const sub = [input.date, pageLabel].filter(Boolean).join('  ·  ')
  const sw = fonts.regular.widthOfTextAtSize(sub, 8)
  text(page, sub, { x: PAGE_W - 40 - sw, y: PAGE_H - 58, size: 8, font: fonts.regular, color: C.mid })

  page.drawLine({
    start: { x: 40, y: PAGE_H - 72 },
    end: { x: PAGE_W - 40, y: PAGE_H - 72 },
    color: C.line,
    thickness: 0.6,
  })
}

function drawOverviewPage(pdf: PDFDocument, fonts: Fonts, input: CreativeIntentInput, overview: Awaited<ReturnType<typeof embedImage>>) {
  const page = pdf.addPage([PAGE_W, PAGE_H])
  drawPageHeader(page, fonts, input, input.productType ? `${input.projectName} — ${input.productType}` : input.projectName, 'Overview')

  const keyX = PAGE_W - 300
  const imageBox = { x: 40, y: 60, width: keyX - 80, height: PAGE_H - 150 }

  if (overview) {
    const fitted = fitBox(overview.width, overview.height, imageBox)
    page.drawImage(overview, fitted)
  } else {
    placeholder(page, fonts, imageBox, '[no overview render]')
  }

  text(page, 'COMPONENTS', { x: keyX, y: PAGE_H - 100, size: 9.5, font: fonts.bold, color: C.accent })
  let y = PAGE_H - 122
  input.components.forEach((component, idx) => {
    if (y < 70) return
    const num = String(idx + 1).padStart(2, '0')
    text(page, num, { x: keyX, y, size: 9, font: fonts.bold, color: C.mid })
    const label = component.code ? `${component.displayName}  (${component.code})` : component.displayName
    text(page, label, { x: keyX + 22, y, size: 9, font: fonts.regular, color: C.body })
    if (!component.printed) {
      text(page, 'not printed', { x: keyX + 22, y: y - 10, size: 7.5, font: fonts.regular, color: C.mid })
      y -= 10
    }
    y -= 18
  })

  const footer = [input.supplier ? `Supplier: ${input.supplier}` : null, input.packagingDesigner ? `Packaging designer: ${input.packagingDesigner}` : null, input.graphicDesigner ? `Graphic designer: ${input.graphicDesigner}` : null, input.packagingEngineer ? `Packaging engineer: ${input.packagingEngineer}` : null]
    .filter(Boolean)
    .join('     ')
  text(page, footer, { x: 40, y: 36, size: 7.5, font: fonts.regular, color: C.mid })
}

async function drawComponentPage(
  pdf: PDFDocument,
  fonts: Fonts,
  input: CreativeIntentInput,
  component: CreativeIntentComponent,
  index: number
) {
  const page = pdf.addPage([PAGE_W, PAGE_H])
  const title = component.code ? `${component.displayName} · ${component.code}` : component.displayName
  drawPageHeader(page, fonts, input, title, `${String(index + 1).padStart(2, '0')} / ${input.components.length}`)

  // ── Left column: specifications ─────────────────────────────────────────
  const colX = 40
  const colW = 300
  let y = PAGE_H - 100

  text(page, 'SPECIFICATIONS', { x: colX, y, size: 9.5, font: fonts.bold, color: C.accent })
  y -= 20

  const rows: Array<[string, string]> = [
    ['Material', component.material || '—'],
    ['Printing method', component.printed ? component.printingMethod || '—' : 'Not printed'],
    ['Coating / MSDS', component.coatingMsdsRef || '—'],
    ['Paper thickness', component.paperThickness || '—'],
    ['Drawing part no.', component.drawingPartNumber || '—'],
    ['Print part no.', component.printPartNumber || '—'],
    ['Approval', component.approvalStatus || '—'],
  ]
  for (const [label, value] of rows) {
    text(page, label.toUpperCase(), { x: colX, y, size: 7.5, font: fonts.bold, color: C.mid })
    const end = wrapText(page, value, {
      x: colX + 104,
      y,
      size: 9,
      font: fonts.regular,
      maxWidth: colW - 104,
      maxLines: 2,
    })
    y = Math.min(y - 17, end - 3)
  }

  // Machine-read plate groups
  y -= 6
  text(page, 'READ FROM THE ARTWORK FILE', { x: colX, y, size: 7.5, font: fonts.bold, color: C.accent })
  y -= 15
  const plateGroups: Array<[string, string[]]> = [
    ['Inks', component.inks],
    ['Special finishes', component.finishes],
    ['Structural plates', component.structural],
  ]
  for (const [label, items] of plateGroups) {
    text(page, `${label} (${items.length})`, { x: colX, y, size: 7.5, font: fonts.bold, color: C.mid })
    const end = wrapText(page, items.length ? items.join(', ') : '—', {
      x: colX + 104,
      y,
      size: 8.5,
      font: fonts.regular,
      maxWidth: colW - 104,
      maxLines: 3,
    })
    y = Math.min(y - 15, end - 3)
  }

  if (component.engineerNotes) {
    y -= 6
    text(page, 'NOTES', { x: colX, y, size: 7.5, font: fonts.bold, color: C.mid })
    y = wrapText(page, component.engineerNotes, {
      x: colX,
      y: y - 12,
      size: 8.5,
      font: fonts.regular,
      maxWidth: colW,
      maxLines: 4,
    })
  }

  // Pack instructions — the reason non-printed parts stay in the document.
  if (component.packSteps.length > 0) {
    y -= 10
    text(page, 'PACK INSTRUCTIONS', { x: colX, y, size: 7.5, font: fonts.bold, color: C.accent })
    y -= 14
    for (const step of component.packSteps) {
      if (y < 60) break
      text(page, `${step.stepNumber}.`, { x: colX, y, size: 8.5, font: fonts.bold, color: C.mid })
      const end = wrapText(page, step.instruction, {
        x: colX + 16,
        y,
        size: 8.5,
        font: fonts.regular,
        maxWidth: colW - 16,
        maxLines: 2,
      })
      y = Math.min(y - 14, end - 2)
      const img = await embedImage(pdf, step.imageBytes)
      if (img && y > 80) {
        const box = { x: colX + 16, y: y - 54, width: 72, height: 54 }
        page.drawImage(img, fitBox(img.width, img.height, box))
        y -= 60
      }
    }
  }

  // ── Right column: mockup + clean artwork ────────────────────────────────
  const rightX = 364
  const rightW = PAGE_W - rightX - 40
  const mockupBox = { x: rightX, y: PAGE_H - 300, width: rightW, height: 200 }
  const artworkBox = { x: rightX, y: 60, width: rightW, height: PAGE_H - 380 }

  text(page, 'MOCKUP', { x: rightX, y: PAGE_H - 92, size: 7.5, font: fonts.bold, color: C.mid })
  const mockup = await embedImage(pdf, component.mockupBytes)
  if (mockup) {
    page.drawImage(mockup, fitBox(mockup.width, mockup.height, mockupBox))
  } else {
    placeholder(page, fonts, mockupBox, '[no mockup]')
  }

  text(page, 'ARTWORK', { x: rightX, y: artworkBox.y + artworkBox.height + 8, size: 7.5, font: fonts.bold, color: C.mid })
  await drawArtwork(pdf, page, fonts, component, artworkBox)
}

/**
 * Embed the component's clean artwork as vector. Page 0 is the primary panel;
 * up to three further pages (front/back sheets) render as a strip beneath it,
 * with a caption when the file has still more.
 */
async function drawArtwork(
  pdf: PDFDocument,
  page: PDFPage,
  fonts: Fonts,
  component: CreativeIntentComponent,
  box: { x: number; y: number; width: number; height: number }
) {
  if (!component.artworkBytes || component.artworkBytes.length === 0) {
    placeholder(page, fonts, box, '[no artwork]')
    return
  }

  let embedded: Awaited<ReturnType<typeof pdf.embedPdf>> = []
  let totalPages = 0
  try {
    const source = await PDFDocument.load(component.artworkBytes, { ignoreEncryption: true })
    totalPages = source.getPageCount()

    // pdf-lib refuses to embed a page with no content stream, and only finds
    // out at save() time — which would take the WHOLE document down over one
    // odd sheet. Filter those pages out here instead.
    const drawable = source
      .getPages()
      .map((sourcePage, index) => ({ sourcePage, index }))
      .filter(({ sourcePage }) => Boolean(sourcePage.node.Contents()))
      .slice(0, 4)
      .map(({ index }) => index)

    if (drawable.length === 0) {
      placeholder(page, fonts, box, '[artwork has no drawable content]')
      return
    }

    embedded = await pdf.embedPdf(source, drawable)
    // Force the embed NOW so any remaining failure lands in this catch rather
    // than at save() time, where it would fail every other component too.
    await Promise.all(embedded.map((embeddedPage) => embeddedPage.embed()))
  } catch {
    placeholder(
      page,
      fonts,
      box,
      '[artwork could not be embedded — re-save the .ai with "Create PDF Compatible File"]'
    )
    return
  }

  if (embedded.length === 0) {
    placeholder(page, fonts, box, '[no artwork]')
    return
  }

  const [primary, ...extras] = embedded
  const stripH = extras.length > 0 ? 56 : 0
  const primaryBox = {
    x: box.x,
    y: box.y + stripH,
    width: box.width,
    height: box.height - stripH,
  }
  page.drawPage(primary, fitBox(primary.width, primary.height, primaryBox))

  if (extras.length > 0) {
    const slotW = box.width / 4 - 6
    extras.forEach((extra, i) => {
      const slot = { x: box.x + i * (slotW + 6), y: box.y, width: slotW, height: stripH - 12 }
      page.drawPage(extra, fitBox(extra.width, extra.height, slot))
    })
    const caption =
      totalPages > embedded.length
        ? `${totalPages} pages in this file — first ${embedded.length} shown`
        : `${totalPages} pages`
    text(page, caption, { x: box.x, y: box.y - 10, size: 7, font: fonts.regular, color: C.mid })
  }
}

export async function buildCreativeIntentPdf(input: CreativeIntentInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  }

  pdf.setTitle(
    `${input.projectName} ${input.stage} Creative Intent ${input.variant}`.replace(/\s+/g, ' ').trim()
  )
  pdf.setProducer('Vesper — Loop Packaging Studio')

  const overview = await embedImage(pdf, input.overviewBytes)
  drawOverviewPage(pdf, fonts, input, overview)

  for (let i = 0; i < input.components.length; i++) {
    await drawComponentPage(pdf, fonts, input, input.components[i], i)
  }

  return pdf.save()
}
