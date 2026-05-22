import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createPackagingSignedUpload } from '@/lib/packaging/signed-upload'
import { artworkStoragePath } from '@/lib/packaging/storage'
import { requirePackagingWrite, requirePacketAccess } from '@/lib/packaging/service'
import { packagingError, translateAccessError } from '@/lib/packaging/api'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requirePackagingWrite()
  if (!auth.profile) return auth.response

  try {
    await requirePacketAccess({
      packetId: params.id,
      userId: auth.profile.userId,
      minRole: 'editor',
    })

    const body = await request.json()
    const { componentSlug, kind, fileName } = body
    if (!componentSlug || !kind || !fileName) {
      return NextResponse.json({ error: 'componentSlug, kind, fileName required' }, { status: 400 })
    }

    const component = await prisma.packagingComponent.findFirst({
      where: { packetId: params.id, slug: componentSlug },
    })
    if (!component) {
      return NextResponse.json({ error: 'component not found' }, { status: 404 })
    }

    const path = artworkStoragePath({
      ownerId: auth.profile.userId,
      packetId: params.id,
      componentSlug,
      kind,
      fileName,
    })

    const signed = await createPackagingSignedUpload({ path })
    return NextResponse.json({
      storagePath: path,
      token: signed.token,
      signedUrl: signed.signedUrl,
    })
  } catch (err) {
    const access = translateAccessError(err)
    if (access) return access
    return packagingError(err)
  }
}
