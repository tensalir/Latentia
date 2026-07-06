import { getModelConfig } from '@/lib/models/registry'

/**
 * Preflight cost estimate for MCP `estimate_generation_cost` / enriched list_models.
 */
export function estimateGenerationCostUsd(input: {
  modelId: string
  numOutputs?: number
  durationSeconds?: number
}): number | null {
  const config = getModelConfig(input.modelId)
  if (!config?.pricing) return null

  const count = Math.max(1, input.numOutputs ?? 1)
  if (config.type === 'video' && config.pricing.perSecond != null) {
    const duration = Math.max(1, input.durationSeconds ?? 8)
    return config.pricing.perSecond * duration * count
  }
  if (config.pricing.perImage != null) {
    return config.pricing.perImage * count
  }
  return null
}
