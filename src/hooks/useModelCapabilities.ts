import { useQuery } from '@tanstack/react-query'
import type { ModelConfig } from '@/lib/models/base'

async function fetchModelConfig(modelId: string): Promise<ModelConfig | null> {
  const response = await fetch(`/api/models/${modelId}`)
  
  if (!response.ok) {
    return null
  }
  
  return response.json()
}

export function useModelCapabilities(modelId: string) {
  const { data: modelConfig, isLoading } = useQuery({
    queryKey: ['model-config', modelId],
    queryFn: () => fetchModelConfig(modelId),
    enabled: !!modelId,
    staleTime: 5 * 60 * 1000, // 5 minutes - model configs don't change often
  })

  return {
    modelConfig,
    isLoading,
    supportedAspectRatios: modelConfig?.supportedAspectRatios || ['1:1', '16:9', '9:16', '4:3', '3:4'],
    maxResolution: modelConfig?.maxResolution || 2048,
    parameters: modelConfig?.parameters || [],
  }
}

