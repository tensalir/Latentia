import { useQuery } from '@tanstack/react-query'
import type { ModelConfig } from '@/lib/models/base'

interface ModelsResponse {
  models: ModelConfig[]
}

async function fetchModels(type?: 'image' | 'video'): Promise<ModelConfig[]> {
  const url = type ? `/api/models?type=${type}` : '/api/models'
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error('Failed to fetch models')
  }
  
  const data: ModelsResponse = await response.json()
  return data.models || []
}

async function fetchModelConfig(modelId: string): Promise<ModelConfig | null> {
  const response = await fetch(`/api/models/${modelId}`)
  
  if (!response.ok) {
    return null
  }
  
  return response.json()
}

/**
 * Hook to fetch all models with React Query caching.
 * Models data is static and rarely changes, so we use a long staleTime.
 */
export function useModels(type?: 'image' | 'video') {
  return useQuery({
    queryKey: ['models', type || 'all'],
    queryFn: () => fetchModels(type),
    staleTime: 10 * 60 * 1000, // 10 minutes - models rarely change
    gcTime: 60 * 60 * 1000, // 1 hour - keep in cache
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })
}

/**
 * Hook to fetch a specific model's configuration with React Query caching.
 * Uses the models list cache when available to avoid extra requests.
 */
export function useModelConfig(modelId: string | undefined) {
  return useQuery({
    queryKey: ['model-config', modelId],
    queryFn: () => fetchModelConfig(modelId!),
    enabled: !!modelId,
    staleTime: 10 * 60 * 1000, // 10 minutes - model configs rarely change
    gcTime: 60 * 60 * 1000, // 1 hour - keep in cache
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })
}

/**
 * Utility to get a model from the cached models list.
 * Use this when you already have the models list loaded.
 */
export function findModelInList(models: ModelConfig[] | undefined, modelId: string): ModelConfig | undefined {
  return models?.find(m => m.id === modelId)
}
