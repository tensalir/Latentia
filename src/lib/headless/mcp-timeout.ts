import { getModelConfig } from '@/lib/models/registry'
import { PHASE_1_MODEL_IDS } from './model-allowlists'

/** Sync image models: allow Vertex/Gemini retries under load. */
const DEFAULT_SYNC_IMAGE_TIMEOUT_MS = 120_000

/** Fast OpenAI / Replicate-direct models. */
const FAST_MODEL_TIMEOUT_MS = 90_000

const FAST_MODEL_IDS = new Set([
  'openai-gpt-image-2',
  'replicate-seedream-4',
  'replicate-reve',
  'replicate-nano-banana-pro',
])

/**
 * Model-aware MCP generation timeout. Must stay below Vercel `maxDuration`
 * (300s on MCP routes) and ideally below client MCP tool-call walls when
 * using synchronous `generate_asset`.
 */
export function getMcpGenerationTimeoutMs(modelId: string): number {
  if (!(PHASE_1_MODEL_IDS as readonly string[]).includes(modelId)) {
    const config = getModelConfig(modelId)
    if (config?.type === 'video') return 30_000
  }
  if (FAST_MODEL_IDS.has(modelId)) return FAST_MODEL_TIMEOUT_MS
  return DEFAULT_SYNC_IMAGE_TIMEOUT_MS
}
