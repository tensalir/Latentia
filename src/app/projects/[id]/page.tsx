import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { QueryClient, dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { prisma } from '@/lib/prisma'
import { getAllModels, getModelsByType } from '@/lib/models/registry'
import { ProjectClientShell } from './ProjectClientShell'
import type { Project } from '@/types/project'

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
