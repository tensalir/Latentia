/**
 * Cost calculation utilities for different AI model providers
 * 
 * Pricing sources:
 * - Gemini: https://ai.google.dev/pricing (Nano Banana: ~$0.01/image, Veo 3.1: ~$0.05/second)
 * - Replicate: https://replicate.com/pricing (compute time based, varies by hardware)
 * - FAL.ai: Pay-per-use, typically similar to Replicate
 */

export interface CostCalculationResult {
  cost: number // Cost in USD
  unit: string // Unit description (e.g., "per image", "per second")
}

/**
 * Calculate cost for Gemini models
 */
export function calculateGeminiCost(
  modelId: string,
  outputCount: number = 1,
  videoDurationSeconds?: number
): CostCalculationResult {
  // Gemini Nano Banana Pro - Image generation
  if (modelId === 'gemini-nano-banana-pro') {
    // ~$0.01 per image (approximate, based on documentation)
    return {
      cost: 0.01 * outputCount,
      unit: `per image (${outputCount} image${outputCount > 1 ? 's' : ''})`,
    }
  }

  // Gemini Veo 3.1 - Video generation
  if (modelId === 'gemini-veo-3.1' || modelId.includes('veo')) {
    // ~$0.05 per second of video
    const duration = videoDurationSeconds || 8 // Default to 8 seconds if not specified
    return {
      cost: 0.05 * duration * outputCount,
      unit: `per second (${duration}s × ${outputCount} video${outputCount > 1 ? 's' : ''})`,
    }
  }

  // Default fallback for unknown Gemini models
  return {
    cost: 0,
    unit: 'unknown model',
  }
}

/**
 * Calculate cost for Replicate models
 * Note: Replicate charges based on actual compute time, which we'd need from the API response
 * This is an estimate based on typical generation times
 */
export function calculateReplicateCost(
  modelId: string,
  computeTimeSeconds?: number
): CostCalculationResult {
  // Estimate compute time if not provided (based on typical generation times)
  const estimatedTime = computeTimeSeconds || getEstimatedComputeTime(modelId)

  // Replicate pricing varies by hardware, but we'll use average rates
  // Seedream 4 typically runs on A10 or similar: ~$0.0005-0.001 per second
  // Using $0.00075 as average for Seedream 4
  if (modelId === 'replicate-seedream-4') {
    return {
      cost: 0.00075 * estimatedTime,
      unit: `compute time (${estimatedTime.toFixed(1)}s)`,
    }
  }

  // Reve model - similar pricing
  if (modelId === 'replicate-reve') {
    return {
      cost: 0.00075 * estimatedTime,
      unit: `compute time (${estimatedTime.toFixed(1)}s)`,
    }
  }

  // Default fallback
  return {
    cost: 0,
    unit: 'unknown model',
  }
}

/**
 * Get estimated compute time for Replicate models (in seconds)
 * Based on typical generation times observed in practice
 */
function getEstimatedComputeTime(modelId: string): number {
  if (modelId === 'replicate-seedream-4') {
    return 8 // ~8 seconds for Seedream 4 image generation
  }
  if (modelId === 'replicate-reve') {
    return 6 // ~6 seconds for Reve
  }
  return 10 // Default estimate
}

/**
 * Calculate cost for FAL.ai models
 */
export function calculateFalCost(
  modelId: string,
  computeTimeSeconds?: number
): CostCalculationResult {
  // FAL.ai pricing is similar to Replicate (compute time based)
  const estimatedTime = computeTimeSeconds || getEstimatedComputeTime(modelId)

  if (modelId === 'fal-seedream-v4') {
    // FAL.ai Seedream 4 - similar to Replicate pricing
    return {
      cost: 0.00075 * estimatedTime,
      unit: `compute time (${estimatedTime.toFixed(1)}s)`,
    }
  }

  return {
    cost: 0,
    unit: 'unknown model',
  }
}

/**
 * Calculate cost for a generation based on model ID
 */
export function calculateGenerationCost(
  modelId: string,
  options: {
    outputCount?: number
    videoDurationSeconds?: number
    computeTimeSeconds?: number
  } = {}
): CostCalculationResult {
  const { outputCount = 1, videoDurationSeconds, computeTimeSeconds } = options

  // Determine provider and calculate cost
  if (modelId.startsWith('gemini-') || modelId.includes('veo')) {
    return calculateGeminiCost(modelId, outputCount, videoDurationSeconds)
  }

  if (modelId.startsWith('replicate-')) {
    return calculateReplicateCost(modelId, computeTimeSeconds)
  }

  if (modelId.startsWith('fal-')) {
    return calculateFalCost(modelId, computeTimeSeconds)
  }

  // Unknown model
  return {
    cost: 0,
    unit: 'unknown model',
  }
}

/**
 * Format cost as currency string
 */
export function formatCost(cost: number): string {
  if (cost === 0) return '$0.00'
  if (cost < 0.01) return `$${cost.toFixed(6)}`
  if (cost < 1) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(2)}`
}

