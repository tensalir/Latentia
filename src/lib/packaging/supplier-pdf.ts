/**
 * Supplier PDF: the printing brief.
 *
 * Anna's "Option A" — the info box is stamped as an OVERLAY on every page of
 * the editable Illustrator file. We draw onto the pages pdf-lib already
 * loaded, which appends a content stream: the artwork's own streams, spot
 * colour plates and layers are left untouched, and the page count is
 * preserved. (Options B/C — outlining fonts via Ghostscript, appending the box
 * as an extra page — were retired in her latest skill; only the overlay ships.)
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib'
import { toWinAnsiSafe } from './format'
import { layoutInfoBox, type DrawOp, type InfoBoxData } from './info-box'

export interface SupplierPdfResult {
  bytes: Uint8Array
  pageCount: number
}

function hexToRgb(hex: string): RGB {
  const clean = hex.replace('#', '')
  const n = parseInt(clean, 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

function renderOps(
  page: PDFPage,
  ops: DrawOp[],
  fonts: { regular: PDFFont; bold: PDFFont }
): void {
  for (const op of ops) {
    if (op.op === 'rect') {
      // NOTE: pdf-lib has no native rounded rectangle, so chips render with
      // square corners (Anna's reportlab version uses a 4pt radius). Purely
      // cosmetic on a 16pt chip; revisit only if the team asks.
      page.drawRectangle({
        x: op.x,
        y: op.y,
        width: op.width,
        height: op.height,
        color: op.fill ? hexToRgb(op.fill) : undefined,
        borderColor: op.stroke ? hexToRgb(op.stroke) : undefined,
        borderWidth: op.lineWidth,
      })
      continue
    }
    if (op.op === 'line') {
      page.drawLine({
        start: { x: op.x1, y: op.y1 },
        end: { x: op.x2, y: op.y2 },
        color: hexToRgb(op.color),
        thickness: op.lineWidth,
      })
      continue
    }
    const font = op.bold ? fonts.bold : fonts.regular
    const text = toWinAnsiSafe(op.text)
    if (!text) continue
    let x = op.x
    if (op.align === 'center') x -= font.widthOfTextAtSize(text, op.size) / 2
    else if (op.align === 'right') x -= font.widthOfTextAtSize(text, op.size)
    page.drawText(text, { x, y: op.y, size: op.size, font, color: hexToRgb(op.color) })
  }
}

/**
 * Stamp the info box on every page of the source artwork.
 * Each page is measured from its own MediaBox, so mixed-size sheets in one
 * file each get a correctly placed box.
 */
export async function buildSupplierPdf(args: {
  artwork: Buffer
  data: InfoBoxData
}): Promise<SupplierPdfResult> {
  const pdf = await PDFDocument.load(args.artwork, { ignoreEncryption: true })
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const measure = (text: string, size: number, isBold: boolean) =>
    (isBold ? bold : regular).widthOfTextAtSize(toWinAnsiSafe(text), size)

  const pages = pdf.getPages()
  for (const page of pages) {
    const { width, height } = page.getMediaBox()
    const { ops } = layoutInfoBox({ pageWidth: width, pageHeight: height, data: args.data, measure })
    renderOps(page, ops, { regular, bold })
  }

  const bytes = await pdf.save()
  return { bytes, pageCount: pages.length }
}
