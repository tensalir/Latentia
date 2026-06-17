import { useQuery } from '@tanstack/react-query'

export interface DownloadHistoryItem {
  outputId: string
  fileUrl: string
  fileType: string
  width: number | null
  height: number | null
  duration: number | null
  prompt: string
  modelId: string
  downloadedAt: string
  session: { id: string; name: string }
  project: { id: string; name: string }
}

async function fetchDownloads(): Promise<DownloadHistoryItem[]> {
  const response = await fetch('/api/downloads', { cache: 'no-store' })
  if (!response.ok) {
    throw new Error('Failed to fetch download history')
  }
  const data = await response.json()
  return Array.isArray(data?.items) ? data.items : []
}

/**
 * Per-user download history, deduped by output. Backed by the existing
 * `OutputEvent` log so the archive survives deleting the file locally.
 *
 * Query key is intentionally global (`['downloads']`) — the same user can
 * have downloads across many projects, and the history button lives in the
 * shell so a single shared cache makes sense.
 */
export function useDownloadHistory() {
  return useQuery({
    queryKey: ['downloads'],
    queryFn: fetchDownloads,
    staleTime: 30 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
