import { useQuery } from '@tanstack/react-query'

interface ApprovedOutput {
  id: string
  fileUrl: string
  fileType: string
  width?: number | null
  height?: number | null
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
    user: {
      id: string
      displayName: string | null
    }
  }
}

async function fetchApprovedOutputs(): Promise<ApprovedOutput[]> {
  const response = await fetch('/api/review/approved')
  if (!response.ok) {
    throw new Error('Failed to fetch approved outputs')
  }
  return response.json()
}

export function useApprovedOutputs() {
  return useQuery({
    queryKey: ['approvedOutputs'],
    queryFn: fetchApprovedOutputs,
    staleTime: 30000, // Consider data fresh for 30 seconds
  })
}

