import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// Use service role for storage operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const IMAGE_BUCKET = 'generated-images'
/** Video and audio references share the video bucket; both are public, which
 *  matters because Replicate fetches these URLs directly. */
const MEDIA_BUCKET = 'generated-videos'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB, matching /api/upload/reference-image

type MediaKind = 'image' | 'video' | 'audio'

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'weba',
}

function detectKind(mimeType: string): MediaKind | null {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  return null
}

function extensionFor(mimeType: string, kind: MediaKind): string {
  if (EXTENSION_BY_MIME[mimeType]) return EXTENSION_BY_MIME[mimeType]
  // Reasonable defaults for a MIME type we don't have mapped.
  return kind === 'image' ? 'jpg' : kind === 'video' ? 'mp4' : 'mp3'
}

/**
 * Upload a reference image, video, or audio clip to Supabase Storage.
 *
 * Companion to `/api/upload/reference-image`, which stays image-only for the
 * existing start/end frame flows. This endpoint backs Seedance 2.5's
 * multimodal reference sets, which accept video and audio as well.
 *
 * Like its sibling it takes multipart form data rather than base64 so large
 * files don't hit body-size limits, and it returns a public URL because the
 * provider fetches the file itself.
 */
export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = user.id

    // Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const purpose = (formData.get('purpose') as string) || 'reference'

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const kind = detectKind(file.type)
    if (!kind) {
      return NextResponse.json(
        { error: 'File must be an image, video, or audio clip' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB` },
        { status: 400 }
      )
    }

    // Generate unique path
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).slice(2, 8)
    const extension = extensionFor(file.type, kind)
    const bucket = kind === 'image' ? IMAGE_BUCKET : MEDIA_BUCKET
    const storagePath = `references/${userId}/${purpose}-${kind}-${timestamp}-${randomId}.${extension}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      )
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from(bucket)
      .getPublicUrl(storagePath)

    return NextResponse.json({
      url: publicUrlData.publicUrl,
      path: storagePath,
      bucket,
      kind,
      size: file.size,
      mimeType: file.type,
    })

  } catch (error: any) {
    console.error('Reference media upload error:', error)
    return NextResponse.json(
      { error: error.message || 'Upload failed' },
      { status: 500 }
    )
  }
}
