/**
 * Seed Nyx_MP_Black packaging packet + approved materials + sample .ai uploads.
 *
 * Usage: npx tsx scripts/seed-packaging-nyx.ts [--owner-id=<uuid>]
 *
 * Requires DATABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL.
 * Place Archive .ai files in tmp/packaging-intake/archive/ (from Anna's zip).
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { prisma } from '../src/lib/prisma'
import { uploadPackagingBuffer } from '../src/lib/packaging/signed-upload'
import { artworkStoragePath } from '../src/lib/packaging/storage'
import { extractPlates } from '../src/lib/packaging/plates'
import { validatePlatesAgainstLibrary } from '../src/lib/packaging/materials'
import { NYX_COMPONENTS } from '../src/lib/packaging/components'

const ARCHIVE_DIR = join(process.cwd(), 'tmp', 'packaging-intake', 'archive')

const DEFAULT_MATERIALS = [
  { kind: 'ink', code: 'INK-CMYK-BLACK', name: 'Black' },
  { kind: 'ink', code: 'INK-PMS-BLK-C', name: 'PANTONE Black C' },
  { kind: 'ink', code: 'INK-PMS-7652', name: 'PANTONE 7652 C' },
  { kind: 'ink', code: 'INK-PMS-651', name: 'PANTONE 651 C' },
  { kind: 'finish', code: 'FIN-UV-GLOSS', name: 'UV GLOSS' },
  { kind: 'finish', code: 'FIN-3D-EMBOSS', name: '3D EMBOSS' },
  { kind: 'finish', code: 'FIN-CUT', name: 'CUT LINE' },
  { kind: 'finish', code: 'FIN-BEND', name: 'BEND LINE' },
]

const AI_MAP: Record<string, string> = {
  Outer_Sleeve: 'Nyx_MP_Outer_Sleeve_Black_editable.ai',
  Inner_Tray: 'Nyx_MP_Inner_Tray_editable.ai',
  Tissue_Paper: 'Nyx_MP_Tissue_Paper_editable.ai',
  Tissue_Sticker: 'Nyx_MP_Tissue_Sticker_editable.ai',
  Closure_Sticker: 'Nyx_MP_Closure_Sticker_editable.ai',
}

async function main() {
  const ownerArg = process.argv.find((a) => a.startsWith('--owner-id='))
  let ownerId = ownerArg?.split('=')[1]

  if (!ownerId) {
    const admin = await prisma.profile.findFirst({
      where: { role: 'admin' },
      select: { id: true },
    })
    if (!admin) throw new Error('No admin profile — pass --owner-id=<uuid>')
    ownerId = admin.id
  }

  console.log('Owner:', ownerId)

  for (const m of DEFAULT_MATERIALS) {
    await prisma.packagingMaterial.upsert({
      where: { kind_code: { kind: m.kind, code: m.code } },
      create: {
        kind: m.kind,
        code: m.code,
        name: m.name,
        approvalStatus: 'approved',
        approvedBy: ownerId,
        approvedAt: new Date(),
        createdBy: ownerId,
      },
      update: { name: m.name, approvalStatus: 'approved' },
    })
  }
  console.log('Materials seeded')

  const project = await prisma.packagingProject.upsert({
    where: { productSlug: 'nyx_sleep_mask' },
    create: {
      productSlug: 'nyx_sleep_mask',
      displayName: 'Nyx Sleep Mask',
      productType: 'Sleep Mask',
      productFamily: 'Sleep',
      ownerId,
    },
    update: {},
  })

  let packet = await prisma.packagingPacket.findFirst({
    where: { projectId: project.id, stage: 'MP', variant: 'Black' },
  })

  if (!packet) {
    packet = await prisma.packagingPacket.create({
      data: {
        projectId: project.id,
        ownerId,
        name: 'Nyx_MP_Black',
        stage: 'MP',
        variant: 'Black',
        status: 'review',
        projectInfo: {
          'Project Name': 'Nyx Packaging',
          'SKU / Colourway': 'Black',
          'Project Stage': 'MP',
          'Packaging Designer': 'Ana Cuesta',
        },
        components: {
          create: NYX_COMPONENTS.map((c, i) => ({
            slug: c.slug,
            displayName: c.displayName,
            style: c.style,
            pageOrder: i + 1,
            included: true,
            specs: {
              Material: 'Paperboard',
              'Approval Status': 'Draft',
            },
          })),
        },
      },
    })
    console.log('Created packet', packet.id)
  } else {
    console.log('Using existing packet', packet.id)
  }

  const components = await prisma.packagingComponent.findMany({
    where: { packetId: packet.id },
  })

  for (const comp of components) {
    const fileName = AI_MAP[comp.slug]
    if (!fileName) continue
    const filePath = join(ARCHIVE_DIR, fileName)
    if (!existsSync(filePath)) {
      console.warn('Skip (missing file):', filePath)
      continue
    }

    const buf = readFileSync(filePath)
    const path = artworkStoragePath({
      ownerId,
      packetId: packet.id,
      componentSlug: comp.slug,
      kind: 'Artwork',
      fileName,
    })

    await uploadPackagingBuffer({
      path,
      buffer: buf,
      contentType: 'application/pdf',
    })

    let extractedPlates = null
    let mismatchedMaterialIds: string[] = []
    try {
      const plates = await extractPlates(buf)
      extractedPlates = plates
      const v = await validatePlatesAgainstLibrary(plates)
      mismatchedMaterialIds = v.mismatchedIds
      console.log(comp.slug, 'plates:', plates.inks.length, 'inks', plates.finishes.length, 'finishes')
    } catch (e) {
      console.warn(comp.slug, 'plate extract failed', e)
    }

    const existing = await prisma.packagingArtwork.findFirst({
      where: { componentId: comp.id, fileName },
    })
    if (existing) {
      await prisma.packagingArtwork.update({
        where: { id: existing.id },
        data: {
          storagePath: path,
          extractedPlates: extractedPlates as object | undefined,
          extractedAt: extractedPlates ? new Date() : null,
          mismatchedMaterialIds: mismatchedMaterialIds as object,
        },
      })
    } else {
      await prisma.packagingArtwork.create({
        data: {
          componentId: comp.id,
          kind: 'Artwork',
          fileName,
          storagePath: path,
          mimeType: 'application/pdf',
          byteSize: buf.length,
          extractedPlates: extractedPlates as object | undefined,
          extractedAt: extractedPlates ? new Date() : null,
          mismatchedMaterialIds: mismatchedMaterialIds as object,
          uploadedBy: ownerId,
        },
      })
    }
    console.log('Uploaded', fileName)
  }

  await prisma.profile.update({
    where: { id: ownerId },
    data: { packagingAccess: true, packagingEngineerRole: true },
  })

  console.log('\nDone. Open /product/packaging?packet=' + packet.id)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
