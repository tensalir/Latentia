import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * DELETE /api/projects/[id]/pinned-images/[imageId]
 * 
 * Unpin an image from the project
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; imageId: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: projectId, imageId } = params

    // Check the pinned image exists and load project access info
    const pinnedImage = await prisma.pinnedImage.findFirst({
      where: { id: imageId, projectId },
      select: {
        id: true,
        pinnedBy: true,
        project: {
          select: {
            ownerId: true,
            isShared: true,
            members: {
              where: { userId: user.id },
              select: { userId: true },
            },
          },
        },
      },
    })

    if (!pinnedImage) {
      return NextResponse.json(
        { error: 'Pinned image not found' },
        { status: 404 }
      )
    }

    const isOwner = pinnedImage.project.ownerId === user.id
    const isMember = pinnedImage.project.members.length > 0
    const isPublicProject = pinnedImage.project.isShared === true

    // Must have access to the project
    if (!isOwner && !isMember && !isPublicProject) {
      return NextResponse.json(
        { error: 'Project not found or insufficient permissions' },
        { status: 404 }
      )
    }

    // On public projects, only allow unpinning your own pins (or project owner / member)
    const canUnpin = isOwner || isMember || pinnedImage.pinnedBy === user.id
    if (!canUnpin) {
      return NextResponse.json(
        { error: 'Insufficient permissions to unpin this image' },
        { status: 403 }
      )
    }

    // Delete the pinned image
    await prisma.pinnedImage.delete({
      where: { id: imageId },
    })

    return NextResponse.json({ message: 'Image unpinned successfully' })
  } catch (error: any) {
    console.error('Error unpinning image:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to unpin image' },
      { status: 500 }
    )
  }
}
