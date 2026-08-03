import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { packagingError } from '@/lib/packaging/api'
import { requirePackagingWrite } from '@/lib/packaging/service'
import { signedUploadRequestSchema, zodDetails } from '@/lib/packaging/schema'
import { artworkStoragePath } from '@/lib/packaging/storage'
import { createPackagingSignedUpload } from '@/lib/packaging/signed-upload'
import { validateArtworkName } from '@/lib/packaging/naming'

export const dynamic = 'force-dynamic'

interface Params {
  params: { id: string }
}

/**
 * Issue a signed URL so the browser PUTs the file straight to Supabase.
 * Editable .ai files are far too large to round-trip through a route handler.
 *
 * Naming problems come back as `nameWarnings` — advisory, never blocking. The
 * convention drives machine matching quality, so the uploader should hear
 * about it, but a loosely named file still uploads.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requirePackagingWrite()
  if (!auth.profile) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return packagingError('Invalid JSON body')
  }

  const parsed = signedUploadRequestSchema.safeParse(body)
  if (!parsed.success) {
    return packagingError('Invalid request body', { details: zodDetails(parsed.error) })
  }

  const packet = await prisma.packagingPacket.findUnique({
    where: { id: params.id },
    include: {
      project: { select: { slug: true } },
      components: { include: { componentType: { select: { slug: true } } } },
    },
  })
  if (!packet) return packagingError('Packet not found', { status: 404 })

  const { kind, fileName, packetComponentId } = parsed.data
  let componentSlug: string | null = null
  if (kind !== 'overview') {
    if (!packetComponentId) {
      return packagingError('packetComponentId is required for component artwork.')
    }
    const component = packet.components.find((c) => c.id === packetComponentId)
    if (!component) return packagingError('Component not found on this packet', { status: 404 })
    componentSlug = component.componentType.slug
  }

  const path = artworkStoragePath({
    projectSlug: packet.project.slug,
    packetId: packet.id,
    componentSlug,
    kind,
    fileName,
  })

  const nameWarnings =
    kind === 'editable_ai' && componentSlug
      ? validateArtworkName(fileName, {
          expectedSlug: componentSlug,
          knownSlugs: packet.components.map((c) => c.componentType.slug),
          expectedStage: packet.stage,
        }).problems
      : []

  try {
    const signed = await createPackagingSignedUpload({ path })
    return NextResponse.json({ ...signed, nameWarnings })
  } catch (err) {
    return packagingError(err instanceof Error ? err.message : 'Could not create upload URL', {
      status: 500,
    })
  }
}
