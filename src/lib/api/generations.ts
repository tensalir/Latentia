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
}: {
  sessionId: string
  cursor?: string
  limit?: number
}): Promise<PaginatedGenerationsResponse> {
  const params = new URLSearchParams({
    sessionId,
    limit: limit.toString(),
  })

  if (cursor) {
    params.append('cursor', cursor)
  }

  const response = await fetch(`/api/generations?${params}`)

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

