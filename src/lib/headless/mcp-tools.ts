/**
 * MCP tool definitions for the Vesper headless surface.
 */

import type { HeadlessTool } from './auth'
import { PHASE_1_MODEL_IDS, VIDEO_MODEL_IDS } from './model-allowlists'

export interface McpToolAnnotations {
  title?: string
  readOnlyHint?: boolean
  destructiveHint?: boolean
  openWorldHint?: boolean
}

export interface McpToolDefinition {
  name: HeadlessTool
  title: string
  description: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  annotations?: McpToolAnnotations
}

const generateAssetOutputSchema = {
  type: 'object',
  properties: {
    modelId: { type: 'string' },
    requestedModelId: { type: 'string' },
    effectiveModelId: { type: 'string' },
    provider: { type: 'string' },
    isFallback: { type: 'boolean' },
    routeReason: { type: ['string', 'null'] },
    jobId: { type: 'string' },
    status: { type: 'string' },
    outputs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          width: { type: 'number' },
          height: { type: 'number' },
          mimeType: { type: 'string' },
        },
      },
    },
    durationMs: { type: 'number' },
    estimatedCostUsd: { type: ['number', 'null'] },
  },
}

export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'enhance_prompt',
    title: 'Enhance a generation prompt',
    description:
      'Enhance a single image or video prompt using the Vesper Gen-AI prompting skill. Returns the enhanced prompt text and the substrate version used.',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['prompt', 'modelId'],
      properties: {
        prompt: { type: 'string', minLength: 1, maxLength: 8000 },
        modelId: { type: 'string' },
        referenceImage: {
          type: 'string',
          description: 'Optional data URL or https URL of a reference image.',
        },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        enhancedPrompt: { type: 'string' },
        modelId: { type: 'string' },
        skill: { type: 'object' },
      },
    },
  },
  {
    name: 'iterate_prompt',
    title: 'Build an Andromeda-aware prompt slate',
    description:
      'Produce a structured slate of variant prompts that preserve declared anchors while varying diversification axes.',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['prompt', 'modelId'],
      properties: {
        prompt: { type: 'string', minLength: 1, maxLength: 8000 },
        modelId: { type: 'string' },
        referenceImage: { type: 'string' },
        baselineOutputId: { type: 'string' },
        anchors: { type: 'object' },
        variantCount: { type: 'integer', minimum: 2, maximum: 8, default: 4 },
        lockedAxes: { type: 'array', items: { type: 'string' }, maxItems: 7 },
        preferredAxes: { type: 'array', items: { type: 'string' }, maxItems: 7 },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        slate: { type: 'object' },
        variantCount: { type: 'number' },
        modelId: { type: 'string' },
      },
    },
  },
  {
    name: 'list_models',
    title: 'List available Vesper models',
    description:
      'Return the catalog of models the credential may use, including capabilities, parameters, aspect ratios, and per-image cost hints.',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    outputSchema: {
      type: 'object',
      properties: {
        models: { type: 'array' },
        total: { type: 'number' },
        wildcardAccess: { type: 'boolean' },
      },
    },
  },
  {
    name: 'estimate_generation_cost',
    title: 'Estimate generation cost',
    description:
      'Preflight credit/cost estimate in USD for a model call before spending quota. Uses published per-image or per-second pricing from the model registry.',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['modelId'],
      properties: {
        modelId: { type: 'string' },
        numOutputs: { type: 'integer', minimum: 1, maximum: 4, default: 1 },
        durationSeconds: { type: 'integer', minimum: 1, maximum: 60 },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        modelId: { type: 'string' },
        estimatedCostUsd: { type: ['number', 'null'] },
      },
    },
  },
  {
    name: 'generate_asset',
    title: 'Generate an image',
    description:
      'Generate an image with a Vesper model. Returns inline image blocks by default plus Storage URLs for iteration. Pass async: true to queue a job when the client MCP timeout is tight (~60s). Pass allowFallback: false to forbid silent Replicate routing.',
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['prompt', 'modelId'],
      properties: {
        prompt: { type: 'string', minLength: 1, maxLength: 8000 },
        modelId: { type: 'string', enum: [...PHASE_1_MODEL_IDS] },
        aspectRatio: { type: 'string', maxLength: 16 },
        referenceImage: {
          type: 'string',
          description:
            'Optional style/composition anchor as data URL or https URL (e.g. a prior Vesper output).',
        },
        productRenderIds: {
          type: 'array',
          items: { type: 'string', format: 'uuid' },
          maxItems: 4,
        },
        numOutputs: { type: 'integer', minimum: 1, maximum: 4, default: 1 },
        seed: { type: 'integer' },
        inlineBase64: { type: 'boolean', default: true },
        allowFallback: { type: 'boolean', default: true },
        async: { type: 'boolean', default: false },
      },
    },
    outputSchema: generateAssetOutputSchema,
  },
  {
    name: 'generate_video',
    title: 'Generate a video',
    description:
      'Generate a short video with Veo or Kling. Defaults to async job queue — poll get_generation_status until completed.',
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['prompt', 'modelId'],
      properties: {
        prompt: { type: 'string', minLength: 1, maxLength: 8000 },
        modelId: { type: 'string', enum: [...VIDEO_MODEL_IDS] },
        aspectRatio: { type: 'string', maxLength: 16 },
        duration: { type: 'integer', minimum: 4, maximum: 15 },
        resolution: { type: 'integer' },
        referenceImage: { type: 'string' },
        allowFallback: { type: 'boolean', default: true },
        async: { type: 'boolean', default: true },
      },
    },
    outputSchema: generateAssetOutputSchema,
  },
  {
    name: 'get_generation_status',
    title: 'Poll async generation job',
    description:
      'Poll a queued/processing MCP generation job. Returns the final image or video payload when status is completed.',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['jobId'],
      properties: {
        jobId: { type: 'string', format: 'uuid' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        status: { type: 'string' },
        outputs: { type: 'array' },
      },
    },
  },
  {
    name: 'list_product_renders',
    title: 'List Loop product renders',
    description:
      'Discover Loop product render library entries. Pass ids to generate_asset.productRenderIds.',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string', maxLength: 128 },
        colorway: { type: 'string', maxLength: 128 },
        renderType: { type: 'string', enum: ['single', 'pair', 'case'] },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        renders: { type: 'array' },
        total: { type: 'number' },
      },
    },
  },
]

export function findMcpTool(name: string): McpToolDefinition | undefined {
  return MCP_TOOLS.find((t) => t.name === name)
}
