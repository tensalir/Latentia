import { test, expect } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import {
  classifyPlate,
  classifyPlates,
  extractPlates,
  parsePlateNamesFromXmp,
  probeArtwork,
} from '../src/lib/packaging/plates'

/**
 * Plate classification is the single most regression-prone piece of the
 * pipeline: Anna lost a whole review cycle to structural plates being reported
 * as inks. These assertions lock her canonical keyword vocabulary in place.
 */

test('structural keywords never classify as inks', () => {
  const structural = [
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
  ]
  for (const name of structural) {
    expect(classifyPlate(name), `${name} should be structural`).toBe('structural')
  }
})

test('finish keywords classify as finishes', () => {
  for (const name of ['EMBOSS', 'DEBOSS', 'UV GLOSS', 'HOT FOIL', 'SPOT UV', 'VARNISH', 'LAMINATE', 'MATT', 'MATTE']) {
    expect(classifyPlate(name), `${name} should be a finish`).toBe('finish')
  }
})

test('process and named inks fall through to inks', () => {
  for (const name of ['Cyan', 'Magenta', 'Yellow', 'Black', 'PANTONE 10101 C', 'Warm Black 2']) {
    expect(classifyPlate(name), `${name} should be an ink`).toBe('ink')
  }
})

test('classification is case-insensitive and matches substrings', () => {
  expect(classifyPlate('holographic foil')).toBe('finish')
  expect(classifyPlate('Cutter Guide die cut')).toBe('structural')
})

test('the Hangtag case: all structural, zero inks', () => {
  // Straight from workflow_walkthrough.md — Hangtag reports inks=0 finishes=0
  // dielines=3. If these ever land in `inks`, the vocabulary has drifted.
  const result = classifyPlates(['DIE CUT', 'GLUE AREA', 'CREASE'])
  expect(result.inks).toEqual([])
  expect(result.finishes).toEqual([])
  expect(result.structural).toHaveLength(3)
})

test('the Rigid Box Lid case: six inks, one finish, two structural', () => {
  const result = classifyPlates([
    'Cyan',
    'Magenta',
    'Yellow',
    'Black',
    'Warm Black 2',
    'PANTONE 10101 C',
    'holographic foil',
    'DIE CUT',
    'CREASE',
  ])
  expect(result.inks).toHaveLength(6)
  expect(result.finishes).toEqual(['holographic foil'])
  expect(result.structural).toEqual(['DIE CUT', 'CREASE'])
})

test('parses plate names out of an XMP PlateNames block', () => {
  const xmp = `<?xpacket begin=""?><x:xmpmeta xmlns:x="adobe:ns:meta/">
    <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
      <rdf:Description xmlns:xmpTPg="http://ns.adobe.com/xap/1.0/t/pg/">
        <xmpTPg:PlateNames>
          <rdf:Seq>
            <rdf:li>Cyan</rdf:li>
            <rdf:li>PANTONE 10101 C</rdf:li>
            <rdf:li>DIE CUT</rdf:li>
          </rdf:Seq>
        </xmpTPg:PlateNames>
      </rdf:Description>
    </rdf:RDF></x:xmpmeta><?xpacket end="w"?>`
  expect(parsePlateNamesFromXmp(xmp)).toEqual(['Cyan', 'PANTONE 10101 C', 'DIE CUT'])
})

test('deduplicates repeated plate names', () => {
  const xmp = `<xmpTPg:PlateNames><rdf:Seq>
    <rdf:li>Cyan</rdf:li><rdf:li>Cyan</rdf:li>
  </rdf:Seq></xmpTPg:PlateNames>`
  expect(parsePlateNamesFromXmp(xmp)).toEqual(['Cyan'])
})

test('a file with no PlateNames block yields empty groups, not an error', () => {
  const result = extractPlates(Buffer.from('%PDF-1.7 no metadata here', 'latin1'))
  expect(result).toEqual({ inks: [], finishes: [], structural: [], raw: [] })
})

test('probeArtwork reports a real PDF as compatible with its page count', async () => {
  const pdf = await PDFDocument.create()
  pdf.addPage([595, 842])
  pdf.addPage([595, 842])
  const probe = await probeArtwork(Buffer.from(await pdf.save()))
  expect(probe).toEqual({ aiCompatible: true, pageCount: 2 })
})

test('probeArtwork reports a non-PDF as incompatible without throwing', async () => {
  const probe = await probeArtwork(Buffer.from('this is not a pdf at all'))
  expect(probe).toEqual({ aiCompatible: false, pageCount: null })
})
