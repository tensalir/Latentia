/**
 * Run the generation pipeline against a real stage folder, no database needed.
 *
 *   npm run packaging:smoke -- "C:/path/to/ana-packaging-vesper"
 *
 * Reads every .ai under Print_Files/, extracts plate names, stamps a supplier
 * PDF for each, and composes a Creative Intent from the lot. Outputs land in
 * `tmp/packaging-smoke/` for eyeballing. This is the fastest way to confirm the
 * pipeline still handles Anna's actual artwork after a change.
 */

import { readdirSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join, relative } from 'path'
import { buildCreativeIntentPdf, type CreativeIntentComponent } from '../src/lib/packaging/creative-intent-pdf'
import { buildSupplierPdf } from '../src/lib/packaging/supplier-pdf'
import { extractPlates, probeArtwork } from '../src/lib/packaging/plates'
import { matchComponentSlug, stemOf } from '../src/lib/packaging/naming'
import { CATALOGUE_SEED } from '../src/lib/packaging/catalogue'
import { formatDateEu } from '../src/lib/packaging/format'

const sampleDir = process.argv[2] ?? process.env.PACKAGING_SAMPLE_DIR
if (!sampleDir) {
  console.error('Usage: npm run packaging:smoke -- "<path to stage folder>"')
  process.exit(1)
}

const OUT_DIR = join(process.cwd(), 'tmp', 'packaging-smoke')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const files = walk(sampleDir)
  const slugs = CATALOGUE_SEED.map((c) => c.slug)

  const aiFiles = files.filter(
    (f) => f.toLowerCase().endsWith('.ai') && f.replace(/\\/g, '/').includes('/Print_Files/')
  )
  const mockups = files.filter((f) => /Reference_Images.*\.png$/i.test(f.replace(/\\/g, '/')))

  console.log(`Found ${aiFiles.length} editable .ai files, ${mockups.length} mockups.\n`)

  const components: CreativeIntentComponent[] = []
  let stamped = 0
  let incompatible = 0

  for (const file of aiFiles) {
    const fileName = file.replace(/^.*[\\/]/, '')
    const slug = matchComponentSlug(fileName, slugs)
    const buffer = readFileSync(file)
    const probe = await probeArtwork(buffer)
    const plates = extractPlates(buffer)

    console.log(`${slug ?? '(unmatched)'}  ${fileName}`)
    console.log(
      `   pdf-compatible=${probe.aiCompatible} pages=${probe.pageCount ?? '-'}` +
        `  inks=${plates.inks.length} finishes=${plates.finishes.length} structural=${plates.structural.length}`
    )
    if (plates.raw.length > 0) {
      console.log(`   inks:       ${plates.inks.join(', ') || '—'}`)
      console.log(`   finishes:   ${plates.finishes.join(', ') || '—'}`)
      console.log(`   structural: ${plates.structural.join(', ') || '—'}`)
    } else {
      console.log('   (no PlateNames metadata in this file)')
    }

    const displayName =
      CATALOGUE_SEED.find((c) => c.slug === slug)?.displayName ?? slug ?? stemOf(fileName)

    if (probe.aiCompatible) {
      const { bytes, pageCount } = await buildSupplierPdf({
        artwork: buffer,
        data: {
          projectName: 'Aphrodite',
          partName: displayName,
          date: formatDateEu('2026-07-16'),
          packagingDesigner: 'Anna',
          packagingEngineer: 'Packaging Engineer',
          graphicDesigner: 'Delia',
          stage: 'EVT',
          material: '450gr Simwhite Paper',
          printingMethod: 'Offset',
          coatingMsdsRef: 'Water Based Coating',
          skuCode: 'Black',
          inks: plates.inks,
          finishes: plates.finishes,
          structural: plates.structural,
        },
      })
      const outPath = join(OUT_DIR, `${stemOf(fileName)}_supplier.pdf`)
      writeFileSync(outPath, bytes)
      stamped++
      console.log(`   -> supplier PDF: ${relative(process.cwd(), outPath)} (${pageCount} pages)`)
    } else {
      incompatible++
      console.log('   -> skipped: not PDF-compatible')
    }

    const mockup = slug ? mockups.find((m) => m.includes(slug)) : undefined
    components.push({
      displayName,
      code: CATALOGUE_SEED.find((c) => c.slug === slug)?.code ?? null,
      printed: true,
      material: '450gr Simwhite Paper',
      printingMethod: 'Offset',
      coatingMsdsRef: 'Water Based Coating',
      paperThickness: '450 gsm',
      drawingPartNumber: null,
      approvalStatus: 'Draft',
      engineerNotes: null,
      inks: plates.inks,
      finishes: plates.finishes,
      structural: plates.structural,
      printPartNumber: stemOf(fileName),
      mockupBytes: mockup ? new Uint8Array(readFileSync(mockup)) : null,
      artworkBytes: probe.aiCompatible ? new Uint8Array(buffer) : null,
      packSteps: [],
    })
    console.log('')
  }

  // A component with no files at all must still render — Anna's "planned part
  // is not an error" rule. Add one so the placeholder path is exercised.
  components.push({
    displayName: 'Closure sticker',
    code: null,
    printed: true,
    material: null,
    printingMethod: null,
    coatingMsdsRef: null,
    paperThickness: null,
    drawingPartNumber: null,
    approvalStatus: 'Draft',
    engineerNotes: 'Artwork not ready yet.',
    inks: [],
    finishes: [],
    structural: [],
    printPartNumber: null,
    mockupBytes: null,
    artworkBytes: null,
    packSteps: [
      { stepNumber: 1, instruction: 'Hold it in the middle and stick it centred.', imageBytes: null },
    ],
  })

  const overview = files.find((f) => /Overview\.(png|jpg|jpeg)$/i.test(f))
  const ci = await buildCreativeIntentPdf({
    projectName: 'Aphrodite',
    productType: 'Sleep Mask',
    supplier: 'Supplier',
    stage: 'EVT',
    variant: 'Black',
    skuCode: 'Black',
    date: formatDateEu('2026-07-16'),
    packagingDesigner: 'Anna',
    graphicDesigner: 'Delia',
    packagingEngineer: 'Packaging Engineer',
    overviewBytes: overview ? new Uint8Array(readFileSync(overview)) : null,
    components,
  })
  const ciPath = join(OUT_DIR, 'Aphrodite_EVT_Creative_Intent_Black.pdf')
  writeFileSync(ciPath, ci)

  console.log('─'.repeat(60))
  console.log(`Supplier PDFs stamped: ${stamped}${incompatible ? `, skipped: ${incompatible}` : ''}`)
  console.log(`Creative Intent: ${relative(process.cwd(), ciPath)} (${components.length + 1} pages)`)
  if (!overview) console.log('No overview render found (.psd is not readable) — cover shows a placeholder.')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
