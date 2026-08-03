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
        description: entry.description ?? null,
        printed: entry.printed,
        defaultInCreativeIntent: entry.defaultInCreativeIntent,
        sortOrder: entry.sortOrder,
        active: entry.active,
      },
      // Existing rows: refresh curated metadata but respect an admin's
      // active/sortOrder choices made in the UI.
      update: {
        code: entry.code,
        displayName: entry.displayName,
        description: entry.description ?? null,
        printed: entry.printed,
        defaultInCreativeIntent: entry.defaultInCreativeIntent,
      },
    })
    if (existing) updated++
    else created++
  }
  console.log(`Catalogue seeded: ${created} created, ${updated} updated.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
