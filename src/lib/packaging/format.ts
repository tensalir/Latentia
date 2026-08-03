/**
 * Formatting helpers shared by the packaging PDF builders and workbook I/O.
 */

/** Days between the Excel serial epoch (1899-12-30) and Unix epoch. */
const EXCEL_EPOCH_OFFSET_DAYS = 25569
const MS_PER_DAY = 86_400_000

/**
 * Render a date European-style (`DD-MM-YYYY`, no time) — the format Anna's
 * supplier box uses. Accepts a `Date`, an ISO-ish string, or an Excel serial
 * number (workbooks round-trip through Google Sheets, which re-types cells).
 * Returns `''` for anything unparseable — the box shows a blank, never
 * `Invalid Date` or `00:00:00`.
 */
export function formatDateEu(value: Date | string | number | null | undefined): string {
  const date = coerceDate(value)
  if (!date) return ''
  const dd = String(date.getUTCDate()).padStart(2, '0')
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const yyyy = date.getUTCFullYear()
  return `${dd}-${mm}-${yyyy}`
}

export function coerceDate(value: Date | string | number | null | undefined): Date | null {
  if (value == null || value === '') return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value === 'number') {
    // Excel serial (plausible range ~1950–2100).
    if (value > 18_000 && value < 74_000) {
      return new Date((value - EXCEL_EPOCH_OFFSET_DAYS) * MS_PER_DAY)
    }
    return null
  }
  const trimmed = value.trim()
  if (!trimmed) return null
  // DD-MM-YYYY / DD/MM/YYYY first — Date.parse would read them US-style.
  const eu = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
  if (eu) {
    const [, d, m, y] = eu
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
    return Number.isNaN(date.getTime()) ? null : date
  }
  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Code points WinAnsi (CP1252) maps into the 0x80–0x9F range, which plain
 * Latin-1 does not cover. Includes the punctuation the PDF copy actually uses —
 * em dash, en dash, curly quotes, ellipsis, bullet — so those render as
 * themselves instead of `?`.
 */
const WINANSI_EXTRAS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039,
  0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122,
  0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
])

/**
 * Strip characters the pdf-lib StandardFonts (WinAnsi encoding) cannot draw.
 * Plate names come straight from Illustrator swatches and occasionally carry
 * exotic glyphs; degrading those to `?` beats throwing mid-generation.
 */
export function toWinAnsiSafe(input: string): string {
  let out = ''
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0
    if (code === 0x0a || code === 0x0d || code === 0x09) {
      out += ' '
    } else if (code >= 0x20 && code <= 0x7e) {
      out += ch
    } else if (code >= 0xa0 && code <= 0xff) {
      out += ch // Latin-1 supplement is WinAnsi-representable
    } else if (WINANSI_EXTRAS.has(code)) {
      out += ch
    } else {
      out += '?'
    }
  }
  return out
}
