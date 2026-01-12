import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'
import { getPredictionStatus } from '@/lib/models/replicate-utils'

const supabaseAdmin = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { cookies: { get: () => undefined, set: () => {}, remove: () => {} } }
)

/**
 * Manual sync endpoint for stuck Replicate generations.
 * 
 * This endpoint checks the current status of a generation on Replicate
 * and updates the local database accordingly. Useful for recovering
 * generations that got stuck due to webhook failures or timeouts.
 * 
 * POST /api/generations/[id]/sync
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: generationId } = await params

    // Verify auth
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the generation
    const generation = await prisma.generation.findUnique({
      where: { id: generationId },
      include: {
        session: {
          select: {
            type: true,
            projectId: true,
          },
        },
      },
    })

    if (!generation) {
      return NextResponse.json({ error: 'Generation not found' }, { status: 404 })
    }

    // Verify ownership
    if (generation.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check if this is a Replicate generation
    const params_data = generation.parameters as any
    const predictionId = params_data?.replicatePredictionId

    if (!predictionId) {
      return NextResponse.json({ 
        error: 'Not a Replicate generation or missing prediction ID',
        generationId,
        status: generation.status,
      }, { status: 400 })
    }

    // If already completed/failed, just return current state
    if (['completed', 'failed', 'cancelled'].includes(generation.status)) {
      return NextResponse.json({
        message: 'Generation already in terminal state',
        generationId,
        status: generation.status,
        synced: false,
      })
    }

    console.log(`[Sync] Checking Replicate status for generation ${generationId}, prediction ${predictionId}`)

    // Get current status from Replicate
    const replicateStatus = await getPredictionStatus(predictionId)
    
    console.log(`[Sync] Replicate status: ${replicateStatus.status}`, {
      hasOutput: !!replicateStatus.output,
      error: replicateStatus.error,
    })

    // Handle based on Replicate status
    if (replicateStatus.status === 'succeeded') {
      // Parse output URLs
      let outputUrls: string[] = []
      if (replicateStatus.output) {
        if (Array.isArray(replicateStatus.output)) {
          outputUrls = replicateStatus.output
        } else if (typeof replicateStatus.output === 'string') {
          outputUrls = [replicateStatus.output]
        }
      }

      if (outputUrls.length === 0) {
        await prisma.generation.update({
          where: { id: generation.id },
          data: {
            status: 'failed',
            parameters: {
              ...params_data,
              error: 'Replicate succeeded but no output URLs found',
              syncedAt: new Date().toISOString(),
            },
          },
        })
        return NextResponse.json({
          message: 'Replicate succeeded but no outputs found',
          generationId,
          status: 'failed',
          synced: true,
        })
      }

      // Upload outputs to storage
      const outputRecords = []
      for (let i = 0; i < outputUrls.length; i++) {
        const outputUrl = outputUrls[i]
        let finalUrl = outputUrl

        try {
          const isVideo = generation.session.type === 'video'
          const extension = isVideo ? 'mp4' : (outputUrl.includes('.png') ? 'png' : 'jpg')
          const bucket = isVideo ? 'generated-videos' : 'generated-images'
          const storagePath = `${generation.userId}/${generation.id}/${i}.${extension}`

          console.log(`[Sync] Uploading output ${i} to ${bucket}/${storagePath}`)
          
          // Download from Replicate
          const response = await fetch(outputUrl)
          if (!response.ok) {
            throw new Error(`Failed to download: ${response.status}`)
          }
          const blob = await response.blob()
          const buffer = Buffer.from(await blob.arrayBuffer())

          // Upload to Supabase
          const { error: uploadError } = await supabaseAdmin.storage
            .from(bucket)
            .upload(storagePath, buffer, {
              contentType: isVideo ? 'video/mp4' : `image/${extension}`,
              upsert: true,
            })

          if (uploadError) {
            console.error(`[Sync] Upload error:`, uploadError)
          } else {
            const { data: { publicUrl } } = supabaseAdmin.storage
              .from(bucket)
              .getPublicUrl(storagePath)
            finalUrl = publicUrl
            console.log(`[Sync] Uploaded to: ${finalUrl}`)
          }
        } catch (uploadError: any) {
          console.error(`[Sync] Failed to upload output ${i}:`, uploadError.message)
          // Use original URL as fallback
        }

        // Get dimensions based on aspect ratio
        const aspectRatio = params_data?.aspectRatio || '16:9'
        const dimensions: Record<string, { width: number; height: number }> = {
          '1:1': { width: 1024, height: 1024 },
          '16:9': { width: 1344, height: 768 },
          '9:16': { width: 768, height: 1344 },
          '4:3': { width: 1184, height: 864 },
          '3:4': { width: 864, height: 1184 },
        }
        const dim = dimensions[aspectRatio] || { width: 1344, height: 768 }
        const duration = generation.session.type === 'video' ? (params_data?.duration || 5) : undefined

        outputRecords.push({
          generationId: generation.id,
          fileUrl: finalUrl,
          fileType: generation.session.type,
          width: dim.width,
          height: dim.height,
          ...(duration && { duration }),
        })
      }

      // Create output records
      await prisma.output.createMany({
        data: outputRecords,
      })

      // Update generation to completed
      await prisma.generation.update({
        where: { id: generation.id },
        data: {
          status: 'completed',
          parameters: {
            ...params_data,
            syncedAt: new Date().toISOString(),
            syncReason: 'manual',
          },
        },
      })

      return NextResponse.json({
        message: 'Generation synced successfully',
        generationId,
        status: 'completed',
        outputCount: outputRecords.length,
        synced: true,
      })

    } else if (replicateStatus.status === 'failed' || replicateStatus.status === 'canceled') {
      await prisma.generation.update({
        where: { id: generation.id },
        data: {
          status: 'failed',
          parameters: {
            ...params_data,
            error: replicateStatus.error || `Replicate ${replicateStatus.status}`,
            syncedAt: new Date().toISOString(),
          },
        },
      })

      return NextResponse.json({
        message: `Generation ${replicateStatus.status} on Replicate`,
        generationId,
        status: 'failed',
        error: replicateStatus.error,
        synced: true,
      })

    } else {
      // Still processing
      return NextResponse.json({
        message: 'Generation still processing on Replicate',
        generationId,
        localStatus: generation.status,
        replicateStatus: replicateStatus.status,
        synced: false,
      })
    }

  } catch (error: any) {
    console.error('[Sync] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Sync failed' },
      { status: 500 }
    )
  }
}
