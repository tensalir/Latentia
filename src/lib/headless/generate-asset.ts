/**
 * `generate_asset` MCP tool.
 *
 * Synchronous fast image models by default; optional async job queue for
 * slow runs. Returns inline image blocks by default plus Storage URLs.
 */

import { randomUUID } from 'node:crypto'
import { HeadlessGenerateAssetSchema } from '@/lib/api/validation'
import { getModel, getModelConfig } from '@/lib/models/registry'
import type { GenerationRequest } from '@/lib/models/base'
import { uploadBase64ToStorage, uploadUrlToStorage } from '@/lib/supabase/storage'
import { resolveProductRenders } from './list-product-renders'
import { getMcpGenerationTimeoutMs } from './mcp-timeout'
import {
  MCP_INLINE_IMAGE_MAX_BYTES,
  type McpProgressReporter,
} from './mcp-progress'
import { estimateGenerationCostUsd } from './estimate-cost'
import { createHeadlessMcpJob } from './mcp-jobs'
import { PHASE_1_MODEL_IDS } from './model-allowlists'

export { PHASE_1_MODEL_IDS, type Phase1ModelId } from './model-allowlists'

type McpContentAnnotations = {
  audience?: Array<'user' | 'assistant'>
  priority?: number
}

type McpTextContent = {
  type: 'text'
  text: string
  annotations?: McpContentAnnotations
}
type McpImageContent = {
  type: 'image'
  data: string
  mimeType: string
  annotations?: McpContentAnnotations
}
type McpResourceLinkContent = {
  type: 'resource_link'
  uri: string
  name: string
  mimeType?: string
  description?: string
  annotations?: McpContentAnnotations
}
export type McpContent = McpTextContent | McpImageContent | McpResourceLinkContent

export interface GenerateAssetResult {
  content: McpContent[]
  structuredContent: {
    modelId: string
    requestedModelId?: string
    effectiveModelId?: string
    provider?: string
    isFallback?: boolean
    routeReason?: string | null
    jobId?: string
    status?: string
    outputs: Array<{
      url: string
      width: number
      height: number
      mimeType: string
    }>
    durationMs: number
    estimatedCostUsd: number | null
  }
  costUsd: number | null
}

interface CallerPrincipal {
  allowedModels: string[]
  credentialId: string
  ownerId: string
  progress?: McpProgressReporter
}

const STORAGE_BUCKET = 'generated-images'

function extensionForMime(mimeType: string | null | undefined): string {
  switch ((mimeType || '').toLowerCase()) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    case 'image/png':
      return 'png'
    default:
      return 'png'
  }
}

async function probeMimeType(url: string): Promise<string> {
  if (url.startsWith('data:')) {
    const match = url.match(/^data:([^;,]+)/)
    if (match) return match[1]
    return 'image/png'
  }
  try {
    const res = await fetch(url, { method: 'HEAD' })
    const ct = res.headers.get('content-type')?.split(';')[0]?.trim() || ''
    if (ct.startsWith('image/')) return ct
  } catch {
    // fall through
  }
  const m = url.toLowerCase().match(/\.(png|jpe?g|webp|gif)(?:[?#]|$)/)
  if (m) {
    return m[1] === 'jpg' || m[1] === 'jpeg' ? 'image/jpeg' : `image/${m[1]}`
  }
  return 'image/png'
}

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

async function inlineImageFromUrl(
  url: string
): Promise<{ data: string; mimeType: string; bytes: number }> {
  if (url.startsWith('data:')) {
    const commaIndex = url.indexOf(',')
    if (commaIndex < 0) throw new Error('Malformed data URL from upstream')
    const meta = url.slice(0, commaIndex)
    const data = url.slice(commaIndex + 1)
    const mimeMatch = meta.match(/^data:([^;]+)/)
    const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream'
    return {
      data,
      mimeType,
      bytes: Math.floor((data.length * 3) / 4),
    }
  }

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch reference image (HTTP ${res.status}).`)
  }
  const buf = await res.arrayBuffer()
  const data = Buffer.from(buf).toString('base64')
  let mimeType = res.headers.get('content-type')?.split(';')[0]?.trim() || ''
  if (!mimeType.startsWith('image/')) {
    const m = url.toLowerCase().match(/\.(png|jpe?g|webp|gif)(?:[?#]|$)/)
    if (m) {
      mimeType = m[1] === 'jpg' || m[1] === 'jpeg' ? 'image/jpeg' : `image/${m[1]}`
    } else {
      mimeType = 'image/png'
    }
  }
  return { data, mimeType, bytes: buf.byteLength }
}

async function normalizeReferenceInput(
  referenceImage: string | undefined
): Promise<string | undefined> {
  if (!referenceImage) return undefined
  if (referenceImage.startsWith('data:')) return referenceImage
  if (referenceImage.startsWith('http://') || referenceImage.startsWith('https://')) {
    const inlined = await inlineImageFromUrl(referenceImage)
    return `data:${inlined.mimeType};base64,${inlined.data}`
  }
  throw new Error(
    'referenceImage must be a data URL or https URL (e.g. a prior Vesper Storage link).'
  )
}

export async function generateAssetTool(
  args: Record<string, unknown>,
  principal: CallerPrincipal
): Promise<GenerateAssetResult> {
  const startedAt = Date.now()
  const progress = principal.progress

  const parsed = HeadlessGenerateAssetSchema.safeParse(args)
  if (!parsed.success) {
    throw new Error(
      `Invalid arguments: ${parsed.error.issues.map((i) => i.message).join('; ')}`
    )
  }

  const {
    prompt,
    modelId,
    aspectRatio,
    referenceImage,
    productRenderIds,
    numOutputs,
    seed,
    inlineBase64,
    allowFallback,
    async: runAsync,
  } = parsed.data

  if (runAsync) {
    progress?.step('Queueing async job')
    const job = await createHeadlessMcpJob({
      credentialId: principal.credentialId,
      ownerId: principal.ownerId,
      toolName: 'generate_asset',
      modelId,
      request: args,
    })
    return {
      content: [
        {
          type: 'text',
          text: `Generation queued as job ${job.id}. Poll get_generation_status with this jobId until status is completed.`,
          annotations: { audience: ['user'], priority: 0.9 },
        },
      ],
      structuredContent: {
        modelId,
        jobId: job.id,
        status: 'queued',
        outputs: [],
        durationMs: Date.now() - startedAt,
        estimatedCostUsd: estimateGenerationCostUsd({ modelId, numOutputs }),
      },
      costUsd: null,
    }
  }

  const generationId = randomUUID()

  if (!(PHASE_1_MODEL_IDS as readonly string[]).includes(modelId)) {
    const config = getModelConfig(modelId)
    if (config?.type === 'video') {
      throw new Error(
        `Video model '${modelId}' requires generate_video with async polling, not generate_asset.`
      )
    }
    throw new Error(
      `Model '${modelId}' is not yet available via generate_asset. Allowed: ${PHASE_1_MODEL_IDS.join(', ')}.`
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

  progress?.step('Resolving references')

  const renderRefs: string[] = []
  if (productRenderIds && productRenderIds.length > 0) {
    const rows = await resolveProductRenders(productRenderIds)
    const inlinedRefs = await Promise.all(
      rows.map(async (row) => {
        const inlined = await inlineImageFromUrl(row.imageUrl)
        return `data:${inlined.mimeType};base64,${inlined.data}`
      })
    )
    renderRefs.push(...inlinedRefs)
  }

  const normalizedRef = await normalizeReferenceInput(referenceImage)
  const allRefs: string[] = []
  if (normalizedRef) allRefs.push(normalizedRef)
  allRefs.push(...renderRefs)

  if (allRefs.length > 4) {
    throw new Error(
      `Too many reference images (${allRefs.length}). Cap is 4 across referenceImage + productRenderIds.`
    )
  }

  const config = getModelConfig(modelId)
  const supportsMulti = !!config?.capabilities?.multiImageEditing
  let referenceImagePayload: string | undefined
  let referenceImagesPayload: string[] | undefined
  if (allRefs.length === 1) {
    referenceImagePayload = allRefs[0]
  } else if (allRefs.length > 1) {
    if (!supportsMulti) {
      throw new Error(
        `Model '${modelId}' only supports one reference image. Pick gemini-nano-banana-pro for multi-image.`
      )
    }
    referenceImagesPayload = allRefs
  }

  const request: GenerationRequest = {
    prompt,
    numOutputs,
    allowFallback: allowFallback !== false,
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(referenceImagePayload ? { referenceImage: referenceImagePayload } : {}),
    ...(referenceImagesPayload ? { referenceImages: referenceImagesPayload } : {}),
    ...(typeof seed === 'number' ? { seed } : {}),
  }

  progress?.step('Generating image')

  const timeoutMs = getMcpGenerationTimeoutMs(modelId)
  const generation = await withTimeout(
    adapter.generate(request),
    timeoutMs,
    `Generation timed out after ${Math.floor(timeoutMs / 1000)}s. Pass async: true and poll get_generation_status, or try a faster model.`
  )

  if (generation.status !== 'completed' || !generation.outputs?.length) {
    throw new Error(generation.error || 'Generation did not complete')
  }

  progress?.step('Uploading to Storage')

  const persisted = await Promise.all(
    generation.outputs.map(async (output, idx) => {
      const mimeType = await probeMimeType(output.url)
      const ext = extensionForMime(mimeType)
      const path = `mcp/${principal.credentialId}/${generationId}/${idx}.${ext}`
      const storedUrl = output.url.startsWith('data:')
        ? await uploadBase64ToStorage(output.url, STORAGE_BUCKET, path)
        : await uploadUrlToStorage(output.url, STORAGE_BUCKET, path)
      return {
        url: storedUrl,
        width: output.width,
        height: output.height,
        mimeType,
        path,
      }
    })
  )

  const meta = generation.metadata ?? {}
  const provider =
    typeof meta.backend === 'string'
      ? meta.backend
      : typeof meta.provider === 'string'
        ? meta.provider
        : config?.provider?.toLowerCase()
  const isFallback = Boolean(meta.isFallback)
  const routeReason =
    typeof meta.routeReason === 'string' ? meta.routeReason : null
  const effectiveModelId =
    typeof meta.effectiveModelId === 'string' ? meta.effectiveModelId : modelId

  const estimatedCostUsd = estimateGenerationCostUsd({ modelId, numOutputs: persisted.length })

  const dimensionsSummary = persisted.map((o) => `${o.width}x${o.height}`).join(', ')
  const urlsLine =
    persisted.length === 1
      ? `View: ${persisted[0].url}`
      : `View:\n${persisted.map((o, idx) => `${idx + 1}. ${o.url}`).join('\n')}`

  let summary = `Generated ${persisted.length} image${persisted.length === 1 ? '' : 's'} with ${modelId} (${dimensionsSummary}). ${urlsLine}`
  if (isFallback && provider) {
    summary += `\nNote: routed via ${provider} fallback${routeReason ? ` (${routeReason})` : ''}. Pass allowFallback: false to require the primary provider.`
  }
  summary = progress?.appendToSummary(summary) ?? summary

  const content: McpContent[] = [
    {
      type: 'text',
      text: summary,
      annotations: { audience: ['user'], priority: 0.9 },
    },
  ]

  for (let idx = 0; idx < persisted.length; idx++) {
    const out = persisted[idx]
    content.push({
      type: 'resource_link',
      uri: out.url,
      name: `${modelId}-${out.width}x${out.height}-${idx}.${extensionForMime(out.mimeType)}`,
      mimeType: out.mimeType,
      description: `Image ${idx + 1} of ${persisted.length} from ${modelId}`,
      annotations: { audience: ['user'], priority: 0.85 },
    })
  }

  const includeInline = inlineBase64 !== false
  if (includeInline) {
    const inlined = await Promise.all(
      persisted.map((out) => inlineImageFromUrl(out.url))
    )
    for (const img of inlined) {
      if (img.bytes > MCP_INLINE_IMAGE_MAX_BYTES) {
        content.push({
          type: 'text',
          text: `Inline preview omitted (${Math.round(img.bytes / 1024)} KB exceeds MCP inline cap). Use the URL above or set inlineBase64: false.`,
          annotations: { audience: ['user'], priority: 0.5 },
        })
        continue
      }
      content.push({
        type: 'image',
        data: img.data,
        mimeType: img.mimeType,
        annotations: { audience: ['user'], priority: 0.95 },
      })
    }
  }

  return {
    content,
    structuredContent: {
      modelId,
      requestedModelId: modelId,
      effectiveModelId,
      provider,
      isFallback,
      routeReason,
      outputs: persisted.map((o) => ({
        url: o.url,
        width: o.width,
        height: o.height,
        mimeType: o.mimeType,
      })),
      durationMs: Date.now() - startedAt,
      estimatedCostUsd,
    },
    costUsd: estimatedCostUsd,
  }
}
