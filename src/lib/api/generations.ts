import type { GenerationWithOutputs } from '@/types/generation'

export interface PaginatedGenerationsResponse {
  data: GenerationWithOutputs[]
  nextCursor?: string
  hasMore: boolean
}

export async function fetchGenerationsPage({
  sessionId,
  cursor,
  limit = 10,
  bookmarkedOnly = false,
}: {
  sessionId: string
  cursor?: string
  limit?: number
  /**
   * When true, only generations with at least one bookmarked output (for the
   * current user) are returned, and each generation's `outputs` array is
   * narrowed to just those bookmarked items.
   */
  bookmarkedOnly?: boolean
}): Promise<PaginatedGenerationsResponse> {
  const params = new URLSearchParams({
    sessionId,
    limit: limit.toString(),
  })

  if (cursor) {
    params.append('cursor', cursor)
  }

  if (bookmarkedOnly) {
    params.append('bookmarkedOnly', 'true')
  }

  // Use no-store to prevent stale cached responses during polling/refetch
  // This ensures we always get fresh data and don't overwrite optimistic updates with stale cache
  const response = await fetch(`/api/generations?${params}`, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error('Failed to fetch generations')
  }

  const data = await response.json()

  if (Array.isArray(data)) {
    return {
      data,
      nextCursor: undefined,
      hasMore: false,
    }
  }

  return data
}

