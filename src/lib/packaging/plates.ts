/**
 * Extract Illustrator plate names from PDF-compatible .ai files via XMP
 * metadata, and classify them the way Anna's skill does.
 *
 * Port of loop-packaging-system `sync_workbook.py` / `generate_supplier_pdf.py`.
 * Plate names are read from the file, never retyped — the sync writes them
 * into the component's machine fields so the two sources can't drift.
 */

import { PDFDocument } from 'pdf-lib'

// Canonical keyword vocabulary (loop-packaging-system SKILL.md).
export const STRUCTURAL_KEYWORDS = [
  'CUT LINE',
  'BEND LINE',
  'DIELINE',
  'DIE CUT',
  'DIE-CUT',
  'PERF',
  'FOLD LINE',
  'CREASE',
  'GLUE AREA',
  'GLUE ZONE',
] as const

export const FINISH_KEYWORDS = [
  'EMBOSS',
  'DEBOSS',
  'UV',
  'FOIL',
  'SPOT',
  'VARNISH',
  'LAMINATE',
  'GLOSS',
  'MATT',
  'MATTE',
] as const

export interface ExtractedPlates {
  inks: string[]
  finishes: string[]
  structural: string[]
  raw: string[]
}

export interface ArtworkProbe {
  aiCompatible: boolean
  pageCount: number | null
}

export function classifyPlate(name: string): 'ink' | 'finish' | 'structural' {
  const up = name.trim().toUpperCase()
  if (STRUCTURAL_KEYWORDS.some((k) => up.includes(k))) return 'structural'
  if (FINISH_KEYWORDS.some((k) => up.includes(k))) return 'finish'
  return 'ink'
}

export function classifyPlates(raw: string[]): ExtractedPlates {
  const inks: string[] = []
  const finishes: string[] = []
  const structural: string[] = []
  for (const p of raw) {
    const bucket = classifyPlate(p)
    if (bucket === 'structural') structural.push(p)
    else if (bucket === 'finish') finishes.push(p)
    else inks.push(p)
  }
  return { inks, finishes, structural, raw }
}

export function parsePlateNamesFromXmp(xmp: string): string[] {
  const plates: string[] = []
  const blockMatch = xmp.match(/<xmpTPg:PlateNames>[\s\S]*?<\/xmpTPg:PlateNames>/i)
  if (!blockMatch) return plates
  const liRegex = /<rdf:li[^>]*>([^<]+)<\/rdf:li>/gi
  let m: RegExpExecArray | null
  while ((m = liRegex.exec(blockMatch[0])) !== null) {
    const p = m[1].trim()
    if (p) plates.push(p)
  }
  if (plates.length === 0) {
    const alt = blockMatch[0].match(/<rdf:Seq>[\s\S]*?<\/rdf:Seq>/i)
    if (alt) {
      const altLi = /<rdf:li>([^<]+)<\/rdf:li>/gi
      while ((m = altLi.exec(alt[0])) !== null) {
        const p = m[1].trim()
        if (p) plates.push(p)
      }
    }
  }
  return Array.from(new Set(plates))
}

/**
 * Check whether the buffer is loadable as a PDF (i.e. the .ai was saved with
 * "Create PDF Compatible File") and how many pages it has. Never throws —
 * an incompatible file is a reportable state, not an error.
 */
export async function probeArtwork(buffer: Buffer): Promise<ArtworkProbe> {
  try {
    const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true })
    return { aiCompatible: true, pageCount: pdf.getPageCount() }
  } catch {
    return { aiCompatible: false, pageCount: null }
  }
}

/**
 * Extract and classify plate names. Works on the raw bytes (PDF-compatible
 * .ai files embed XMP as a metadata stream), so it succeeds even when
 * pdf-lib can't fully parse the document.
 */
export function extractPlates(buffer: Buffer): ExtractedPlates {
  const xmp = buffer.toString('latin1')
  return classifyPlates(parsePlateNamesFromXmp(xmp))
}

export function isPdfCompatibleArtwork(fileName: string, mimeType?: string | null): boolean {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.ai') || lower.endsWith('.pdf')) return true
  if (mimeType?.includes('pdf')) return true
  return false
}
