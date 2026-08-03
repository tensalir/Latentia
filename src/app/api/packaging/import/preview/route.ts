import { NextRequest, NextResponse } from 'next/server'
import { packagingError, translateAccessError } from '@/lib/packaging/api'
import { requirePackagingWrite } from '@/lib/packaging/service'
import { PackagingWorkbookError, parsePackagingWorkbook } from '@/lib/packaging/workbook-import'
import { actionableDiffs } from '@/lib/packaging/workbook-diff'
import { diffAgainstPacket, resolveWorkbookTarget } from '@/lib/packaging/workbook-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_BYTES = 15 * 1024 * 1024

/**
 * Parse an uploaded workbook and show what importing it WOULD change. No
 * writes — the user approves the diff before anything is applied.
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

  try {
    const parsed = parsePackagingWorkbook(buffer, file.name)
    const target = await resolveWorkbookTarget({ parsed, explicitPacketId: packetId })

    // Nothing to diff against yet — everything in the sheet is new.
    if (!target.packet) {
      return NextResponse.json({
        fileName: file.name,
        target: { packetId: null, wouldCreate: target.wouldCreate, note: target.note },
        diagnostics: parsed.diagnostics,
        diff: null,
        summary: {
          apply: 0,
          componentsInSheet: parsed.components.length,
        },
      })
    }

    const diff = await diffAgainstPacket({ parsed, packet: target.packet })
    return NextResponse.json({
      fileName: file.name,
      target: {
        packetId: target.packet.id,
        projectName: target.packet.project.name,
        stage: target.packet.stage,
        variant: target.packet.variant,
        note: target.note,
      },
      diagnostics: parsed.diagnostics,
      diff: {
        changes: actionableDiffs(diff),
        counts: diff.counts,
        newComponentSlugs: diff.newComponentSlugs,
        unknownComponentSlugs: diff.unknownComponentSlugs,
        untouchedComponentSlugs: diff.untouchedComponentSlugs,
      },
      summary: {
        apply: diff.counts.apply,
        componentsInSheet: parsed.components.length,
      },
    })
  } catch (err) {
    if (err instanceof PackagingWorkbookError) {
      return packagingError(err.message, { status: 422, extra: { hint: err.hint } })
    }
    const translated = translateAccessError(err)
    if (translated) return translated
    throw err
  }
}
