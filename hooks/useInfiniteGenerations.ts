import { useInfiniteQuery } from '@tanstack/react-query'
import { logMetric } from '@/lib/metrics'
import { fetchGenerationsPage, PaginatedGenerationsResponse } from '@/lib/api/generations'

/**
 * Fetches a page of generations from the API.
 * 
 * NOTE: The API returns data in newest-first order.
 * - Page 0 (no cursor) = newest items
 * - Page N (with cursor) = older items
 * 
 * The UI will reverse pages for display (oldest at top, newest at bottom).
 */
async function fetchGenerations({
  sessionId,
  cursor,
  limit = 10,
}: {
  sessionId: string
  cursor?: string
  limit?: number
}): Promise<PaginatedGenerationsResponse> {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()

  try {
    const normalized = await fetchGenerationsPage({
      sessionId,
      cursor,
      limit,
    })

    logMetric({
      name: 'hook_fetch_generations_infinite',
      status: 'success',
      durationMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt,
      meta: {
        sessionId,
        limit,
        cursor,
        resultCount: normalized.data.length,
        hasMore: normalized.hasMore,
      },
    })

    return normalized
  } catch (error: any) {
    logMetric({
      name: 'hook_fetch_generations_infinite',
      status: 'error',
      durationMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt,
      meta: { sessionId, limit, cursor, error: error?.message },
    })
    throw error
  }
}

/**
 * Infinite query for fetching generations with cursor-based pagination.
 * 
 * Data ordering:
 * - API returns newest-first (page 0 = newest, subsequent pages = older)
 * - The cursor is opaque (base64-encoded {createdAt, id})
 * - getNextPageParam provides the cursor for older items
 * 
 * Polling:
 * - Reduced to 5s when there are processing generations (was 2s)
 * - This is a fallback; realtime subscriptions should handle most updates
 */
export function useInfiniteGenerations(sessionId: string | null, limit: number = 10) {
  return useInfiniteQuery({
    queryKey: ['generations', 'infinite', sessionId],
    queryFn: ({ pageParam }) =>
      fetchGenerations({
        sessionId: sessionId!,
        cursor: pageParam as string | undefined,
        limit,
      }),
    enabled: !!sessionId,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      // Return the cursor for the next page (older items), or undefined if no more
      return lastPage.hasMore ? (lastPage.nextCursor as string | undefined) : undefined
    },
    staleTime: 30 * 1000, // 30 seconds - rely on realtime + optimistic updates
    gcTime: 30 * 60 * 1000, // 30 minutes - keep in memory for faster navigation
    refetchOnMount: false, // Don't auto-refetch - rely on optimistic updates and real-time subscriptions
    refetchOnWindowFocus: false,
    refetchInterval: (query) => {
      // Poll less frequently as a fallback for processing generations
      // Realtime subscriptions should handle most updates
      const allData = query.state.data
      if (!allData) return false

      const allGenerations = allData.pages.flatMap((page) => page.data)
      const hasProcessingGenerations = allGenerations.some((gen) => gen.status === 'processing')

      if (hasProcessingGenerations) {
        return 5000 // Poll every 5 seconds as fallback (realtime handles most updates)
      }

      return false
    },
  })
}

