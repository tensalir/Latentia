import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'

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

