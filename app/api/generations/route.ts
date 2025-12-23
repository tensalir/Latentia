import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'

// Helper to encode cursor as base64url
function encodeCursor(createdAt: Date, id: string): string {
  const payload = JSON.stringify({ createdAt: createdAt.toISOString(), id })
  return Buffer.from(payload).toString('base64url')
}

// Helper to decode cursor from base64url
function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const payload = Buffer.from(cursor, 'base64url').toString('utf-8')
    const parsed = JSON.parse(payload)
    return {
      createdAt: new Date(parsed.createdAt),
      id: parsed.id,
    }
  } catch {
    return null
  }
}

// GET /api/generations?sessionId=xxx&cursor=xxx - Get generations for a session with cursor pagination
// Returns newest-first using keyset pagination based on (createdAt, id)
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession()

    if (authError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')
    const cursor = searchParams.get('cursor')
    const limit = parseInt(searchParams.get('limit') || '10') // Default to 10 for infinite scroll

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      )
    }

    // Build base where clause
    const baseWhere: any = {
      sessionId,
      userId: session.user.id, // Only fetch user's own generations
    }

    // Add keyset cursor for pagination (newest-first: createdAt DESC, id DESC)
    // To get the next page, we need items where:
    // (createdAt < cursorCreatedAt) OR (createdAt == cursorCreatedAt AND id < cursorId)
    let whereClause: any = baseWhere
    if (cursor) {
      const decoded = decodeCursor(cursor)
      if (decoded) {
        whereClause = {
          ...baseWhere,
          OR: [
            { createdAt: { lt: decoded.createdAt } },
            {
              AND: [
                { createdAt: decoded.createdAt },
                { id: { lt: decoded.id } },
              ],
            },
          ],
        }
      }
    }

    // Fetch generations with their outputs and user profile
    // Order by createdAt DESC, id DESC (newest first)
    const generations = await prisma.generation.findMany({
      where: whereClause,
      select: {
        id: true,
        sessionId: true,
        userId: true,
        modelId: true,
        prompt: true,
        negativePrompt: true,
        parameters: true,
        status: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            displayName: true,
            username: true,
          },
        },
        outputs: {
          select: {
            id: true,
            generationId: true,
            fileUrl: true,
            fileType: true,
            width: true,
            height: true,
            duration: true,
            isStarred: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
      },
    },
      orderBy: [
        { createdAt: 'desc' }, // Newest first
        { id: 'desc' }, // Tie-breaker for UUID stability
      ],
    take: limit + 1, // Fetch one extra to check if there's more
  })

    // Check if there's more data
    const hasMore = generations.length > limit
    const data = hasMore ? generations.slice(0, limit) : generations
    
    // Build next cursor from the last item in the returned page
    const lastItem = data[data.length - 1]
    const nextCursor = hasMore && lastItem 
      ? encodeCursor(lastItem.createdAt, lastItem.id) 
      : undefined

    // Fetch bookmarks separately for efficiency
    const outputIds = data.flatMap((g: any) => g.outputs.map((o: any) => o.id))
    const bookmarks = outputIds.length > 0
      ? await (prisma as any).bookmark.findMany({
          where: {
            outputId: { in: outputIds },
            userId: session.user.id,
          },
          select: {
            outputId: true,
          },
        })
      : []

    const bookmarkedOutputIds = new Set(bookmarks.map((b: any) => b.outputId))

    // Add isBookmarked field to outputs
    const generationsWithBookmarks = data.map((generation: any) => ({
      ...generation,
      outputs: generation.outputs.map((output: any) => ({
        ...output,
        isBookmarked: bookmarkedOutputIds.has(output.id),
      })),
    }))

    return NextResponse.json({
      data: generationsWithBookmarks,
      nextCursor,
      hasMore,
    })
  } catch (error) {
    console.error('Error fetching generations:', error)
    return NextResponse.json(
      { error: 'Failed to fetch generations' },
      { status: 500 }
    )
  }
}

