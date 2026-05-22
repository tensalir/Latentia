import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { downloadPackagingFile } from '@/lib/packaging/signed-upload'
import { extractPlates } from '@/lib/packaging/plates'
import { validatePlatesAgainstLibrary } from '@/lib/packaging/materials'
import { requirePackagingWrite } from '@/lib/packaging/service'
import { packagingError } from '@/lib/packaging/api'

export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requirePackagingWrite()
  if (!auth.profile) return auth.response

  try {
    const artwork = await prisma.packagingArtwork.findUnique({
      where: { id: params.id },
      include: { component: true },
    })
    if (!artwork) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const buf = await downloadPackagingFile(artwork.storagePath)
    const plates = await extractPlates(buf)
    const validation = await validatePlatesAgainstLibrary(plates)

    const updated = await prisma.packagingArtwork.update({
      where: { id: params.id },
      data: {
        extractedPlates: plates as object,
        extractedAt: new Date(),
        mismatchedMaterialIds: validation.mismatchedIds as object,
      },
    })

    return NextResponse.json({ artwork: updated, plates, validation })
  } catch (err) {
    return packagingError(err)
  }
}
