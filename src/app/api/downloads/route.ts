import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/downloads
 *
 * Per-user download history, durable across local file deletion: every
 * download in the gallery / lightbox already writes an `OutputEvent` row
 * (`eventType: 'download'`), so this endpoint surfaces those events to the
 * UI as an image grid.
 *
 * The result is **deduped by `outputId`** (most recent first) so repeated
 * downloads of the same image collapse to a single tile, and each item
 * carries the project + session context needed for the "Open in session"
 * deep-link.
 */
export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Pull a generous window of recent download events. We dedupe in memory
    // after the query so we don't need a window function in SQL.
    const events = await prisma.outputEvent.findMany({
      where: {
        userId: user.id,
        eventType: 'download',
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 500,
      include: {
        output: {
          include: {
            generation: {
              include: {
                session: {
                  include: {
                    project: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    const seen = new Set<string>()
    const items = [] as Array<{
      outputId: string
      fileUrl: string
      fileType: string
      width: number | null
      height: number | null
      duration: number | null
      prompt: string
      modelId: string
      downloadedAt: string
      session: { id: string; name: string }
      project: { id: string; name: string }
    }>

    for (const event of events) {
      if (!event.output) continue
      if (seen.has(event.outputId)) continue
      seen.add(event.outputId)

      const output = event.output
      const generation = output.generation
      const session = generation.session
      const project = session.project

      items.push({
        outputId: output.id,
        fileUrl: output.fileUrl,
        fileType: output.fileType,
        width: output.width,
        height: output.height,
        duration: output.duration,
        prompt: generation.prompt,
        modelId: generation.modelId,
        downloadedAt: event.createdAt.toISOString(),
        session: { id: session.id, name: session.name },
        project: { id: project.id, name: project.name },
      })
    }

    return NextResponse.json({ items }, {
      headers: {
        // Private cache; downloads are personal and updated rarely.
        'Cache-Control': 'private, max-age=15, stale-while-revalidate=60',
      },
    })
  } catch (error) {
    console.error('Error fetching download history:', error)
    return NextResponse.json(
      { error: 'Failed to fetch download history' },
      { status: 500 },
    )
  }
}
