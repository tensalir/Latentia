/**
 * MCP `resources/list` + `resources/read` for Vesper.
 * URI scheme: vesper://product-renders, vesper://models, vesper://skill/genai-prompting
 */

import { getAllModels } from '@/lib/models/registry'
import { listProductRenders } from './list-product-renders'
import { getGenAiSkillResourceText } from './mcp-prompts'

export interface McpResourceDefinition {
  uri: string
  name: string
  description: string
  mimeType: string
}

export const MCP_RESOURCE_CATALOG: McpResourceDefinition[] = [
  {
    uri: 'vesper://product-renders',
    name: 'Loop product renders',
    description:
      'Catalog of Switch, Engage, Quiet, Experience, Dream, Eclipse, Aphrodite and other Loop product renders. Use ids in generate_asset.productRenderIds.',
    mimeType: 'application/json',
  },
  {
    uri: 'vesper://models',
    name: 'Vesper model catalog',
    description:
      'Image and video models with capabilities, aspect ratios, parameters, and pricing hints.',
    mimeType: 'application/json',
  },
  {
    uri: 'vesper://skill/genai-prompting',
    name: 'Gen-AI prompting skill',
    description:
      'The Loop Gen-AI prompting skill substrate used by enhance_prompt and iterate_prompt.',
    mimeType: 'text/markdown',
  },
]

export async function readMcpResource(
  uri: string,
  principal: { allowedModels: string[] }
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
  if (uri === 'vesper://product-renders') {
    const renders = await listProductRenders({})
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({ renders, total: renders.length }, null, 2),
        },
      ],
    }
  }

  if (uri === 'vesper://models') {
    const all = getAllModels().map((config) => ({
      id: config.id,
      name: config.name,
      provider: config.provider,
      type: config.type,
      description: config.description,
      capabilities: config.capabilities ?? {},
      supportedAspectRatios: config.supportedAspectRatios ?? [],
      defaultAspectRatio: config.defaultAspectRatio,
      maxResolution: config.maxResolution,
      parameters: config.parameters ?? [],
      pricing: config.pricing ?? null,
    }))
    const wildcard = principal.allowedModels.includes('*')
    const visible = wildcard
      ? all
      : all.filter((m) => principal.allowedModels.includes(m.id))
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({ models: visible, total: visible.length }, null, 2),
        },
      ],
    }
  }

  if (uri === 'vesper://skill/genai-prompting') {
    return {
      contents: [
        {
          uri,
          mimeType: 'text/markdown',
          text: getGenAiSkillResourceText(),
        },
      ],
    }
  }

  throw new Error(`Unknown resource URI: ${uri}`)
}
