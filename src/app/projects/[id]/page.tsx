import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { QueryClient, dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { prisma } from '@/lib/prisma'
import { getAllModels, getModelsByType } from '@/lib/models/registry'
import { ProjectClientShell } from './ProjectClientShell'
import type { Project, Session } from '@/types/project'
import type { GenerationWithOutputs } from '@/types/generation'
import type { PaginatedGenerationsResponse } from '@/lib/api/generations'

interface PageProps {
  params: { id: string }
}

export default async function ProjectPage({ params }: PageProps) {
  const projectId = params.id
  const supabase = createServerComponentClient({ cookies })

  // Get current user session
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect('/login')
  }

  const userId = session.user.id

  // Fetch data in parallel on the server
  const [projectData, profileData, sessionsData] = await Promise.all([
    // Fetch project with access check
    prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { ownerId: userId },
          {
            members: {
              some: {
                userId: userId,
              },
            },
          },
          // Public projects (visible in Community Creations) are accessible to all logged-in users
          { isShared: true },
        ],
      },
    }),
    // Fetch user profile for admin check
    prisma.profile.findUnique({
      where: { id: userId },
      select: { role: true },
    }),
    // Fetch sessions for this project
    fetchSessionsForHydration(projectId, userId),
  ])

  // If project not found or unauthorized, redirect
  if (!projectData) {
    redirect('/')
  }

  const isAdmin = profileData?.role === 'admin'

  // Convert project data to match the expected type
  const initialProject: Project = {
    id: projectData.id,
    name: projectData.name,
    ownerId: projectData.ownerId,
    isShared: projectData.isShared,
    createdAt: projectData.createdAt,
    updatedAt: projectData.updatedAt,
  }

  // Create query client for hydration
  const queryClient = new QueryClient()

  // Prefetch sessions into the query cache
  if (sessionsData) {
    queryClient.setQueryData(['sessions', projectId], sessionsData)
  }

  // Prefetch models into the query cache (static data, no async needed)
  const allModels = getAllModels()
  const imageModels = getModelsByType('image')
  const videoModels = getModelsByType('video')
  
  queryClient.setQueryData(['models', 'all'], allModels)
  queryClient.setQueryData(['models', 'image'], imageModels)
  queryClient.setQueryData(['models', 'video'], videoModels)

  // Prefetch first session's generations so user sees content immediately
  // Use same logic as client: prefer first image session, fallback to first session
  if (sessionsData && sessionsData.length > 0) {
    const firstImageSession = sessionsData.find((s) => s.type === 'image')
    const firstSession = firstImageSession || sessionsData[0]
    
    if (firstSession && !firstSession.id.startsWith('temp-')) {
      const generationsData = await fetchGenerationsForHydration(
        firstSession.id,
        userId,
        projectData.ownerId === userId || projectData.isShared,
        5 // Match the reduced limit we use on client
      )
      
      if (generationsData) {
        // Set as infinite query data structure
        queryClient.setQueryData(
          ['generations', 'infinite', firstSession.id],
          {
            pages: [generationsData],
            pageParams: [undefined],
          }
        )
      }
    }
  }

  // Dehydrate the query client state
  const dehydratedState = dehydrate(queryClient)

  return (
    <HydrationBoundary state={dehydratedState}>
      <ProjectClientShell
        projectId={projectId}
        initialProject={initialProject}
        initialUserId={userId}
        initialIsAdmin={isAdmin}
      />
    </HydrationBoundary>
  )
}

/**
 * Server-side session fetching for hydration.
 * This mirrors the logic in /api/sessions but runs on the server.
 */
async function fetchSessionsForHydration(projectId: string, userId: string) {
  try {
    // Fetch project to check ownership/sharing
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { ownerId: userId },
          {
            members: {
              some: {
                userId: userId,
              },
            },
          },
          // Public projects are readable by any logged-in user
          { isShared: true },
        ],
      },
    })

    if (!project) {
      return []
    }

    const isOwner = project.ownerId === userId
    const showAllSessions = isOwner || project.isShared

    const sessions = await prisma.session.findMany({
      where: {
        projectId,
        ...(showAllSessions ? {} : { isPrivate: false }),
      },
      orderBy: {
        updatedAt: 'desc',
      },
    })

    // Get project owner profile for display
    const ownerProfile = await prisma.profile.findUnique({
      where: { id: project.ownerId },
      select: {
        id: true,
        displayName: true,
        username: true,
      },
    })

    // Add creator info and convert dates
    return sessions.map(session => ({
      ...session,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      creator: ownerProfile,
    }))
  } catch (error) {
    console.error('Error fetching sessions for hydration:', error)
    return []
  }
}

/**
 * Server-side generations fetching for hydration.
 * This mirrors the logic in /api/generations but runs on the server.
 * Returns data in the PaginatedGenerationsResponse format.
 */
async function fetchGenerationsForHydration(
  sessionId: string,
  userId: string,
  showAllGenerations: boolean,
  limit: number = 5
): Promise<PaginatedGenerationsResponse | null> {
  try {
    // Fetch generations with outputs
    const generations = await prisma.generation.findMany({
      where: {
        sessionId,
        ...(showAllGenerations ? {} : { userId }),
      },
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
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      take: limit + 1, // Fetch one extra to check if there's more
    })

    // Check if there's more data
    const hasMore = generations.length > limit
    const data = hasMore ? generations.slice(0, limit) : generations

    // Build next cursor from the last item
    const lastItem = data[data.length - 1]
    const nextCursor = hasMore && lastItem
      ? Buffer.from(JSON.stringify({
          createdAt: lastItem.createdAt.toISOString(),
          id: lastItem.id,
        })).toString('base64url')
      : undefined

    // Fetch bookmarks for outputs
    const outputIds = data.flatMap((g) => g.outputs.map((o) => o.id))
    const bookmarks = outputIds.length > 0
      ? await prisma.bookmark.findMany({
          where: {
            outputId: { in: outputIds },
            userId,
          },
          select: {
            outputId: true,
          },
        })
      : []
    const bookmarkedOutputIds = new Set(bookmarks.map((b) => b.outputId))

    // Transform to match GenerationWithOutputs type
    const generationsWithBookmarks: GenerationWithOutputs[] = data.map((generation) => ({
      id: generation.id,
      sessionId: generation.sessionId,
      userId: generation.userId,
      modelId: generation.modelId,
      prompt: generation.prompt,
      negativePrompt: generation.negativePrompt || undefined,
      parameters: generation.parameters as Record<string, any>,
      status: generation.status as GenerationWithOutputs['status'],
      createdAt: generation.createdAt,
      isOwner: generation.userId === userId,
      user: generation.user ? {
        id: generation.user.id,
        displayName: generation.user.displayName || '',
        username: generation.user.username,
      } : undefined,
      outputs: generation.outputs.map((output) => ({
        id: output.id,
        generationId: output.generationId,
        fileUrl: output.fileUrl,
        fileType: output.fileType as 'image' | 'video',
        width: output.width || undefined,
        height: output.height || undefined,
        duration: output.duration || undefined,
        isStarred: output.isStarred,
        createdAt: output.createdAt,
        isBookmarked: bookmarkedOutputIds.has(output.id),
      })),
    }))

    return {
      data: generationsWithBookmarks,
      nextCursor,
      hasMore,
    }
  } catch (error) {
    console.error('Error fetching generations for hydration:', error)
    return null
  }
}
