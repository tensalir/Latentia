/**
 * Seed the Packaging Studio master components library (idempotent — safe to
 * re-run in prod; upserts by slug and never deletes).
 *
 *   npm run packaging:seed-catalogue
 */

import { PrismaClient } from '@prisma/client'
import { CATALOGUE_SEED } from '../src/lib/packaging/catalogue'

const prisma = new PrismaClient()

async function main() {
  let created = 0
  let updated = 0
  for (const entry of CATALOGUE_SEED) {
    const existing = await prisma.packagingComponentType.findUnique({
      where: { slug: entry.slug },
      select: { id: true },
    })
    await prisma.packagingComponentType.upsert({
      where: { slug: entry.slug },
      create: {
        code: entry.code,
        slug: entry.slug,
        displayName: entry.displayName,
        description: entry.description,
        printed: entry.printed,
        style: entry.style,
        defaultInCreativeIntent: true,
        sortOrder: entry.sortOrder,
        active: true,
      },
      // Existing rows: refresh everything. Every entry here is in Anna's real
      // library, so it belongs in the picker and in her C-number order —
      // including rows an earlier guessed seed had wrongly parked as inactive.
      update: {
        code: entry.code,
        displayName: entry.displayName,
        description: entry.description,
        printed: entry.printed,
        style: entry.style,
        sortOrder: entry.sortOrder,
        active: true,
      },
    })
    if (existing) updated++
    else created++
  }

  // Entries invented before Anna's real library was available. Deactivated
  // rather than deleted: a packet may already reference one.
  const NOT_IN_ANNAS_LIBRARY = ['Sticker', 'Master_Carton']
  const retired = await prisma.packagingComponentType.updateMany({
    where: { slug: { in: NOT_IN_ANNAS_LIBRARY }, active: true },
    data: { active: false },
  })

  console.log(`Catalogue seeded: ${created} created, ${updated} updated.`)
  if (retired.count > 0) {
    console.log(`Deactivated ${retired.count} entry/entries not in Anna's library.`)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
