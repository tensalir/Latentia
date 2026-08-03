import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { packagingError, translateAccessError } from '@/lib/packaging/api'
import { logPackagingActivity, requirePackagingWrite } from '@/lib/packaging/service'
import { PackagingWorkbookError, parsePackagingWorkbook } from '@/lib/packaging/workbook-import'
import { applyWorkbook } from '@/lib/packaging/workbook-service'
import { importStoragePath } from '@/lib/packaging/storage'
import { uploadPackagingBuffer } from '@/lib/packaging/signed-upload'
import { getPacketOrThrow } from '@/lib/packaging/service'
import { serializePacket } from '@/lib/packaging/serialize'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_BYTES = 15 * 1024 * 1024

/**
 * Commit a workbook. Idempotent by (project, stage, SKU/colourway): importing
 * the same file twice updates the same packet instead of duplicating it.
 */
export async function POST(request: NextRequest) {
  const auth = await requirePackagingWrite()
  if (!auth.profile) return auth.response

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return packagingError('Expected a multipart upload with a `file` field.')
  }

  const file = form.get('file')
  if (!(file instanceof File)) return packagingError('No file received.')
  if (file.size > MAX_BYTES) {
    return packagingError('That workbook is larger than 15 MB.', { status: 413 })
  }
  const packetId = typeof form.get('packetId') === 'string' ? String(form.get('packetId')) : null

  const buffer = Buffer.from(await file.arrayBuffer())

  const record = await prisma.packagingImport.create({
    data: {
      ownerId: auth.profile.userId,
      fileName: file.name,
      status: 'pending',
      mode: packetId ? 'upsert' : 'create',
      packetId,
    },
  })

  try {
    const parsed = parsePackagingWorkbook(buffer, file.name)
    const result = await applyWorkbook({
      parsed,
      packetId,
      ownerId: auth.profile.userId,
    })

    // Keep the source file so a bad import can be traced back to its workbook.
    let storagePath: string | null = null
    try {
      storagePath = importStoragePath(auth.profile.userId, record.id)
      await uploadPackagingBuffer({
        path: storagePath,
        buffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
    } catch {
      storagePath = null // archiving is best-effort; the import already applied
    }

    await prisma.packagingImport.update({
      where: { id: record.id },
      data: {
        status: 'applied',
        packetId: result.packetId,
        storagePath,
        diagnostics: parsed.diagnostics as unknown as object,
        diffSummary: result as unknown as object,
      },
    })
    await prisma.packagingPacket.update({
      where: { id: result.packetId },
      data: { lastImportId: record.id },
    })

    await logPackagingActivity({
      packetId: result.packetId,
      userId: auth.profile.userId,
      action: result.created ? 'imported_workbook_created' : 'imported_workbook',
      metadata: {
        fileName: file.name,
        appliedFields: result.appliedFields,
        addedComponents: result.addedComponents.length,
        skippedMachineFields: result.skippedMachineFields,
      },
    })

    const packet = await getPacketOrThrow(result.packetId)
    return NextResponse.json({
      result,
      diagnostics: parsed.diagnostics,
      packet: await serializePacket(packet),
    })
  } catch (err) {
    await prisma.packagingImport.update({
      where: { id: record.id },
      data: {
        status: 'failed',
        diagnostics: [err instanceof Error ? err.message : 'Unknown error'] as unknown as object,
      },
    })
    if (err instanceof PackagingWorkbookError) {
      return packagingError(err.message, { status: 422, extra: { hint: err.hint } })
    }
    const translated = translateAccessError(err)
    if (translated) return translated
    throw err
  }
}
