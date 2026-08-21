/**
 * `generate_video` MCP tool — async-first video generation (Veo, Kling, etc.).
 */

import { randomUUID } from 'node:crypto'
import { HeadlessGenerateVideoSchema } from '@/lib/api/validation'
import { getModel, getModelConfig } from '@/lib/models/registry'
import type { GenerationRequest } from '@/lib/models/base'
import { uploadUrlToStorage } from '@/lib/supabase/storage'
import type { McpContent, GenerateAssetResult } from './generate-asset'
import { getMcpGenerationTimeoutMs } from './mcp-timeout'
import type { McpProgressReporter } from './mcp-progress'
import { estimateGenerationCostUsd } from './estimate-cost'

import { VIDEO_MODEL_IDS } from './model-allowlists'

export { VIDEO_MODEL_IDS } from './model-allowlists'

const STORAGE_BUCKET = 'generated-images'

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

export type GenerateVideoResult = Omit<GenerateAssetResult, 'structuredContent'> & {
  structuredContent: {
    modelId: string
    outputs: Array<{
      url: string
      width: number
      height: number
      mimeType: string
      duration?: number
    }>
    durationMs: number
    estimatedCostUsd: number | null
    provider?: string
    isFallback?: boolean
    routeReason?: string | null
  }
}

interface CallerPrincipal {
  allowedModels: string[]
  credentialId: string
  ownerId: string
  progress?: McpProgressReporter
}

export async function generateVideoTool(
  args: Record<string, unknown>,
  principal: CallerPrincipal
): Promise<GenerateVideoResult> {
  const startedAt = Date.now()
  const progress = principal.progress

  const parsed = HeadlessGenerateVideoSchema.safeParse(args)
  if (!parsed.success) {
    throw new Error(
      `Invalid arguments: ${parsed.error.issues.map((i) => i.message).join('; ')}`
    )
  }

  const {
    prompt,
    modelId,
    aspectRatio,
    duration,
    resolution,
    referenceImage,
    referenceImageUrls,
    referenceVideoUrls,
    referenceAudioUrls,
    allowFallback,
  } = parsed.data

  if (!(VIDEO_MODEL_IDS as readonly string[]).includes(modelId)) {
    throw new Error(
      `Model '${modelId}' is not available for MCP video. Allowed: ${VIDEO_MODEL_IDS.join(', ')}.`
    )
  }

  if (
    principal.allowedModels.length > 0 &&
    !principal.allowedModels.includes('*') &&
    !principal.allowedModels.includes(modelId)
  ) {
    throw new Error(`This token is not permitted to use model '${modelId}'.`)
  }

  const adapter = getModel(modelId)
  if (!adapter) throw new Error(`Unknown model '${modelId}'.`)

  progress?.step('Submitting video generation')

  const request: GenerationRequest = {
    prompt,
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(typeof duration === 'number' ? { duration } : {}),
    ...(typeof resolution === 'number' ? { resolution } : {}),
    ...(referenceImage ? { referenceImage } : {}),
    // Reference sets reach the adapter via `parameters`, matching how the
    // web app passes them through the generation record.
    ...(referenceImageUrls?.length || referenceVideoUrls?.length || referenceAudioUrls?.length
      ? {
          parameters: {
            ...(referenceImageUrls?.length ? { referenceImageUrls } : {}),
            ...(referenceVideoUrls?.length ? { referenceVideoUrls } : {}),
            ...(referenceAudioUrls?.length ? { referenceAudioUrls } : {}),
          },
        }
      : {}),
    allowFallback: allowFallback !== false,
  }

  const timeoutMs = getMcpGenerationTimeoutMs(modelId) * 2

  const generation = await withTimeout(
    adapter.generate(request),
    timeoutMs,
    `Video generation timed out after ${Math.floor(timeoutMs / 1000)}s. Pass async: true and poll get_generation_status for long renders.`
  )

  if (generation.status !== 'completed' || !generation.outputs?.length) {
    throw new Error(generation.error || 'Video generation did not complete')
  }

  progress?.step('Persisting video')

  const generationId = randomUUID()
  const persisted = await Promise.all(
    generation.outputs.map(async (output, idx) => {
      const path = `mcp/${principal.credentialId}/${generationId}/${idx}.mp4`
      const storedUrl = output.url.startsWith('data:')
        ? output.url
        : await uploadUrlToStorage(output.url, STORAGE_BUCKET, path)
      return {
        url: storedUrl,
        width: output.width,
        height: output.height,
        duration: output.duration,
        mimeType: 'video/mp4',
      }
    })
  )

  const meta = generation.metadata ?? {}
  const config = getModelConfig(modelId)
  const estimatedCostUsd =
    estimateGenerationCostUsd({
      modelId,
      numOutputs: persisted.length,
      durationSeconds: duration ?? 8,
    }) ?? null

  const provider = typeof meta.backend === 'string' ? meta.backend : config?.provider?.toLowerCase()
  const isFallback = Boolean(meta.isFallback)
  const routeReason =
    typeof meta.routeReason === 'string' ? meta.routeReason : null

  const summaryParts = [
    `Generated ${persisted.length} video${persisted.length === 1 ? '' : 's'} with ${modelId}.`,
    provider ? `Provider: ${provider}${isFallback ? ' (fallback)' : ''}.` : '',
    routeReason ? `Route: ${routeReason}.` : '',
    `View: ${persisted[0].url}`,
  ].filter(Boolean)

  const content: McpContent[] = [
    {
      type: 'text',
      text: summaryParts.join(' '),
      annotations: { audience: ['user'], priority: 0.9 },
    },
    ...persisted.map((out, idx) => ({
      type: 'resource_link' as const,
      uri: out.url,
      name: `${modelId}-video-${idx}.mp4`,
      mimeType: out.mimeType,
      description: `Video ${idx + 1} from ${modelId}`,
      annotations: { audience: ['user' as const], priority: 0.85 },
    })),
  ]

  return {
    content,
    structuredContent: {
      modelId,
      outputs: persisted,
      durationMs: Date.now() - startedAt,
      estimatedCostUsd,
      provider,
      isFallback,
      routeReason,
    },
    costUsd: estimatedCostUsd,
  }
}
