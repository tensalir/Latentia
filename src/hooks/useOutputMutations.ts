import { useMutation, useQueryClient } from '@tanstack/react-query'

interface UpdateOutputParams {
  outputId: string
  sessionId: string
  isStarred?: boolean
  isApproved?: boolean
}

interface DeleteOutputParams {
  outputId: string
  sessionId: string
}

async function updateOutput(params: UpdateOutputParams) {
  const response = await fetch(`/api/outputs/${params.outputId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      isStarred: params.isStarred,
      isApproved: params.isApproved,
    }),
  })

  if (!response.ok) {
    throw new Error('Failed to update output')
  }

  return response.json()
}

async function deleteOutput(params: DeleteOutputParams) {
  const response = await fetch(`/api/outputs/${params.outputId}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    throw new Error('Failed to delete output')
  }

  return response.json()
}

export function useUpdateOutputMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateOutput,
    onSuccess: (_, variables) => {
      // Refetch generations to get updated data
      queryClient.invalidateQueries({
        queryKey: ['generations', variables.sessionId],
      })
    },
  })
}

export function useDeleteOutputMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteOutput,
    onSuccess: (_, variables) => {
      // Refetch generations to get updated data
      queryClient.invalidateQueries({
        queryKey: ['generations', variables.sessionId],
      })
    },
  })
}

