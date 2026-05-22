import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { uploadBase64ToStorage } from '@/lib/supabase/storage'
import { parsePackagingWorkbook, PackagingXlsxParseError } from '@/lib/packaging/xlsx'
import { normaliseParsedWorkbook } from '@/lib/packaging/schema'
import {
  createPacketFromWorkbook,
  logPackagingActivity,
  requirePackagingWrite,
} from '@/lib/packaging/service'
import { packagingError } from '@/lib/packaging/api'
import { PACKAGING_STORAGE_BUCKET, importStoragePath } from '@/lib/packaging/storage'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 10 * 1024 * 1024

export async function POST(request: NextRequest) {
  const auth = await requirePackagingWrite()
  if (!auth.profile) return auth.response

  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file required' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Workbook too large (max 10 MB)' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const parsed = parsePackagingWorkbook(buffer)
    const normalized = normaliseParsedWorkbook(parsed)

    const importRow = await prisma.packagingImport.create({
      data: {
        ownerId: auth.profile.userId,
        fileName: file.name,
        status: 'parsed',
        rowCount: normalized.components.length,
        diagnostics: normalized.diagnostics as object,
      },
    })

    const path = importStoragePath(auth.profile.userId, importRow.id)
    try {
      const dataUrl = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${buffer.toString('base64')}`
      await uploadBase64ToStorage(dataUrl, PACKAGING_STORAGE_BUCKET, path)
      await prisma.packagingImport.update({
        where: { id: importRow.id },
        data: { storagePath: path },
      })
    } catch (e) {
      console.warn('[packaging/import] storage upload failed', e)
    }

    const packetName = (form.get('packetName') as string) || undefined
    const { packet } = await createPacketFromWorkbook({
      ownerId: auth.profile.userId,
      importId: importRow.id,
      normalized,
      packetName,
    })

    await logPackagingActivity({
      packetId: packet!.id,
      userId: auth.profile.userId,
      action: 'imported_workbook',
      metadata: { fileName: file.name },
    })

    return NextResponse.json({
      import: importRow,
      packet,
      diagnostics: normalized.diagnostics,
    })
  } catch (err) {
    if (err instanceof PackagingXlsxParseError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    return packagingError(err)
  }
}
