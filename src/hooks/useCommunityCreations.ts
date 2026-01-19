import { useInfiniteQuery } from '@tanstack/react-query'

export interface CommunityCreation {
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
    parameters: Record<string, any>
    createdAt: string
    user: {
      id: string
      displayName: string | null
      username: string | null
      avatarUrl: string | null
    }
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

interface CommunityCreationsResponse {
  data: CommunityCreation[]
  nextCursor: string | null
  hasMore: boolean
}

async function fetchCommunityCreations(
  limit: number = 8,
  cursor?: string
): Promise<CommunityCreationsResponse> {
  const url = new URL('/api/outputs/community', window.location.origin)
  url.searchParams.set('limit', String(limit))
  if (cursor) {
    url.searchParams.set('cursor', cursor)
  }
  
  const response = await fetch(url.toString())
  if (!response.ok) {
    throw new Error('Failed to fetch community creations')
  }
  return response.json()
}

export function useCommunityCreations(limit: number = 8) {
  const query = useInfiniteQuery({
    queryKey: ['communityCreations', limit],
    queryFn: ({ pageParam }) => fetchCommunityCreations(limit, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  })

  // Flatten all pages into a single array
  const data = query.data?.pages.flatMap((page) => page.data) ?? []

  return {
    data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
  }
}
