/**
 * Diagnostic: simulate the CMF import route locally against a real
 * workbook so we can see exactly which step throws when the route
 * returns "Workbook parsed but packet creation failed".
 *
 * Usage:
 *   npx tsx scripts/diagnose-cmf-import.ts "<path/to/workbook.xlsx>"
 *
 * It does NOT touch the database. It just reproduces every pre-DB
 * computation (parse, normalise, group by product, simulate
 * createPacketFromRows) and prints whatever throws.
 */

import { readFileSync } from 'node:fs'
import { parseCmfWorkbook, XlsxParseError, getFlatRawRows } from '../src/lib/cmf/xlsx'
import {
  normaliseParsedSheets,
  normaliseRawRows,
  CmfSkuRowSchema,
} from '../src/lib/cmf/schema'
import { groupRowsByProductSlug } from '../src/lib/cmf/service'

function bail(stage: string, err: unknown): never {
  console.error(`\n[diagnose] FAILED at stage "${stage}":`)
  if (err instanceof Error) {
    console.error('  Message:', err.message)
    console.error('  Stack:\n', err.stack)
  } else {
    console.error('  Error:', err)
  }
  process.exit(1)
}

async function main() {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error('Usage: tsx scripts/diagnose-cmf-import.ts <path-to-workbook.xlsx>')
    process.exit(2)
  }

  console.log(`[diagnose] Reading workbook: ${filePath}`)
  const buffer = readFileSync(filePath)
  console.log(`[diagnose] Bytes: ${buffer.length.toLocaleString()}`)

  let parsed
  try {
    parsed = parseCmfWorkbook(buffer)
  } catch (err) {
    if (err instanceof XlsxParseError) {
      console.error(`\n[diagnose] XlsxParseError (would be 400 invalid_workbook): ${err.message}`)
      process.exit(1)
    }
    bail('parse', err)
  }

  console.log(`\n[diagnose] Parsed format: ${parsed.format}`)
  if (parsed.format === 'transposed') {
    console.log(`[diagnose] Sheets parsed: ${parsed.sheets.length}`)
    for (const sheet of parsed.sheets) {
      console.log(
        `  - ${sheet.sheetName}: ${sheet.skus.length} sku(s) -> ${sheet.productSlug}`
      )
    }
    if (parsed.unmappedSheets.length > 0) {
      console.log(`[diagnose] Unmapped sheets:`, parsed.unmappedSheets)
    }
    if (parsed.unrecognisedSheets.length > 0) {
      console.log(`[diagnose] Unrecognised sheets:`, parsed.unrecognisedSheets)
    }
    if (parsed.droppedSkuColumns.length > 0) {
      console.log(`[diagnose] Dropped SKU columns: ${parsed.droppedSkuColumns.length}`)
    }
  }

  let normalised
  try {
    if (parsed.format === 'transposed') {
      normalised = normaliseParsedSheets(parsed.sheets)
    } else {
      normalised = normaliseRawRows(getFlatRawRows(buffer))
    }
  } catch (err) {
    bail('normalise', err)
  }

  console.log(`\n[diagnose] Normalised rows: ${normalised.rows.length}`)
  console.log(`[diagnose] Normalisation errors: ${normalised.errors.length}`)
  if (normalised.errors.length > 0) {
    console.log('[diagnose] First 5 errors:')
    for (const err of normalised.errors.slice(0, 5)) {
      console.log(`  - row ${err.rowIndex} [${err.sheetName ?? '-'}] ${err.field ?? '-'}: ${err.message}`)
    }
  }

  if (normalised.rows.length === 0) {
    console.log('\n[diagnose] No rows would land — server would return early with 200 + empty result.')
    return
  }

  // Per-row re-validation through Zod to catch anything that the
  // normaliser allowed through but Prisma would reject.
  console.log('\n[diagnose] Per-row Zod re-validation:')
  let rowIssues = 0
  normalised.rows.forEach((row, idx) => {
    const parsed = CmfSkuRowSchema.safeParse(row)
    if (!parsed.success) {
      rowIssues++
      console.log(`  - row ${idx} (${row.label}):`)
      for (const issue of parsed.error.issues) {
        console.log(`      ${issue.path.join('.')}: ${issue.message}`)
      }
    }
  })
  if (rowIssues === 0) console.log('  All rows pass Zod re-validation.')

  // Simulate the per-product grouping that createPacketFromRows does.
  const buckets = groupRowsByProductSlug(normalised.rows)
  console.log(`\n[diagnose] Product buckets: ${buckets.length}`)
  for (const bucket of buckets) {
    console.log(`  - ${bucket.productSlug}: ${bucket.rows.length} row(s)`)
    // Sample one row's component shape so we can spot weird payloads.
    const sample = bucket.rows[0]
    console.log(
      `      sample label="${sample.label}" code=${sample.productCode ?? 'null'} components=${sample.components.length}`
    )
    for (const c of sample.components) {
      const keys = Object.keys(c).filter((k) => (c as Record<string, unknown>)[k] != null)
      console.log(`        - ${c.region} (${c.label}) [${keys.join(', ')}]`)
    }
  }

  console.log('\n[diagnose] Pre-DB path completed without throwing.')
  console.log('[diagnose] If the route fails at packet_create, the error is inside the Prisma transaction')
  console.log('[diagnose] (cmfPacket.create / cmfRender.create / cmfActivity.create / overwrite delete).')
}

main().catch((err) => bail('main', err))
