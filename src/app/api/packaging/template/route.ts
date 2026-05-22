import { NextResponse } from 'next/server'
import { buildPackagingTemplateWorkbook } from '@/lib/packaging/template'
import { requireAuthenticatedProfile } from '@/lib/packaging/service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAuthenticatedProfile()
  if (!auth.profile) return auth.response

  const buffer = buildPackagingTemplateWorkbook()
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="Loop_Packaging_Creative_Intent_TEMPLATE.xlsx"',
    },
  })
}
