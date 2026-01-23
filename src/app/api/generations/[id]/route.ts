import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'

// GET /api/generations/[id] - Fetch a single generation with outputs
// Used for lazy loading outputs in light mode
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession()

    if (authError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const generationId = params.id

    if (!generationId) {
      return NextResponse.json(
        { error: 'Generation ID is required' },
        { status: 400 }
      )
    }

    // Fetch the generation with outputs
    const generation = await prisma.generation.findUnique({
      where: { id: generationId },
      include: {
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
        session: {
          select: {
            projectId: true,
            project: {
              select: {
                ownerId: true,
                isShared: true,
                members: {
                  where: { userId: session.user.id },
                  select: { userId: true },
                },
              },
            },
          },
        },
      },
    })

    if (!generation) {
      return NextResponse.json(
        { error: 'Generation not found' },
        { status: 404 }
      )
    }

    // Check access
    const project = generation.session.project
    const isProjectOwner = project.ownerId === session.user.id
    const isMember = project.members.length > 0
    const isPublicProject = project.isShared === true

    if (!isProjectOwner && !isMember && !isPublicProject) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Fetch bookmarks for outputs
    const outputIds = generation.outputs.map(o => o.id)
    const bookmarks = outputIds.length > 0
      ? await prisma.bookmark.findMany({
          where: {
            outputId: { in: outputIds },
            userId: session.user.id,
          },
          select: { outputId: true },
        })
      : []
    const bookmarkedOutputIds = new Set(bookmarks.map(b => b.outputId))

    // Add isBookmarked to outputs
    const outputsWithBookmarks = generation.outputs.map(output => ({
      ...output,
      isBookmarked: bookmarkedOutputIds.has(output.id),
    }))

    // Return full generation data for cache updates (used by realtime hook)
    return NextResponse.json({
      id: generation.id,
      sessionId: generation.sessionId,
      userId: generation.userId,
      modelId: generation.modelId,
      prompt: generation.prompt,
      negativePrompt: generation.negativePrompt,
      parameters: generation.parameters,
      status: generation.status,
      cost: generation.cost,
      createdAt: generation.createdAt,
      outputs: outputsWithBookmarks,
      // Include ownership flag for UI
      isOwner: generation.userId === session.user.id,
    })
  } catch (error: any) {
    console.error('Error fetching generation:', error)
    return NextResponse.json(
      { error: 'Failed to fetch generation', details: error.message },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession()

    if (authError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const generationId = params.id

    if (!generationId) {
      return NextResponse.json(
        { error: 'Generation ID is required' },
        { status: 400 }
      )
    }

    // Fetch the generation
    const generation = await prisma.generation.findUnique({
      where: { id: generationId },
    })

    if (!generation) {
      return NextResponse.json(
        { error: 'Generation not found' },
        { status: 404 }
      )
    }

    // Verify ownership
    if (generation.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Only allow deleting cancelled or failed generations
    if (generation.status !== 'cancelled' && generation.status !== 'failed') {
      return NextResponse.json(
        { error: 'Can only delete cancelled or failed generations' },
        { status: 400 }
      )
    }

    // Delete associated outputs first (if any)
    await prisma.output.deleteMany({
      where: { generationId },
    })

    // Delete the generation
    await prisma.generation.delete({
      where: { id: generationId },
    })

    return NextResponse.json({
      id: generationId,
      message: 'Generation deleted successfully',
    })
  } catch (error: any) {
    console.error('Error deleting generation:', error)
    return NextResponse.json(
      { error: 'Failed to delete generation', details: error.message },
      { status: 500 }
    )
  }
}

