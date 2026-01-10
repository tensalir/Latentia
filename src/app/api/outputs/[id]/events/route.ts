import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

/**
 * POST /api/outputs/[id]/events
 * 
 * Log an event on an output (e.g., download, share)
 * Used for semantic analysis signals - does NOT affect prompt generation behavior.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const outputId = params.id
    const body = (await request.json()) as unknown
    const { eventType, metadata } = (body ?? {}) as {
      eventType?: unknown
      metadata?: unknown
    }

    if (!eventType || typeof eventType !== 'string') {
      return NextResponse.json(
        { error: 'eventType is required and must be a string' },
        { status: 400 }
      )
    }

    // Validate eventType against allowed types
    const allowedTypes = ['download', 'share', 'view', 'copy']
    if (!allowedTypes.includes(eventType)) {
      return NextResponse.json(
        { error: `eventType must be one of: ${allowedTypes.join(', ')}` },
        { status: 400 }
      )
    }

    // Verify the output exists (no authorization check - users can log events on any output they can see)
    const output = await prisma.output.findUnique({
      where: { id: outputId },
      select: { id: true },
    })

    if (!output) {
      return NextResponse.json({ error: 'Output not found' }, { status: 404 })
    }

    // Prisma JSON fields require Prisma.InputJsonValue (not Record<string, unknown>)
    // and they don't accept `null` directly. Also, user-provided objects can contain
    // `undefined` which Prisma can't serialize. We sanitize via JSON roundtrip.
    let metadataForDb: Prisma.InputJsonValue | undefined = undefined
    if (metadata !== undefined && metadata !== null) {
      try {
        metadataForDb = JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonValue
      } catch {
        // Ignore invalid/unserializable metadata
        metadataForDb = undefined
      }
    }

    // Create the event
    const event = await prisma.outputEvent.create({
      data: {
        outputId,
        userId: user.id,
        eventType,
        ...(metadataForDb !== undefined ? { metadata: metadataForDb } : {}),
      },
    })

    return NextResponse.json({ event }, { status: 201 })
  } catch (error: any) {
    console.error('Error logging output event:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to log event' },
      { status: 500 }
    )
  }
}
