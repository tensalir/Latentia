/**
 * Extract Illustrator plate names from PDF-compatible .ai files via XMP metadata.
 * Port of loop-packaging-system/scripts/generate_supplier_pdf.py
 */

import { PDFDocument } from 'pdf-lib'

export const DIELINE_KEYWORDS = [
  'CUT LINE',
  'BEND LINE',
  'DIELINE',
  'PERF',
  'FOLD LINE',
  'CREASE',
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
  dielines: string[]
  raw: string[]
}

function classifyPlate(name: string): 'ink' | 'finish' | 'dieline' {
  const up = name.trim().toUpperCase()
  if (DIELINE_KEYWORDS.some((k) => up.includes(k))) return 'dieline'
  if (FINISH_KEYWORDS.some((k) => up.includes(k))) return 'finish'
  return 'ink'
}

function parsePlateNamesFromXmp(xmp: string): string[] {
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

export async function extractPlates(buffer: Buffer): Promise<ExtractedPlates> {
  // PDF-compatible .ai files embed XMP as a metadata stream — scan the raw bytes
  // so we don't depend on pdf-lib's metadata API surface.
  let xmp = buffer.toString('latin1')
  try {
    const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true })
    void pdf
  } catch {
    throw new Error('File is not a valid PDF-compatible Illustrator document')
  }

  const raw = parsePlateNamesFromXmp(xmp)
  const inks: string[] = []
  const finishes: string[] = []
  const dielines: string[] = []

  for (const p of raw) {
    const bucket = classifyPlate(p)
    if (bucket === 'dieline') dielines.push(p)
    else if (bucket === 'finish') finishes.push(p)
    else inks.push(p)
  }

  return { inks, finishes, dielines, raw }
}

export function isPdfCompatibleArtwork(fileName: string, mimeType?: string | null): boolean {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.ai') || lower.endsWith('.pdf')) return true
  if (mimeType?.includes('pdf')) return true
  return false
}
