import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logMetric } from '@/lib/metrics'

// GET /api/sessions?projectId=xxx - List all sessions for a project
export async function GET(request: Request) {
  const startTime = Date.now()
  let authDuration = 0
  let projectQueryDuration = 0
  let sessionsQueryDuration = 0
  let profileQueryDuration = 0

  try {
    const authStart = Date.now()
    const supabase = createRouteHandlerClient({ cookies })
    const {
      data: { user },
    } = await supabase.auth.getUser()
    authDuration = Date.now() - authStart

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      )
    }

    // Verify user has access to this project
    const projectQueryStart = Date.now()
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { ownerId: user.id },
          {
            members: {
              some: {
                userId: user.id,
              },
            },
          },
        ],
      },
    })
    projectQueryDuration = Date.now() - projectQueryStart

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found or unauthorized' },
        { status: 404 }
      )
    }

    // Filter sessions based on privacy, ownership, and project sharing settings
    const isOwner = project.ownerId === user.id
    // If owner OR project is shared, show all sessions
    // Otherwise only show public sessions
    const showAllSessions = isOwner || project.isShared
    
    const sessionsQueryStart = Date.now()
    const sessions = await prisma.session.findMany({
      where: {
        projectId,
        ...(showAllSessions
          ? {} // Owner or shared project: see all sessions
          : { isPrivate: false }), // Non-owners on non-shared projects: only public sessions
      },
      orderBy: {
        updatedAt: 'desc',
      },
    })
    sessionsQueryDuration = Date.now() - sessionsQueryStart

    // Get project owner profile for display
    const profileQueryStart = Date.now()
    const ownerProfile = await prisma.profile.findUnique({
      where: { id: project.ownerId },
      select: {
        id: true,
        displayName: true,
        username: true,
      },
    })
    profileQueryDuration = Date.now() - profileQueryStart

    // Add creator info to each session
    const sessionsWithCreator = sessions.map(session => ({
      ...session,
      creator: ownerProfile,
    }))

    const totalDuration = Date.now() - startTime
    logMetric({
      name: 'api_sessions_get',
      status: 'success',
      durationMs: totalDuration,
      meta: {
        projectId,
        sessionCount: sessions.length,
        authMs: authDuration,
        projectQueryMs: projectQueryDuration,
        sessionsQueryMs: sessionsQueryDuration,
        profileQueryMs: profileQueryDuration,
      },
    })

    return NextResponse.json(sessionsWithCreator, {
      headers: {
        'Cache-Control': 'private, max-age=30',
        'Server-Timing': `auth;dur=${authDuration}, project;dur=${projectQueryDuration}, sessions;dur=${sessionsQueryDuration}, profile;dur=${profileQueryDuration}, total;dur=${totalDuration}`,
      },
    })
  } catch (error) {
    console.error('Error fetching sessions:', error)
    logMetric({
      name: 'api_sessions_get',
      status: 'error',
      durationMs: Date.now() - startTime,
      meta: { error: (error as Error).message },
    })
    return NextResponse.json(
      { error: 'Failed to fetch sessions' },
      { status: 500 }
    )
  }
}

// POST /api/sessions - Create a new session
export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { projectId, name, type } = body

    if (!projectId || !name || !type) {
      return NextResponse.json(
        { error: 'Project ID, name, and type are required' },
        { status: 400 }
      )
    }

    if (type !== 'image' && type !== 'video') {
      return NextResponse.json(
        { error: 'Type must be either "image" or "video"' },
        { status: 400 }
      )
    }

    // Verify user has access to this project
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { ownerId: user.id },
          {
            members: {
              some: {
                userId: user.id,
              },
            },
          },
        ],
      },
    })

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found or unauthorized' },
        { status: 404 }
      )
    }

    const session = await prisma.session.create({
      data: {
        projectId,
        name: name.trim(),
        type,
        // Public by default (owner can toggle per-session privacy)
        isPrivate: false,
      },
    })

    return NextResponse.json(session, { status: 201 })
  } catch (error) {
    console.error('Error creating session:', error)
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    )
  }
}

