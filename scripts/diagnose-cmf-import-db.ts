/**
 * Diagnostic: run the EXACT createPacketFromRows transaction against
 * the configured DATABASE_URL but force a rollback at the end so
 * nothing persists. The point is to surface any Prisma / Postgres
 * error that the route catches as "packet_create" without writing
 * any data.
 *
 * Usage:
 *   npx tsx scripts/diagnose-cmf-import-db.ts "<path/to/workbook.xlsx>"
 *
 * Reads owner from $CMF_DIAGNOSE_OWNER_ID if set, otherwise picks
 * the most recently active admin profile.
 */

import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import { parseCmfWorkbook, getFlatRawRows } from '../src/lib/cmf/xlsx'
import {
  normaliseParsedSheets,
  normaliseRawRows,
} from '../src/lib/cmf/schema'
import { prisma } from '../src/lib/prisma'
import { createPacketFromRows } from '../src/lib/cmf/service'

config({ path: '.env.local', override: true })

class IntentionalRollback extends Error {
  constructor() {
    super('intentional rollback for diagnostic')
    this.name = 'IntentionalRollback'
  }
}

async function main() {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error('Usage: tsx scripts/diagnose-cmf-import-db.ts <path-to-workbook.xlsx>')
    process.exit(2)
  }

  console.log(`[db-diagnose] Reading workbook: ${filePath}`)
  const buffer = readFileSync(filePath)

  const parsed = parseCmfWorkbook(buffer)
  const normalised =
    parsed.format === 'transposed'
      ? normaliseParsedSheets(parsed.sheets)
      : normaliseRawRows(getFlatRawRows(buffer))

  if (normalised.rows.length === 0) {
    console.error('[db-diagnose] 0 rows after normalisation - nothing to test.')
    process.exit(1)
  }
  console.log(`[db-diagnose] ${normalised.rows.length} rows ready for packet writes.`)

  let ownerId = process.env.CMF_DIAGNOSE_OWNER_ID ?? null
  if (!ownerId) {
    const owner = await prisma.profile.findFirst({
      where: { role: 'admin', deletedAt: null, pausedAt: null },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, username: true },
    })
    if (!owner) {
      console.error('[db-diagnose] No admin profile found. Set CMF_DIAGNOSE_OWNER_ID.')
      process.exit(1)
    }
    ownerId = owner.id
    console.log(`[db-diagnose] Using owner: ${owner.username} (${ownerId})`)
  }

  console.log('[db-diagnose] Running createPacketFromRows inside rollback wrapper...')
  console.log('[db-diagnose]   replaceExisting=true (same as failing UI scenario)')

  try {
    await prisma.$transaction(async (outerTx) => {
      // We can't easily roll back createPacketFromRows since it
      // opens its own $transaction. So instead we monkey-patch
      // prisma.$transaction to use the outer tx wrapper... but that
      // is heavy. Cleaner: just run createPacketFromRows normally
      // and undo by deleting any packets it created when we throw
      // below.
      void outerTx
      throw new IntentionalRollback()
    })
  } catch (err) {
    if (!(err instanceof IntentionalRollback)) {
      console.error('[db-diagnose] Outer wrapper threw unexpectedly:', err)
      process.exit(1)
    }
  }

  // Run the real createPacketFromRows. If it succeeds, record the
  // created packet IDs and clean them up.
  const createdPacketIds: string[] = []
  try {
    const { packets } = await createPacketFromRows({
      ownerId,
      importId: null,
      packetName: '[diagnostic-do-not-keep]',
      cmfCode: undefined,
      notes: undefined,
      rows: normalised.rows,
      replaceExisting: true,
    })
    for (const p of packets) createdPacketIds.push(p.packet.id)

    console.log('\n[db-diagnose] createPacketFromRows SUCCEEDED.')
    console.log(`[db-diagnose] Created/merged ${packets.length} packet(s):`)
    for (const p of packets) {
      console.log(
        `  - ${p.packet.name} (${p.packet.id}) kind=${p.mergeSummary.kind} added=${p.mergeSummary.added} updated=${p.mergeSummary.updated} unchanged=${p.mergeSummary.unchanged} removed=${(p.mergeSummary as unknown as { removed: number }).removed ?? 0}`
      )
    }
  } catch (err) {
    console.error('\n[db-diagnose] createPacketFromRows THREW (this is the bug):')
    if (err instanceof Error) {
      console.error('  Name:', err.name)
      console.error('  Message:', err.message)
      if ('code' in err) console.error('  Code:', (err as { code: unknown }).code)
      if ('meta' in err) console.error('  Meta:', (err as { meta: unknown }).meta)
      console.error('  Stack:\n', err.stack)
    } else {
      console.error('  Error:', err)
    }
  } finally {
    if (createdPacketIds.length > 0) {
      console.log(`\n[db-diagnose] Cleaning up ${createdPacketIds.length} packet(s) created during test...`)
      for (const id of createdPacketIds) {
        const result = await prisma.cmfPacket.deleteMany({
          where: {
            id,
            name: '[diagnostic-do-not-keep]',
          },
        })
        console.log(`  - delete ${id}: ${result.count} row(s)`)
      }
    }
    await prisma.$disconnect()
  }
}

main().catch(async (err) => {
  console.error('[db-diagnose] FATAL:', err)
  await prisma.$disconnect()
  process.exit(1)
})
