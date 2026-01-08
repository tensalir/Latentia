import { useQuery } from '@tanstack/react-query'
import type { Session } from '@/types/project'

async function fetchSessions(projectId: string): Promise<Session[]> {
  const response = await fetch(`/api/sessions?projectId=${projectId}`)
  
  if (!response.ok) {
    throw new Error('Failed to fetch sessions')
  }
  
  const data = await response.json()
  
  // Parse dates from strings to Date objects
  return data.map((s: any) => ({
    ...s,
    createdAt: new Date(s.createdAt),
    updatedAt: new Date(s.updatedAt),
  }))
}

export function useSessions(projectId: string | undefined) {
  return useQuery({
    queryKey: ['sessions', projectId],
    queryFn: () => fetchSessions(projectId!),
    enabled: !!projectId, // Only run if projectId exists
    staleTime: 3 * 60 * 1000, // 3 minutes - sessions change moderately
    gcTime: 30 * 60 * 1000, // 30 minutes - keep in memory for faster navigation
    refetchOnMount: false, // Use cached data if fresh
    refetchOnWindowFocus: false, // Don't refetch on window focus
  })
}

