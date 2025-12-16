import { useMutation, useQueryClient, InfiniteData } from '@tanstack/react-query'
import type { GenerationWithOutputs } from '@/types/generation'

interface PaginatedGenerationsResponse {
  data: GenerationWithOutputs[]
  nextCursor?: string
  hasMore: boolean
}

interface GenerateParams {
  sessionId: string
  modelId: string
  prompt: string
  negativePrompt?: string
  parameters: {
    aspectRatio: string
    resolution: number
    numOutputs: number
    duration?: number
    referenceImage?: string
    referenceImageId?: string
  }
}

interface GenerateResponse {
  id: string
  status: 'processing' | 'completed' | 'failed'
  outputs?: Array<{
    url: string
    width?: number
    height?: number
    duration?: number
  }>
  error?: string
  message?: string
}

async function generateImage(params: GenerateParams): Promise<GenerateResponse> {
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`
    try {
      const errorData = await response.json()
      errorMessage = errorData.error || errorData.message || errorMessage
    } catch {
      // If response is not JSON, try to get text
      try {
        const text = await response.text()
        errorMessage = text || errorMessage
      } catch {
        // Last resort: use status
      }
    }
    throw new Error(errorMessage)
  }

  const data = await response.json()
  return data
}

export function useGenerateMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: generateImage,
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['generations', variables.sessionId] })

      // Snapshot the previous value
      const previousGenerations = queryClient.getQueryData<GenerationWithOutputs[]>([
        'generations',
        variables.sessionId,
      ])

      // Optimistically add a pending generation
      // Use a timestamp to ensure unique IDs
      const timestamp = Date.now()
      const optimisticGeneration: GenerationWithOutputs = {
        id: `temp-${timestamp}`,
        sessionId: variables.sessionId,
        userId: '',
        modelId: variables.modelId,
        prompt: variables.prompt,
        negativePrompt: variables.negativePrompt,
        parameters: variables.parameters,
        status: 'processing',
        createdAt: new Date(),
        outputs: [],
      }
      
      // Store the optimistic ID in context for later matching
      const optimisticId = optimisticGeneration.id

      // Add pending generation to cache ONLY if it doesn't already exist
      queryClient.setQueryData<GenerationWithOutputs[]>(
        ['generations', variables.sessionId],
        (old) => {
          if (!old) return [optimisticGeneration]
          // Check if this exact optimistic generation already exists
          const exists = old.some(gen => gen.id === optimisticGeneration.id)
          if (exists) return old
          return [...old, optimisticGeneration]
        }
      )
      
      // Also update the infinite query cache
      queryClient.setQueryData(
        ['generations', 'infinite', variables.sessionId],
        (old: InfiniteData<PaginatedGenerationsResponse> | undefined) => {
          if (!old || !old.pages.length) return undefined
          
          return {
            ...old,
            pages: old.pages.map((page, pageIndex) => {
              if (pageIndex === 0) {
                const exists = page.data.some(gen => gen.id === optimisticGeneration.id)
                if (exists) return page
                return { ...page, data: [...page.data, optimisticGeneration] }
              }
              return page
            }),
          }
        }
      )

      // Return context with previous state for rollback
      return { previousGenerations, optimisticId }
    },
    onSuccess: (data, variables, context) => {
      console.log(`[${data.id}] Generation mutation success - status: ${data.status}`)
      
      // If status is 'processing', trigger the background process endpoint from frontend
      // This is a fallback in case the server-side trigger fails (Vercel limitation)
      if (data.status === 'processing') {
        // Trigger background process after a short delay to ensure generation is in DB
        setTimeout(() => {
          console.log(`[${data.id}] Frontend fallback: Triggering background process`)
          fetch('/api/generate/process', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              generationId: data.id,
            }),
          })
          .then(async (res) => {
            if (res.ok) {
              console.log(`[${data.id}] Frontend trigger successful`)
            } else {
              const errorText = await res.text()
              console.warn(`[${data.id}] Frontend trigger failed: ${res.status} ${errorText}`)
            }
          })
          .catch((err) => {
            console.error(`[${data.id}] Frontend trigger error:`, err)
          })
        }, 500) // Wait 500ms for DB to be ready
      }
      
      // Helper to create the updated generation object
      const createUpdatedGeneration = (original: GenerationWithOutputs): GenerationWithOutputs => {
        if (data.status === 'processing') {
          return {
            ...original,
            id: data.id,
            status: 'processing' as const,
          }
        } else if (data.status === 'completed' && data.outputs) {
          return {
            ...original,
            id: data.id,
            status: 'completed' as const,
            outputs: data.outputs.map((output, index) => ({
              id: `${data.id}-${index}`,
              generationId: data.id,
              fileUrl: output.url,
              fileType: 'image' as const,
              width: output.width,
              height: output.height,
              duration: output.duration,
              isStarred: false,
              createdAt: new Date(),
            })),
          }
        } else if (data.status === 'failed') {
          return {
            ...original,
            id: data.id,
            status: 'failed' as const,
            parameters: {
              ...original.parameters,
              error: data.error,
            },
          }
        }
        return original
      }
      
      // Update the regular generations cache
      queryClient.setQueryData<GenerationWithOutputs[]>(
        ['generations', variables.sessionId],
        (old) => {
          if (!old) return []
          return old.map((gen) => {
            if (gen.id === context?.optimisticId) {
              console.log('✓ Replacing optimistic generation:', context.optimisticId, '→', data.id)
              return createUpdatedGeneration(gen)
            }
            return gen
          })
        }
      )
      
      // Update the infinite generations cache
      queryClient.setQueryData(
        ['generations', 'infinite', variables.sessionId],
        (old: InfiniteData<PaginatedGenerationsResponse> | undefined) => {
          if (!old) return undefined
          
          return {
            ...old,
            pages: old.pages.map((page) => {
              const foundIndex = page.data.findIndex(gen => gen.id === context?.optimisticId)
              if (foundIndex !== -1) {
                console.log('✓ Replacing optimistic generation in infinite cache:', context.optimisticId, '→', data.id)
                const newData = [...page.data]
                newData[foundIndex] = createUpdatedGeneration(newData[foundIndex])
                return { ...page, data: newData }
              }
              return page
            }),
          }
        }
      )
      
      // DON'T invalidate - rely on optimistic updates, real-time subscriptions, and polling
      // This prevents the race condition where invalidation refetches and overwrites the processing state
    },
    onError: (error: Error, variables, context) => {
      console.error('Generation failed:', error)
      
      // Update the optimistic generation to show the error in both caches
      queryClient.setQueryData<GenerationWithOutputs[]>(
        ['generations', variables.sessionId],
        (old) => {
          if (!old) return []
          
          return old.map((gen) => {
            if (gen.id === context?.optimisticId) {
              return {
                ...gen,
                status: 'failed' as const,
                parameters: {
                  ...gen.parameters,
                  error: error.message,
                },
              }
            }
            return gen
          })
        }
      )
      
      // Also update the infinite query cache so errors persist
      queryClient.setQueryData(
        ['generations', 'infinite', variables.sessionId],
        (old: InfiniteData<PaginatedGenerationsResponse> | undefined) => {
          if (!old) return undefined
          
          return {
            ...old,
            pages: old.pages.map((page) => {
              const foundIndex = page.data.findIndex(gen => gen.id === context?.optimisticId)
              if (foundIndex !== -1) {
                const newData = [...page.data]
                newData[foundIndex] = {
                  ...newData[foundIndex],
                  status: 'failed' as const,
                  parameters: {
                    ...newData[foundIndex].parameters,
                    error: error.message,
                  },
                }
                return { ...page, data: newData }
              }
              return page
            }),
          }
        }
      )
    },
  })
}

