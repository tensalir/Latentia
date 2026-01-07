import { useQuery } from '@tanstack/react-query'

interface RecentOutput {
  id: string
  fileUrl: string
  fileType: 'image' | 'video'
  width?: number | null
  height?: number | null
  duration?: number | null
  createdAt: string
  generation: {
    id: string
    prompt: string
    modelId: string
    createdAt: string
    session: {
      id: string
      name: string
      project: {
        id: string
        name: string
      }
    }
  }
}

async function fetchRecentOutputs(limit: number = 12): Promise<RecentOutput[]> {
  const response = await fetch(`/api/outputs/recent?limit=${limit}`)
  if (!response.ok) {
    throw new Error('Failed to fetch recent outputs')
  }
  return response.json()
}

export function useRecentOutputs(limit: number = 12) {
  return useQuery({
    queryKey: ['recentOutputs', limit],
    queryFn: () => fetchRecentOutputs(limit),
    staleTime: 30000, // Consider data fresh for 30 seconds
  })
}

export type { RecentOutput }

