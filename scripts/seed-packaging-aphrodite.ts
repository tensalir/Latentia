/**
 * Dev seed: the Aphrodite EVT / Black packet from a real stage folder.
 *
 *   npm run packaging:seed-aphrodite -- "C:/path/to/ana-packaging-vesper"
 *
 * Creates the project and packet, selects the components the artwork implies,
 * then uploads each file and syncs plate data through the SAME code path the
 * API uses — so a successful seed also proves upload + extraction work against
 * real artwork. Idempotent: re-running refreshes the same packet.
 *
 * Requires `packaging:seed-catalogue` to have run first.
 */

import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { PrismaClient } from '@prisma/client'
import { extractPlates, probeArtwork } from '../src/lib/packaging/plates'
import { matchComponentSlug, stemOf } from '../src/lib/packaging/naming'
import { slugifyProjectName } from '../src/lib/packaging/catalogue'
import { artworkStoragePath } from '../src/lib/packaging/storage'
import { uploadPackagingBuffer } from '../src/lib/packaging/signed-upload'

const prisma = new PrismaClient()

const SAMPLE_DIR = process.argv[2] ?? process.env.PACKAGING_SAMPLE_DIR
const PROJECT = { name: 'Aphrodite', productType: 'Sleep Mask', internalRef: 'A120' }
const STAGE = 'EVT'
const VARIANT = 'Black'

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
  if (!SAMPLE_DIR) {
    console.error('Usage: npm run packaging:seed-aphrodite -- "<path to stage folder>"')
    process.exit(1)
  }

  const catalogue = await prisma.packagingComponentType.findMany()
  if (catalogue.length === 0) {
    console.error('Catalogue is empty — run `npm run packaging:seed-catalogue` first.')
    process.exit(1)
  }

  const owner =
    (await prisma.profile.findFirst({
      where: { deletedAt: null, packagingAccess: true },
      select: { id: true, username: true },
    })) ??
    (await prisma.profile.findFirst({
      where: { deletedAt: null, role: 'admin' },
      select: { id: true, username: true },
    }))
  if (!owner) {
    console.error('No admin or packaging-access profile found to own the seed data.')
    process.exit(1)
  }
  console.log(`Owner: ${owner.username ?? owner.id}`)

  const slug = slugifyProjectName(PROJECT.name)
  const project = await prisma.packagingProject.upsert({
    where: { slug },
    create: {
      ...PROJECT,
      slug,
      supplier: 'Sample supplier',
      packagingDesignerName: 'Anna',
      graphicDesignerName: 'Delia',
      packagingEngineerName: 'Packaging Engineer',
      ownerId: owner.id,
    },
    update: { ...PROJECT },
  })

  const packet = await prisma.packagingPacket.upsert({
    where: { projectId_stage_variant: { projectId: project.id, stage: STAGE, variant: VARIANT } },
    create: {
      projectId: project.id,
      stage: STAGE,
      variant: VARIANT,
      skuCode: VARIANT,
      artworkDate: new Date('2026-07-16T00:00:00.000Z'),
      ownerId: owner.id,
    },
    update: { artworkDate: new Date('2026-07-16T00:00:00.000Z') },
  })
  console.log(`Packet: ${project.name} ${packet.stage} / ${packet.variant}\n`)

  const files = walk(SAMPLE_DIR)
  const slugs = catalogue.map((c) => c.slug)
  const aiFiles = files.filter(
    (f) => f.toLowerCase().endsWith('.ai') && f.replace(/\\/g, '/').includes('/Print_Files/')
  )
  const mockups = files.filter((f) => /Reference_Images.*\.(png|jpg|jpeg)$/i.test(f.replace(/\\/g, '/')))

  let order = 0
  for (const file of aiFiles) {
    const fileName = file.replace(/^.*[\\/]/, '')
    const matched = matchComponentSlug(fileName, slugs)
    if (!matched) {
      console.log(`skip (no catalogue match): ${fileName}`)
      continue
    }
    const type = catalogue.find((c) => c.slug === matched)!
    order += 1

    const component = await prisma.packagingPacketComponent.upsert({
      where: { packetId_componentTypeId: { packetId: packet.id, componentTypeId: type.id } },
      create: {
        packetId: packet.id,
        componentTypeId: type.id,
        displayName: type.displayName,
        includeInCreativeIntent: type.defaultInCreativeIntent,
        pageOrder: order,
        material: '450gr Simwhite Paper',
        printingMethod: 'Offset',
        coatingMsdsRef: 'Water Based Coating',
        paperThickness: '450 gsm',
      },
      update: { pageOrder: order },
    })

    // Upload + register exactly as the API route does, so plate extraction is
    // exercised on real artwork rather than stubbed.
    const buffer = readFileSync(file)
    const probe = await probeArtwork(buffer)
    const plates = extractPlates(buffer)
    const path = artworkStoragePath({
      projectSlug: project.slug,
      packetId: packet.id,
      componentSlug: type.slug,
      kind: 'editable_ai',
      fileName,
    })
    await uploadPackagingBuffer({ path, buffer, contentType: 'application/pdf' })
    await prisma.packagingArtwork.deleteMany({
      where: { packetComponentId: component.id, kind: 'editable_ai' },
    })
    await prisma.packagingArtwork.create({
      data: {
        packetId: packet.id,
        packetComponentId: component.id,
        kind: 'editable_ai',
        fileName,
        storagePath: path,
        mimeType: 'application/pdf',
        byteSize: buffer.byteLength,
        pageCount: probe.pageCount,
        aiCompatible: probe.aiCompatible,
        extractedPlates: plates as unknown as object,
        extractedAt: new Date(),
        uploadedBy: owner.id,
      },
    })
    await prisma.packagingPacketComponent.update({
      where: { id: component.id },
      data: {
        inks: plates.inks,
        finishes: plates.finishes,
        structuralPlates: plates.structural,
        printPartNumber: stemOf(fileName),
        platesSyncedAt: new Date(),
      },
    })

    // Matching mockup, if the Reference_Images folder has one.
    const mockup = mockups.find((m) => m.replace(/^.*[\\/]/, '').startsWith(type.slug))
    if (mockup) {
      const mockName = mockup.replace(/^.*[\\/]/, '')
      const mockBuffer = readFileSync(mockup)
      const mockPath = artworkStoragePath({
        projectSlug: project.slug,
        packetId: packet.id,
        componentSlug: type.slug,
        kind: 'mockup',
        fileName: mockName,
      })
      await uploadPackagingBuffer({
        path: mockPath,
        buffer: mockBuffer,
        contentType: mockName.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
      })
      await prisma.packagingArtwork.deleteMany({
        where: { packetComponentId: component.id, kind: 'mockup' },
      })
      await prisma.packagingArtwork.create({
        data: {
          packetId: packet.id,
          packetComponentId: component.id,
          kind: 'mockup',
          fileName: mockName,
          storagePath: mockPath,
          mimeType: mockName.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
          byteSize: mockBuffer.byteLength,
          uploadedBy: owner.id,
        },
      })
    }

    console.log(
      `${type.slug.padEnd(26)} inks=${plates.inks.length} finishes=${plates.finishes.length} ` +
        `structural=${plates.structural.length} pages=${probe.pageCount ?? '-'}${mockup ? ' +mockup' : ''}`
    )
  }

  // A planned component with no files — the "[no artwork]" path must survive
  // a real generate run, not just a unit test.
  const closure = catalogue.find((c) => c.slug === 'Closure_Sticker')
  if (closure) {
    await prisma.packagingPacketComponent.upsert({
      where: { packetId_componentTypeId: { packetId: packet.id, componentTypeId: closure.id } },
      create: {
        packetId: packet.id,
        componentTypeId: closure.id,
        displayName: closure.displayName,
        pageOrder: order + 1,
        engineerNotes: 'Artwork not ready yet — planned for this stage.',
      },
      update: {},
    })
    console.log(`${closure.slug.padEnd(26)} (planned, no artwork)`)
  }

  const total = await prisma.packagingPacketComponent.count({ where: { packetId: packet.id } })
  console.log(`\nSeeded ${total} components. Open /product/packaging?packet=${packet.id}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
