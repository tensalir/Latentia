import { useModelConfig } from '@/hooks/useModels'

/**
 * Hook to get model capabilities with React Query caching.
 * Uses the centralized useModelConfig hook for consistent caching.
 */
export function useModelCapabilities(modelId: string) {
  const { data: modelConfig, isLoading } = useModelConfig(modelId)

  return {
    modelConfig,
    isLoading,
    supportedAspectRatios: modelConfig?.supportedAspectRatios || ['1:1', '16:9', '9:16', '4:3', '3:4'],
    maxResolution: modelConfig?.maxResolution || 2048,
    parameters: modelConfig?.parameters || [],
  }
}

